import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { ITransaction } from '@crane-technologies/database/dist/interfaces/ITransaction';
import { accountingQueries } from './accounting.queries';
import {
  SaleJournalParams,
  CogsJournalParams,
  PurchaseJournalParams,
  PaymentJournalParams,
  ExpenseJournalParams,
  PayrollJournalParams,
  ReturnJournalParams,
  NoteJournalParams,
  WithholdingJournalParams,
  JournalSettlement,
} from './interface/accounting.interface';

// Account codes from the NIIF PYMES template (Phase 1)
const ACCOUNTS = {
  CAJA_GENERAL: '1-1-001',
  BANCOS: '1-1-002',
  CUENTAS_POR_COBRAR: '1-1-003',
  IVA_CREDITO_FISCAL: '1-1-005',
  INVENTARIO: '1-1-007',
  CUENTAS_POR_PAGAR: '2-1-001',
  IVA_DEBITO_FISCAL: '2-1-003',
  INGRESOS_POR_VENTAS: '4-1-001',
  DESCUENTOS_SOBRE_VENTAS: '4-1-003',
  COSTO_DE_VENTAS: '6-1',
  RETENCIONES_POR_PAGAR: '2-1-004',
  ANTICIPOS_DE_CLIENTES: '2-1-008',
  DEVOLUCIONES_SOBRE_VENTAS: '4-1-002',
  SALARIOS_POR_PAGAR: '2-1-005',
  CARGAS_SOCIALES_POR_PAGAR: '2-1-006',
  SALARIOS_Y_SUELDOS: '5-1-001',
  IVA_CREDITO_FISCAL_GASTO: '1-1-005',
  // Respaldo para gastos sin codigo contable (categorias del tenant).
  OTROS_GASTOS_OPERATIVOS: '5-9-001',
} as const;

// general_schema.currency: el libro se lleva en bolivares (moneda funcional).
const VES = 1;
const USD = 2;

// general_schema.payment_method (seeds/catalog/general/009): efectivo va a
// Caja, puntos a Descuentos, "credito" no es un cobro (queda en CxC) y el
// resto (tarjetas, transferencia, pago movil) va a Bancos.
const CASH_PAYMENT_METHOD_ID = 1;
const LOYALTY_POINTS_PAYMENT_METHOD_ID = 4;
const CREDIT_PAYMENT_METHOD_ID = 5;

export interface SettlementPayment {
  payment_method_id: number;
  payment_amount: number;
  currency_id?: number | null;
  is_points_redemption?: boolean;
}

type Line = { accountId: string; debit: number; credit: number; desc: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class AccountingJournalService {
  private readonly logger = new Logger(AccountingJournalService.name);

  // In-memory cache per tenant per transaction (not persisted)
  private accountCache = new Map<string, string>();
  private sourceTypeCache = new Map<string, number>();
  private confirmedStatusId: number | null = null;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Corre un asiento "secundario" (el documento de negocio no debe fallar si
   * la contabilidad falla) dentro de un SAVEPOINT: un error SQL del asiento
   * revierte solo el asiento y deja la transaccion del documento usable. Sin
   * el savepoint, cualquier error SQL abortaba la transaccion completa.
   */
  async trySecondary<T>(
    txn: ITransaction,
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const savepoint = `acct_${Math.random().toString(36).slice(2, 10)}`;
    await txn.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await fn();
      await txn.query(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await txn.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      this.logger.error(
        `Asiento contable omitido (${label}): ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Copia el plan de cuentas de la plantilla al tenant si aun no lo tiene.
   * Idempotente. Se llama al crear el tenant y, para tenants creados antes,
   * la primera vez que se necesita una cuenta: sin plan de cuentas ningun
   * asiento se podia registrar (FNZ-X-04).
   */
  async ensureTenantAccounts(
    tenantId: string,
    txn: ITransaction,
  ): Promise<void> {
    const { rows } = await txn.query(accountingQueries.tenantHasAccounts, [
      tenantId,
    ]);
    if (rows.length) return;
    // provision_tenant_accounts es idempotente (0 si ya tiene cuentas): varias
    // resoluciones en paralelo pueden llegar aqui a la vez sin duplicar nada.
    const { rows: created } = await txn.query(
      accountingQueries.provisionTenantAccounts,
      [tenantId],
    );
    if (Number(created[0]?.accounts_created) > 0) {
      this.logger.log(`Plan de cuentas provisionado para tenant ${tenantId}`);
    }
  }

  /**
   * Resolves an account_code to its account_id for a given tenant.
   * Uses a per-request cache to avoid repeated lookups within the same call chain.
   */
  private async resolveAccount(
    tenantId: string,
    accountCode: string,
    txn: ITransaction,
  ): Promise<string> {
    const cacheKey = `${tenantId}:${accountCode}`;
    const cached = this.accountCache.get(cacheKey);
    if (cached) return cached;

    let { rows } = await txn.query(accountingQueries.getAccountByCode, [
      tenantId,
      accountCode,
    ]);

    if (!rows.length) {
      await this.ensureTenantAccounts(tenantId, txn);
      ({ rows } = await txn.query(accountingQueries.getAccountByCode, [
        tenantId,
        accountCode,
      ]));
    }

    if (!rows.length) {
      throw new Error(
        `Cuenta contable '${accountCode}' no encontrada para tenant ${tenantId}.`,
      );
    }

    const accountId = rows[0].account_id;
    this.accountCache.set(cacheKey, accountId);
    return accountId;
  }

  /**
   * Cuenta de gasto de la categoria; si no tiene codigo o ese codigo no
   * existe en el plan de cuentas del tenant, "Otros Gastos Operativos".
   */
  private async resolveExpenseAccount(
    tenantId: string,
    accountCode: string | null | undefined,
    txn: ITransaction,
  ): Promise<string> {
    if (accountCode) {
      try {
        return await this.resolveAccount(tenantId, accountCode, txn);
      } catch {
        this.logger.warn(
          `Cuenta de gasto '${accountCode}' no existe para tenant ${tenantId}: se usa ${ACCOUNTS.OTROS_GASTOS_OPERATIVOS}`,
        );
      }
    }
    return this.resolveAccount(tenantId, ACCOUNTS.OTROS_GASTOS_OPERATIVOS, txn);
  }

  private async resolveSourceType(
    sourceName: string,
    txn: ITransaction,
  ): Promise<number> {
    const cached = this.sourceTypeCache.get(sourceName);
    if (cached) return cached;

    const { rows } = await txn.query(accountingQueries.getSourceTypeByName, [
      sourceName,
    ]);

    if (!rows.length) {
      throw new Error(`Tipo de fuente '${sourceName}' no encontrado`);
    }

    const id = rows[0].source_type_id;
    this.sourceTypeCache.set(sourceName, id);
    return id;
  }

  private async getConfirmedStatusId(txn: ITransaction): Promise<number> {
    if (this.confirmedStatusId !== null) return this.confirmedStatusId;

    const { rows } = await txn.query(accountingQueries.getConfirmedStatusId);
    if (!rows.length) throw new Error('Status Confirmado no encontrado');
    const id: number = rows[0].status_id;
    this.confirmedStatusId = id;
    return id;
  }

  /** Tasa USD -> VES del tenant en la fecha del documento (1 si es VES). */
  private async rateFor(
    tenantId: string,
    currencyId: number,
    entryDate: Date,
    txn: ITransaction,
  ): Promise<number> {
    if (currencyId === VES) return 1;
    // ISO en UTC: las columnas timestamp guardan hora UTC.
    const { rows } = await txn.query(accountingQueries.exchangeRateAt, [
      tenantId,
      entryDate.toISOString(),
    ]);
    const rate = Number(rows[0]?.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(
        `Sin tasa de cambio para convertir a VES el asiento del ${entryDate.toISOString()}`,
      );
    }
    return rate;
  }

  /**
   * Reparte lo cobrado en efectivo / bancos / puntos, en la moneda del
   * documento. Los pagos en otra moneda se convierten con la tasa de `at`; el
   * vuelto sale primero del efectivo (es lo que se devuelve en caja).
   */
  async buildSettlement(
    tenantId: string,
    documentCurrencyId: number,
    at: Date,
    payments: SettlementPayment[],
    changeAmount: number,
    txn: ITransaction,
  ): Promise<JournalSettlement> {
    const foreign = payments.some(
      (p) => (p.currency_id ?? documentCurrencyId) !== documentCurrencyId,
    );
    const rate = foreign ? await this.rateFor(tenantId, USD, at, txn) : 1;
    const toDocument = (amount: number, currencyId: number) => {
      if (currencyId === documentCurrencyId) return amount;
      return currencyId === USD ? amount * rate : amount / rate;
    };

    const settlement: JournalSettlement = { cash: 0, bank: 0, points: 0 };
    for (const p of payments) {
      const amount = toDocument(
        Number(p.payment_amount) || 0,
        p.currency_id ?? documentCurrencyId,
      );
      if (amount <= 0) continue;
      if (
        p.is_points_redemption ||
        p.payment_method_id === LOYALTY_POINTS_PAYMENT_METHOD_ID
      ) {
        settlement.points += amount;
      } else if (p.payment_method_id === CASH_PAYMENT_METHOD_ID) {
        settlement.cash += amount;
      } else if (p.payment_method_id !== CREDIT_PAYMENT_METHOD_ID) {
        settlement.bank += amount;
      }
    }

    let change = Math.max(Number(changeAmount) || 0, 0);
    const fromCash = Math.min(change, settlement.cash);
    settlement.cash -= fromCash;
    change -= fromCash;
    settlement.bank = Math.max(settlement.bank - change, 0);

    return {
      cash: round2(settlement.cash),
      bank: round2(settlement.bank),
      points: round2(settlement.points),
    };
  }

  /**
   * Creates a journal entry with lines, validates balance, and confirms atomically.
   * Must be called within an existing transaction.
   *
   * Los montos de `lines` vienen en `currencyId`; se registran en VES (moneda
   * funcional) con la tasa de entryDate. Tras convertir y redondear a
   * centimos, la diferencia de redondeo entre debe y haber se ajusta en la
   * linea mas grande del lado menor.
   */
  private async createEntry(
    tenantId: string,
    sourceTypeId: number,
    sourceId: string,
    entryDate: Date,
    description: string,
    lines: Line[],
    txn: ITransaction,
    currencyId: number = VES,
  ): Promise<string> {
    const rate = await this.rateFor(tenantId, currencyId, entryDate, txn);

    const converted = lines
      .map((l) => ({
        ...l,
        debit: round2(l.debit * rate),
        credit: round2(l.credit * rate),
      }))
      .filter((l) => l.debit > 0 || l.credit > 0);

    let totalDebit = round2(converted.reduce((s, l) => s + l.debit, 0));
    let totalCredit = round2(converted.reduce((s, l) => s + l.credit, 0));
    const diff = round2(totalDebit - totalCredit);

    if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.01 * converted.length) {
      const side: 'debit' | 'credit' = diff > 0 ? 'credit' : 'debit';
      const target = converted
        .filter((l) => l[side] > 0)
        .sort((a, b) => b[side] - a[side])[0];
      if (target) {
        target[side] = round2(target[side] + Math.abs(diff));
        totalDebit = round2(converted.reduce((s, l) => s + l.debit, 0));
        totalCredit = round2(converted.reduce((s, l) => s + l.credit, 0));
      }
    }

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(
        `Asiento desbalanceado: débitos=${totalDebit} créditos=${totalCredit}`,
      );
    }

    const statusId = await this.getConfirmedStatusId(txn);

    const { rows } = await txn.query(accountingQueries.createJournalEntryRaw, [
      tenantId,
      sourceTypeId,
      sourceId,
      entryDate,
      description,
      statusId,
      totalDebit,
      totalCredit,
      currencyId,
      rate,
    ]);
    const entryId = rows[0].entry_id;

    await txn.bulkInsert(
      'accounting_schema.journal_entry_line',
      [
        'entry_id',
        'account_id',
        'debit_amount',
        'credit_amount',
        'description',
      ],
      converted.map((l) => [entryId, l.accountId, l.debit, l.credit, l.desc]),
    );

    return entryId;
  }

  /**
   * Lineas de debito por lo cobrado: efectivo -> Caja, medios electronicos ->
   * Bancos, puntos -> Descuentos sobre Ventas.
   */
  private async settlementLines(
    tenantId: string,
    settlement: JournalSettlement,
    txn: ITransaction,
  ): Promise<Line[]> {
    const [cashId, bankId, discountId] = await Promise.all([
      this.resolveAccount(tenantId, ACCOUNTS.CAJA_GENERAL, txn),
      this.resolveAccount(tenantId, ACCOUNTS.BANCOS, txn),
      this.resolveAccount(tenantId, ACCOUNTS.DESCUENTOS_SOBRE_VENTAS, txn),
    ]);
    return [
      {
        accountId: cashId,
        debit: round2(settlement.cash),
        credit: 0,
        desc: 'Cobro en efectivo',
      },
      {
        accountId: bankId,
        debit: round2(settlement.bank),
        credit: 0,
        desc: 'Cobro por medios electrónicos (tarjeta, transferencia, pago móvil)',
      },
      {
        accountId: discountId,
        debit: round2(settlement.points),
        credit: 0,
        desc: 'Pago con puntos de fidelidad',
      },
    ];
  }

  // -------------------------------------------------------
  // PUBLIC METHODS — called by Sale/Purchase services
  // -------------------------------------------------------

  /**
   * Generates the revenue journal entry for a sale.
   *
   *   Debit  Caja / Bancos / Descuentos → lo cobrado al registrar la venta
   *   Debit  Cuentas x Cobrar           → total - cobrado (credito, apartado,
   *                                       abono inicial parcial)
   *   Credit Ingresos x Venta           → subtotal_amount
   *   Credit IVA Débito Fiscal          → tax_amount
   */
  async generateSaleJournal(
    params: SaleJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const {
      tenantId,
      saleId,
      saleCondition,
      subtotalAmount,
      taxAmount,
      totalAmount,
      entryDate,
    } = params;

    const isCash = saleCondition === '01';
    const sourceName = isCash ? 'SALE_CASH' : 'SALE_CREDIT';

    // Sin detalle de cobro: contado = todo en caja, credito = todo en CxC.
    const settlement: JournalSettlement = {
      ...(params.settlement ?? {
        cash: isCash ? totalAmount : 0,
        bank: 0,
        points: 0,
      }),
    };
    // Lo cobrado nunca puede superar el total: un excedente es vuelto no
    // informado y se descuenta del efectivo, luego de bancos.
    let excess = round2(
      settlement.cash + settlement.bank + settlement.points - totalAmount,
    );
    if (excess > 0) {
      const fromCash = Math.min(excess, settlement.cash);
      settlement.cash = round2(settlement.cash - fromCash);
      excess = round2(excess - fromCash);
      settlement.bank = round2(Math.max(settlement.bank - excess, 0));
    }
    const settled = settlement.cash + settlement.bank + settlement.points;
    let receivable = round2(totalAmount - settled);
    // Diferencias de centimos en una venta de contado van a caja, no a CxC.
    if (isCash && Math.abs(receivable) < 0.05) {
      settlement.cash = round2(settlement.cash + receivable);
      receivable = 0;
    }

    const [sourceTypeId, receivableAccountId, incomeAccountId, ivaAccountId] =
      await Promise.all([
        this.resolveSourceType(sourceName, txn),
        this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_COBRAR, txn),
        this.resolveAccount(tenantId, ACCOUNTS.INGRESOS_POR_VENTAS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.IVA_DEBITO_FISCAL, txn),
      ]);

    const lines: Line[] = [
      ...(await this.settlementLines(tenantId, settlement, txn)),
      {
        accountId: receivableAccountId,
        debit: Math.max(receivable, 0),
        credit: 0,
        desc: 'Cuenta por cobrar de la venta',
      },
      {
        accountId: incomeAccountId,
        debit: 0,
        credit: subtotalAmount,
        desc: 'Ingreso por venta',
      },
    ];

    if (taxAmount > 0) {
      lines.push({
        accountId: ivaAccountId,
        debit: 0,
        credit: taxAmount,
        desc: 'IVA débito fiscal',
      });
    }

    const description = isCash
      ? `Venta al contado - ${saleId}`
      : `Venta a crédito - ${saleId}`;

    return this.createEntry(
      tenantId,
      sourceTypeId,
      saleId,
      entryDate,
      description,
      lines,
      txn,
      params.currencyId ?? VES,
    );
  }

  /**
   * Generates the Cost of Goods Sold (COGS) journal entry for a sale.
   * El costo esta en USD (catalogo): se registra en VES con la tasa del dia.
   *
   *   Debit  Costo de Ventas → total_cost
   *   Credit Inventario      → total_cost
   */
  async generateSaleCogsJournal(
    params: CogsJournalParams,
    txn: ITransaction,
  ): Promise<string | null> {
    const { tenantId, saleId, totalCost, entryDate } = params;

    if (totalCost <= 0) {
      this.logger.warn(
        `COGS skipped for sale ${saleId}: totalCost=${totalCost}`,
      );
      return null;
    }

    const [sourceTypeId, cogsAccountId, inventoryAccountId] = await Promise.all(
      [
        this.resolveSourceType('SALE_COGS', txn),
        this.resolveAccount(tenantId, ACCOUNTS.COSTO_DE_VENTAS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.INVENTARIO, txn),
      ],
    );

    return this.createEntry(
      tenantId,
      sourceTypeId,
      saleId,
      entryDate,
      `Costo de venta - ${saleId}`,
      [
        {
          accountId: cogsAccountId,
          debit: totalCost,
          credit: 0,
          desc: 'Costo de mercadería vendida',
        },
        {
          accountId: inventoryAccountId,
          debit: 0,
          credit: totalCost,
          desc: 'Salida de inventario por venta',
        },
      ],
      txn,
      USD,
    );
  }

  /**
   * Generates the journal entry when a purchase order is delivered.
   * Las compras estan en USD (moneda base de Compras).
   *
   *   Debit  Inventario         → subtotal_amount
   *   Debit  IVA Crédito Fiscal → tax_amount
   *   Credit CxP Proveedores    → total_amount
   */
  async generatePurchaseJournal(
    params: PurchaseJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const {
      tenantId,
      purchaseOrderId,
      subtotalAmount,
      taxAmount,
      totalAmount,
      entryDate,
    } = params;

    const [
      sourceTypeId,
      inventoryAccountId,
      ivaCreditAccountId,
      payableAccountId,
    ] = await Promise.all([
      this.resolveSourceType('PURCHASE', txn),
      this.resolveAccount(tenantId, ACCOUNTS.INVENTARIO, txn),
      this.resolveAccount(tenantId, ACCOUNTS.IVA_CREDITO_FISCAL, txn),
      this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_PAGAR, txn),
    ]);

    const lines: Line[] = [
      {
        accountId: inventoryAccountId,
        debit: subtotalAmount,
        credit: 0,
        desc: 'Ingreso de inventario por compra',
      },
    ];

    if (taxAmount > 0) {
      lines.push({
        accountId: ivaCreditAccountId,
        debit: taxAmount,
        credit: 0,
        desc: 'IVA crédito fiscal por compra',
      });
    }

    lines.push({
      accountId: payableAccountId,
      debit: 0,
      credit: totalAmount,
      desc: 'Cuenta por pagar a proveedor',
    });

    return this.createEntry(
      tenantId,
      sourceTypeId,
      purchaseOrderId,
      entryDate,
      `Compra recibida - OC ${purchaseOrderId}`,
      lines,
      txn,
      params.currencyId ?? USD,
    );
  }

  /**
   * Generates journal entry when a customer payment is received (cobro de
   * CxC o abono de un apartado).
   *
   *   Debit  Caja / Bancos / Descuentos → segun el medio de pago
   *   Credit Cuentas por Cobrar         → amount
   */
  async generatePaymentReceivedJournal(
    params: PaymentJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const { tenantId, sourceId, amount, entryDate, description } = params;

    const settlement: JournalSettlement = params.settlement ?? {
      cash: 0,
      bank: amount,
      points: 0,
    };

    const [sourceTypeId, receivableAccountId] = await Promise.all([
      this.resolveSourceType('PAYMENT_RECEIVED', txn),
      this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_COBRAR, txn),
    ]);

    return this.createEntry(
      tenantId,
      sourceTypeId,
      sourceId,
      entryDate,
      description ?? `Pago de cliente recibido - ${sourceId}`,
      [
        ...(await this.settlementLines(tenantId, settlement, txn)),
        {
          accountId: receivableAccountId,
          debit: 0,
          credit: amount,
          desc: 'Liquidación cuenta por cobrar',
        },
      ],
      txn,
      params.currencyId ?? VES,
    );
  }

  /**
   * Devolucion de venta (FNZ-X-04). Revierte el ingreso y el IVA debito de lo
   * devuelto contra el reembolso:
   *
   *   Debit  Devoluciones sobre Ventas → netAmount
   *   Debit  IVA Debito Fiscal         → taxAmount
   *   Credit Cuentas por Cobrar        → receivableCredit (lo que el cliente aun debia)
   *   Credit Caja / Bancos             → resto (dinero devuelto)
   *
   * No revierte el costo de ventas: la devolucion no reingresa inventario en
   * el sistema, asi que no hay movimiento de inventario que contabilizar.
   */
  async generateReturnJournal(
    params: ReturnJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const { tenantId, returnId, entryDate } = params;
    const net = round2(params.netAmount);
    const tax = round2(params.taxAmount);
    const gross = round2(net + tax);
    const toReceivable = round2(Math.min(params.receivableCredit, gross));
    const toFunds = round2(gross - toReceivable);
    const fromCash =
      params.refundMethodId === null ||
      params.refundMethodId === undefined ||
      params.refundMethodId === CASH_PAYMENT_METHOD_ID;

    const [sourceTypeId, returnsId, ivaId, receivableId, fundsId] =
      await Promise.all([
        this.resolveSourceType('SALE_RETURN', txn),
        this.resolveAccount(tenantId, ACCOUNTS.DEVOLUCIONES_SOBRE_VENTAS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.IVA_DEBITO_FISCAL, txn),
        this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_COBRAR, txn),
        this.resolveAccount(
          tenantId,
          fromCash ? ACCOUNTS.CAJA_GENERAL : ACCOUNTS.BANCOS,
          txn,
        ),
      ]);

    return this.createEntry(
      tenantId,
      sourceTypeId,
      returnId,
      entryDate,
      params.description ?? `Devolucion de venta - ${returnId}`,
      [
        { accountId: returnsId, debit: net, credit: 0, desc: 'Devolucion sobre ventas' },
        { accountId: ivaId, debit: tax, credit: 0, desc: 'Reverso de IVA debito fiscal' },
        { accountId: receivableId, debit: 0, credit: toReceivable, desc: 'Reduccion de la cuenta por cobrar' },
        {
          accountId: fundsId,
          debit: 0,
          credit: toFunds,
          desc: fromCash ? 'Reembolso en efectivo' : 'Reembolso por bancos',
        },
      ],
      txn,
      params.currencyId ?? VES,
    );
  }

  /**
   * Nota de credito / debito sobre una factura de venta (FNZ-X-04). La
   * factura original no se toca: la nota es un ajuste aparte.
   *
   * Credito (baja lo que se factura):
   *   Debit  Devoluciones sobre Ventas → netAmount
   *   Debit  IVA Debito Fiscal         → taxAmount
   *   Credit Cuentas por Cobrar        → receivableCredit (CxC abierta)
   *   Credit Anticipos de Clientes     → resto (saldo a favor del cliente)
   *
   * Debito (sube lo que se factura):
   *   Debit  Cuentas por Cobrar        → netAmount + taxAmount
   *   Credit Ingresos por Ventas       → netAmount
   *   Credit IVA Debito Fiscal         → taxAmount
   */
  async generateNoteJournal(
    params: NoteJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const { tenantId, noteId, noteType, entryDate } = params;
    const net = round2(params.netAmount);
    const tax = round2(params.taxAmount);
    const gross = round2(net + tax);
    const isCredit = noteType === 'credit';

    const [sourceTypeId, receivableId, ivaId, incomeId, returnsId, advanceId] =
      await Promise.all([
        this.resolveSourceType(isCredit ? 'CREDIT_NOTE' : 'DEBIT_NOTE', txn),
        this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_COBRAR, txn),
        this.resolveAccount(tenantId, ACCOUNTS.IVA_DEBITO_FISCAL, txn),
        this.resolveAccount(tenantId, ACCOUNTS.INGRESOS_POR_VENTAS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.DEVOLUCIONES_SOBRE_VENTAS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.ANTICIPOS_DE_CLIENTES, txn),
      ]);

    let lines: Line[];
    if (isCredit) {
      const toReceivable = round2(Math.min(params.receivableCredit, gross));
      lines = [
        { accountId: returnsId, debit: net, credit: 0, desc: 'Nota de credito sobre ventas' },
        { accountId: ivaId, debit: tax, credit: 0, desc: 'Reverso de IVA debito fiscal' },
        { accountId: receivableId, debit: 0, credit: toReceivable, desc: 'Reduccion de la cuenta por cobrar' },
        { accountId: advanceId, debit: 0, credit: round2(gross - toReceivable), desc: 'Saldo a favor del cliente' },
      ];
    } else {
      lines = [
        { accountId: receivableId, debit: gross, credit: 0, desc: 'Cargo adicional al cliente' },
        { accountId: incomeId, debit: 0, credit: net, desc: 'Nota de debito sobre ventas' },
        { accountId: ivaId, debit: 0, credit: tax, desc: 'IVA debito fiscal de la nota' },
      ];
    }

    return this.createEntry(
      tenantId,
      sourceTypeId,
      noteId,
      entryDate,
      params.description ??
        `${isCredit ? 'Nota de credito' : 'Nota de debito'} - ${noteId}`,
      lines,
      txn,
      params.currencyId ?? VES,
    );
  }

  /**
   * Comprobante de retencion de IVA a un proveedor (FNZ-IV-06). Lo retenido
   * deja de deberse al proveedor y pasa a deberse al SENIAT:
   *
   *   Debit  CxP Proveedores        → retainedAmount
   *   Credit Retenciones por Pagar  → retainedAmount
   */
  async generateWithholdingJournal(
    params: WithholdingJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const { tenantId, withholdingId, entryDate } = params;
    const amount = round2(params.retainedAmount);

    const [sourceTypeId, payableId, withheldId] = await Promise.all([
      this.resolveSourceType('IVA_WITHHOLDING', txn),
      this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_PAGAR, txn),
      this.resolveAccount(tenantId, ACCOUNTS.RETENCIONES_POR_PAGAR, txn),
    ]);

    return this.createEntry(
      tenantId,
      sourceTypeId,
      withholdingId,
      entryDate,
      params.description ?? `Retencion de IVA - ${withholdingId}`,
      [
        { accountId: payableId, debit: amount, credit: 0, desc: 'IVA retenido al proveedor' },
        { accountId: withheldId, debit: 0, credit: amount, desc: 'IVA retenido por enterar al SENIAT' },
      ],
      txn,
      params.currencyId ?? USD,
    );
  }

  /**
   * Anula un asiento ya registrado con otro de signo contrario (las lineas
   * guardadas ya estan en VES). Devuelve null si el documento nunca genero
   * asiento (p. ej. notas anteriores a esta contabilidad).
   */
  async reverseEntryBySource(
    tenantId: string,
    sourceName: string,
    sourceId: string,
    entryDate: Date,
    description: string,
    txn: ITransaction,
  ): Promise<string | null> {
    const sourceTypeId = await this.resolveSourceType(sourceName, txn);
    const { rows } = await txn.query(accountingQueries.getEntryLinesBySource, [
      tenantId,
      sourceTypeId,
      sourceId,
    ]);
    if (!rows.length) return null;

    const adjustmentTypeId = await this.resolveSourceType('ADJUSTMENT', txn);
    return this.createEntry(
      tenantId,
      adjustmentTypeId,
      sourceId,
      entryDate,
      description,
      rows.map(
        (r: {
          account_id: string;
          debit_amount: string;
          credit_amount: string;
          description: string | null;
        }) => ({
          accountId: r.account_id,
          debit: Number(r.credit_amount),
          credit: Number(r.debit_amount),
          desc: `Reverso: ${r.description ?? ''}`,
        }),
      ),
      txn,
      VES,
    );
  }

  /**
   * Generates journal entry when a payment to a supplier is made.
   *
   *   Debit  CxP Proveedores → amount
   *   Credit Caja (efectivo) / Bancos (resto) → amount
   */
  async generatePaymentMadeJournal(
    params: PaymentJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const { tenantId, sourceId, amount, entryDate, description } = params;
    const fromCash = params.paymentMethodId === CASH_PAYMENT_METHOD_ID;

    const [sourceTypeId, payableAccountId, fundsAccountId] = await Promise.all([
      this.resolveSourceType('PAYMENT_MADE', txn),
      this.resolveAccount(tenantId, ACCOUNTS.CUENTAS_POR_PAGAR, txn),
      this.resolveAccount(
        tenantId,
        fromCash ? ACCOUNTS.CAJA_GENERAL : ACCOUNTS.BANCOS,
        txn,
      ),
    ]);

    return this.createEntry(
      tenantId,
      sourceTypeId,
      sourceId,
      entryDate,
      description ?? `Pago a proveedor - ${sourceId}`,
      [
        {
          accountId: payableAccountId,
          debit: amount,
          credit: 0,
          desc: 'Liquidación cuenta por pagar',
        },
        {
          accountId: fundsAccountId,
          debit: 0,
          credit: amount,
          desc: fromCash ? 'Salida de caja' : 'Salida de bancos',
        },
      ],
      txn,
      params.currencyId ?? USD,
    );
  }

  /**
   * Generates the journal entry for an operational expense.
   *
   * Payment by CASH:
   *   Debit  [Expense Account]     → subtotal_amount
   *   Debit  IVA Crédito Fiscal    → tax_amount (if > 0)
   *   Credit Caja General          → total_amount
   *
   * Payment by BANK/TRANSFER/CHECK:
   *   Debit  [Expense Account]     → subtotal_amount
   *   Debit  IVA Crédito Fiscal    → tax_amount (if > 0)
   *   Credit Bancos                → total_amount
   *
   * Payment by CREDIT_CARD:
   *   Debit  [Expense Account]     → subtotal_amount
   *   Debit  IVA Crédito Fiscal    → tax_amount (if > 0)
   *   Credit Cuentas por Pagar     → total_amount
   */
  async generateExpenseJournal(
    params: ExpenseJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const {
      tenantId,
      expenseId,
      accountCode,
      subtotalAmount,
      taxAmount,
      totalAmount,
      paymentMethod,
      entryDate,
      description,
    } = params;

    // Determine credit account based on payment method
    let creditAccountCode: string;
    switch (paymentMethod) {
      case 'CASH':
        creditAccountCode = ACCOUNTS.CAJA_GENERAL;
        break;
      case 'CREDIT_CARD':
        creditAccountCode = ACCOUNTS.CUENTAS_POR_PAGAR;
        break;
      default: // BANK, TRANSFER, CHECK
        creditAccountCode = ACCOUNTS.BANCOS;
        break;
    }

    const [sourceTypeId, expenseAccountId, creditAccountId, ivaAccountId] =
      await Promise.all([
        this.resolveSourceType('EXPENSE', txn),
        this.resolveExpenseAccount(tenantId, accountCode, txn),
        this.resolveAccount(tenantId, creditAccountCode, txn),
        this.resolveAccount(tenantId, ACCOUNTS.IVA_CREDITO_FISCAL, txn),
      ]);

    const lines: Line[] = [
      {
        accountId: expenseAccountId,
        debit: subtotalAmount,
        credit: 0,
        desc: `Gasto operativo - ${description ?? accountCode}`,
      },
    ];

    if (taxAmount > 0) {
      lines.push({
        accountId: ivaAccountId,
        debit: taxAmount,
        credit: 0,
        desc: 'IVA crédito fiscal por gasto',
      });
    }

    lines.push({
      accountId: creditAccountId,
      debit: 0,
      credit: totalAmount,
      desc: `Pago de gasto (${paymentMethod})`,
    });

    return this.createEntry(
      tenantId,
      sourceTypeId,
      expenseId,
      entryDate,
      `Gasto operativo - ${description ?? expenseId}`,
      lines,
      txn,
      params.currencyId ?? VES,
    );
  }

  /**
   * Generates the journal entry when a payroll is closed (en bolivares).
   *
   *   Debit  5-1-001 Salarios y Sueldos    → total_earnings
   *   Credit 2-1-005 Salarios por Pagar    → net_total
   *   Credit 2-1-004 Retenciones por Pagar → total_deductions
   */
  async generatePayrollJournal(
    params: PayrollJournalParams,
    txn: ITransaction,
  ): Promise<string> {
    const {
      tenantId,
      paysheetId,
      totalEarnings,
      totalDeductions,
      netTotal,
      entryDate,
    } = params;

    const [sourceTypeId, salaryExpenseId, salaryPayableId, retentionPayableId] =
      await Promise.all([
        this.resolveSourceType('PAYROLL', txn),
        this.resolveAccount(tenantId, ACCOUNTS.SALARIOS_Y_SUELDOS, txn),
        this.resolveAccount(tenantId, ACCOUNTS.SALARIOS_POR_PAGAR, txn),
        this.resolveAccount(tenantId, ACCOUNTS.RETENCIONES_POR_PAGAR, txn),
      ]);

    const lines: Line[] = [
      {
        accountId: salaryExpenseId,
        debit: totalEarnings,
        credit: 0,
        desc: 'Gasto de nómina - salarios brutos',
      },
      {
        accountId: salaryPayableId,
        debit: 0,
        credit: netTotal,
        desc: 'Salarios netos por pagar',
      },
    ];

    if (totalDeductions > 0) {
      lines.push({
        accountId: retentionPayableId,
        debit: 0,
        credit: totalDeductions,
        desc: 'Retenciones por pagar (deducciones de nómina)',
      });
    }

    return this.createEntry(
      tenantId,
      sourceTypeId,
      paysheetId,
      entryDate,
      `Nómina - Planilla ${paysheetId}`,
      lines,
      txn,
      VES,
    );
  }
}
