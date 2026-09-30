import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { purchaseQueries } from '@purchase/purchase.queries';
import { WarehouseService } from '@/contexts/inventory/modules/warehouse/warehouse.service';
import { AccountingJournalService } from '@/contexts/finances/modules/accounting/accounting-journal.service';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const {
  purchase,
  payments,
  ap,
  catalog,
  supplierCredits,
  goodsReceipt,
  disputes,
} = purchaseQueries;
const SUPERUSER_HIERARCHY = 1;
const INVOICE_EDITABLE_ORDER_STATUS_ID = 2; // Shipped / "enviada"
const SHIPPED_STATUS_ID = 2;
const DELIVERED_STATUS_ID = 3;

type OrderAccessRow = {
  purchase_order_id: string;
  purchase_order_status_id: number;
  tenant_id: string;
};

type PayableAccessRow = {
  purchase_account_payable_id: string;
  purchase_order_id: string;
  tenant_id: string;
};

type InvoiceAccessRow = {
  supplier_invoice_id: string;
  purchase_order_id: string;
  purchase_order_status_id: number;
  tenant_id: string;
};

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly warehouseService: WarehouseService,
    private readonly journalService: AccountingJournalService,
    private readonly stateService: StateService,
  ) {}

  async createPurchaseOrder(param: CreatePurchaseDto, session: IUserSession) {
    const {
      supplier_id,
      warehouse_id,
      expected_delivery_date,
      items,
      has_invoice,
      payment_condition,
      payment_due_date,
    } = param;

    if (!items?.length) {
      throw new BadRequestException(
        'La orden de compra debe incluir al menos un item',
      );
    }

    const contextResult = await this.db.query(purchase.getCreateContext, [
      supplier_id,
      warehouse_id,
    ]);

    const context = contextResult.rows[0];
    if (!context) {
      throw new NotFoundException(
        'No fue posible validar el proveedor y la bodega seleccionados',
      );
    }

    if (context.supplier_tenant_id !== context.warehouse_tenant_id) {
      throw new BadRequestException(
        'El proveedor y la bodega pertenecen a tenants distintos',
      );
    }

    this.assertTenantAccess(context.warehouse_tenant_id, session);

    const result = await this.db.query(purchase.createPurchaseOrder, [
      supplier_id,
      warehouse_id,
      expected_delivery_date,
      JSON.stringify(items),
      has_invoice ?? true,
      payment_condition ?? 'CREDIT',
      payment_due_date ?? null,
    ]);

    this.logger.log(result);

    const orderId = result.rows[0]?.purchase_order_id;
    if (!orderId) {
      throw new BadRequestException('No se pudo crear la orden de compra');
    }

    return this.getPurchaseOrderById(orderId, session);
  }

  async threeWayMatching(
    createPurchaseDto: {
      purchase_order_id?: string;
      goods_receipt_id?: string;
    },
    session: IUserSession,
  ) {
    const { purchase_order_id, goods_receipt_id } = createPurchaseDto || {};

    if (!purchase_order_id || !goods_receipt_id) {
      throw new BadRequestException(
        'purchase_order_id y goods_receipt_id son requeridos',
      );
    }

    const access = await this.getOrderAccessOrThrow(purchase_order_id);
    this.assertTenantAccess(access.tenant_id, session);

    await this.db.query(purchase.threeWayMatching, [
      purchase_order_id,
      goods_receipt_id,
    ]);

    return {
      message: 'Three-way matching ejecutado',
      ...(await this.getThreeWayMatching(purchase_order_id, session)),
    };
  }

  async registerPayment(dto: CreatePaymentDto, session: IUserSession) {
    const accessResult = await this.db.query(payments.getPayableAccess, [
      dto.purchase_account_payable_id,
    ]);
    const payableAccess = accessResult.rows[0] as PayableAccessRow | undefined;

    if (!payableAccess) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    this.assertTenantAccess(payableAccess.tenant_id, session);

    const txn = await this.db.transaction();
    try {
      const {
        purchase_account_payable_id,
        amount_paid,
        payment_method_id,
        payment_reference,
      } = dto;

      let insertResult;
      try {
        insertResult = await txn.query(payments.insertPayment, [
          purchase_account_payable_id,
          amount_paid,
          payment_method_id,
          dto.currency_id ?? null,
          payment_reference ?? null,
        ]);
      } catch (e: any) {
        throw new BadRequestException(
          'Error al registrar el pago: ' + (e.detail || e.message),
        );
      }

      const paymentId = insertResult.rows[0]?.purchase_order_payment_id;
      if (!paymentId) {
        throw new BadRequestException(
          'No se pudo obtener el identificador del pago registrado',
        );
      }

      const payableResult = await txn.query(ap.getUpdatedPayableById, [
        purchase_account_payable_id,
      ]);

      try {
        const paymentInfo = await txn.query(
          payments.getPaymentAmountForJournal,
          [paymentId],
        );
        if (paymentInfo.rows.length > 0) {
          const { tenant_id, purchase_order_id } = paymentInfo.rows[0];
          await this.journalService.generatePaymentMadeJournal(
            {
              tenantId: tenant_id,
              sourceId: purchase_order_id,
              amount: Number(amount_paid),
              entryDate: new Date(),
              description: `Pago a proveedor - OC ${purchase_order_id}`,
            },
            txn,
          );
        }
      } catch (accountingError) {
        this.logger.error(
          `Error generating payment journal for payment ${paymentId}: ${(accountingError as Error).message}`,
        );
      }

      await txn.commit();

      return {
        payment_id: paymentId,
        purchase_account_payable: payableResult.rows[0] ?? null,
        order: await this.getPurchaseOrderById(
          payableAccess.purchase_order_id,
          session,
        ),
      };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  async updatePayment(
    paymentId: string,
    dto: UpdatePaymentDto,
    session: IUserSession,
  ) {
    const accessResult = await this.db.query(payments.getPaymentAccess, [
      paymentId,
    ]);
    const paymentAccess = accessResult.rows[0] as
      | {
          tenant_id: string;
          purchase_order_id: string;
          purchase_account_payable_id: string;
        }
      | undefined;

    if (!paymentAccess) {
      throw new NotFoundException('Pago no encontrado');
    }

    this.assertTenantAccess(paymentAccess.tenant_id, session);

    const txn = await this.db.transaction();
    try {
      const { amount_paid, payment_method_id, currency_id, payment_reference } =
        dto;

      // Update the payment record
      await txn.query(payments.updatePayment, [
        amount_paid,
        payment_method_id,
        currency_id ?? null,
        payment_reference ?? null,
        paymentId,
      ]);

      // Return the updated order and payable info
      const payableResult = await txn.query(ap.getUpdatedPayableById, [
        paymentAccess.purchase_account_payable_id,
      ]);

      await txn.commit();

      return {
        payment_id: paymentId,
        purchase_account_payable: payableResult.rows[0] ?? null,
        order: await this.getPurchaseOrderById(
          paymentAccess.purchase_order_id,
          session,
        ),
      };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  async getAllPurchaseOrders(session: IUserSession) {
    const result = this.isSuperuser(session.role_id)
      ? await this.db.query(purchase.getAllGlobal)
      : await this.db.query(purchase.getAllByTenant, [session.tenant_id]);

    return result.rows;
  }

  async getAccountsPayable(session: IUserSession) {
    const result = this.isSuperuser(session.role_id)
      ? await this.db.query(ap.getAllGlobal)
      : await this.db.query(ap.getAllByTenant, [session.tenant_id]);

    return result.rows;
  }

  async getPurchaseCatalogs() {
    const [orderStatuses, payableStatuses, paymentMethods, currencies] =
      await Promise.all([
        this.db.query(catalog.getOrderStatuses),
        this.db.query(catalog.getPayableStatuses),
        this.db.query(catalog.getPaymentMethods),
        this.db.query(catalog.getCurrencies),
      ]);

    return {
      order_statuses: orderStatuses.rows,
      payable_statuses: payableStatuses.rows,
      payment_methods: paymentMethods.rows,
      currencies: currencies.rows,
      payment_conditions: [
        { value: 'CREDIT', label: 'Crédito' },
        { value: 'IN_FULL', label: 'Pago completo' },
      ],
    };
  }

  /**
   * Creditos de proveedor disponibles (originados por notas de credito de
   * venta por mercancia danada, ver pos_schema.credit_debit_note) que el
   * tenant puede aplicar contra una cuenta por pagar de este proveedor.
   */
  async listSupplierCredits(supplierId: string, session: IUserSession) {
    const accessResult = await this.db.query(
      supplierCredits.getSupplierAccess,
      [supplierId],
    );
    const access = accessResult.rows[0] as
      | { supplier_id: string; tenant_id: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(supplierCredits.listBySupplier, [
      supplierId,
      access.tenant_id,
    ]);
    return result.rows;
  }

  /**
   * Aplica (total o parcialmente) un credito de proveedor contra el balance
   * de una cuenta por pagar de compras. Reutiliza purchase_order_payment con
   * el metodo dedicado 'supplier_credit' para que
   * recalc_account_payable_on_payment() recalcule el balance -- no se toca
   * amount_paid a mano.
   */
  async applySupplierCredit(
    creditId: string,
    purchaseAccountPayableId: string,
    session: IUserSession,
  ) {
    const creditAccessResult = await this.db.query(
      supplierCredits.getAccessById,
      [creditId],
    );
    const credit = creditAccessResult.rows[0] as
      | {
          supplier_credit_id: string;
          tenant_id: string;
          supplier_id: string;
          remaining_amount: string;
          status: string;
        }
      | undefined;

    if (!credit) {
      throw new NotFoundException('Credito de proveedor no encontrado');
    }
    this.assertTenantAccess(credit.tenant_id, session);

    if (credit.status !== 'AVAILABLE' || Number(credit.remaining_amount) <= 0) {
      throw new BadRequestException(
        'Este credito ya fue aplicado por completo o fue anulado',
      );
    }

    const payableAccessResult = await this.db.query(payments.getPayableAccess, [
      purchaseAccountPayableId,
    ]);
    const payableAccess = payableAccessResult.rows[0] as
      | {
          purchase_account_payable_id: string;
          purchase_order_id: string;
          tenant_id: string;
        }
      | undefined;

    if (!payableAccess) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }
    this.assertTenantAccess(payableAccess.tenant_id, session);

    const orderResult = await this.db.query(purchase.getAccessById, [
      payableAccess.purchase_order_id,
    ]);
    const order = orderResult.rows[0] as
      | { purchase_order_id: string }
      | undefined;
    if (!order) {
      throw new NotFoundException('Orden de compra no encontrada');
    }

    const orderDetail = await this.getPurchaseOrderById(
      payableAccess.purchase_order_id,
      session,
    );
    const balanceDue = Number(orderDetail?.balance_due ?? 0);
    if (balanceDue <= 0) {
      throw new BadRequestException(
        'Esta cuenta por pagar ya no tiene saldo pendiente',
      );
    }

    const amountToApply = Math.min(Number(credit.remaining_amount), balanceDue);

    const methodResult = await this.db.query(
      supplierCredits.getSupplierCreditPaymentMethodId,
    );
    const paymentMethodId = methodResult.rows[0]?.payment_method_id;
    if (!paymentMethodId) {
      throw new BadRequestException(
        "Metodo de pago 'supplier_credit' no esta sembrado -- ejecutar seeds/catalog/general/015",
      );
    }

    const txn = await this.db.transaction();
    try {
      const paymentResult = await txn.query(payments.insertPayment, [
        purchaseAccountPayableId,
        amountToApply,
        paymentMethodId,
        null,
        `Credito de proveedor ${creditId}`,
      ]);
      const paymentId = paymentResult.rows[0]?.purchase_order_payment_id;

      await txn.query(supplierCredits.recordApplication, [
        creditId,
        purchaseAccountPayableId,
        paymentId,
        amountToApply,
        session.user_id,
      ]);

      await txn.query(supplierCredits.decrementRemaining, [
        creditId,
        amountToApply,
      ]);

      await txn.commit();
    } catch (error) {
      await txn.rollback();
      throw error;
    }

    return this.getPurchaseOrderById(payableAccess.purchase_order_id, session);
  }

  /** Tasa efectiva del tenant (base + diferencial) aplicada a las compras. */
  async getExchangeRate(tenantId: string) {
    const result = await this.db.query(catalog.getLatestExchangeRate, [
      tenantId,
    ]);
    return result.rows[0] ?? null;
  }

  async getPurchaseOrderById(id: string, session: IUserSession) {
    const access = await this.getOrderAccessOrThrow(id);
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(purchase.getById, [id]);
    return result.rows[0] ?? null;
  }

  async updatePurchaseOrder(
    id: string,
    updatePurchaseDto: UpdatePurchaseDto,
    session: IUserSession,
  ) {
    const access = await this.getOrderAccessOrThrow(id);
    this.assertTenantAccess(access.tenant_id, session);

    const nextStatusId =
      (updatePurchaseDto as { purchase_order_status_id?: number })
        ?.purchase_order_status_id ?? access.purchase_order_status_id;

    if (nextStatusId === DELIVERED_STATUS_ID) {
      throw new BadRequestException(
        'purchase_order_status_id no puede pasar a 3 (Delivered) directamente; usa el flujo de recepcion (start/update/confirm goods receipt)',
      );
    }

    await this.db.query(purchase.updateStatus, [nextStatusId, id]);
    return this.getPurchaseOrderById(id, session);
  }

  async updateOrderStatus(
    orderId: string,
    statusId: number,
    session: IUserSession,
  ) {
    const access = await this.getOrderAccessOrThrow(orderId);
    this.assertTenantAccess(access.tenant_id, session);

    const currentStatus = access.purchase_order_status_id;
    // Status 3 (Delivered) is not a transition reachable from here anymore --
    // it can only happen as a side effect of confirmGoodsReceipt(), so that
    // inventory application and three-way matching always run against
    // whatever was actually corrected during receiving, not against the
    // original order quantities. See start/update/confirmGoodsReceipt below.
    const allowedTransitions: Record<number, number[]> = {
      1: [2, 4],
      2: [4],
      3: [],
      4: [],
    };

    if (currentStatus === statusId) {
      return {
        ...(await this.getPurchaseOrderById(orderId, session)),
        message: 'La orden ya tiene ese estado',
      };
    }

    if (statusId === DELIVERED_STATUS_ID) {
      throw new BadRequestException(
        'La orden no puede pasar a "entregada" directamente; inicia la recepcion de mercancia (POST /purchase/:id/goods-receipt) y confirmala',
      );
    }

    const isAllowed = (allowedTransitions[currentStatus] || []).includes(
      statusId,
    );
    if (!isAllowed) {
      throw new BadRequestException(
        `Transicion invalida: ${currentStatus} -> ${statusId}`,
      );
    }

    await this.db.query(purchase.updateOrderStatus, [statusId, orderId]);

    return this.getPurchaseOrderById(orderId, session);
  }

  /**
   * Paso 1 de la recepcion de mercancia: la orden debe estar en status 2
   * (Shipped/enviada). Crea (o retoma, si ya existe y sigue PENDING) un
   * goods_receipt con un checklist de items precargado desde
   * purchase_order_item -- editable via updateGoodsReceiptItems hasta que
   * se confirme.
   */
  async startGoodsReceipt(orderId: string, session: IUserSession) {
    const access = await this.getOrderAccessOrThrow(orderId);
    this.assertTenantAccess(access.tenant_id, session);

    if (access.purchase_order_status_id !== SHIPPED_STATUS_ID) {
      throw new ForbiddenException(
        'Solo se puede iniciar la recepcion mientras la orden esta en estado "enviada"',
      );
    }

    let goodsReceiptId: string;
    try {
      const result = await this.db.query(goodsReceipt.start, [orderId]);
      goodsReceiptId = result.rows[0]?.goods_receipt_id;
    } catch (e: any) {
      throw new BadRequestException(
        'Error al iniciar la recepcion: ' + (e.detail || e.message),
      );
    }

    return this.getGoodsReceipt(goodsReceiptId, session);
  }

  /**
   * Paso 2 (opcional, repetible): corrige cantidad/productos recibidos
   * contra lo que realmente llego, mientras el goods_receipt siga PENDING.
   * purchase_order_item nunca se toca -- sigue siendo el registro inmutable
   * de lo que se pidio originalmente.
   */
  async updateGoodsReceiptItems(
    goodsReceiptId: string,
    dto: UpdateGoodsReceiptDto,
    session: IUserSession,
  ) {
    const access = await this.getGoodsReceiptAccessOrThrow(goodsReceiptId);
    this.assertTenantAccess(access.tenant_id, session);

    if (access.status !== 'PENDING') {
      throw new ForbiddenException(
        'Los items de la recepcion solo pueden editarse mientras esta PENDING',
      );
    }

    try {
      await this.db.query(goodsReceipt.updateItems, [
        goodsReceiptId,
        JSON.stringify(dto.items),
        access.tenant_id,
      ]);
    } catch (e: any) {
      throw new BadRequestException(
        'Error al actualizar los items recibidos: ' + (e.detail || e.message),
      );
    }

    return this.getGoodsReceipt(goodsReceiptId, session);
  }

  /**
   * Paso 3: bloquea la edicion, aplica inventario desde los items ya
   * corregidos, corre el three-way matching (que puede abrir una disputa
   * automatica si hay discrepancia) y recien ahi mueve la orden a status 3
   * (Delivered). Unica via legitima para llegar a ese status -- ver el
   * guard trigger en la DB.
   */
  async confirmGoodsReceipt(goodsReceiptId: string, session: IUserSession) {
    const access = await this.getGoodsReceiptAccessOrThrow(goodsReceiptId);
    this.assertTenantAccess(access.tenant_id, session);

    if (access.status !== 'PENDING') {
      throw new ForbiddenException(
        'Esta recepcion ya fue confirmada anteriormente',
      );
    }

    const txn = await this.db.transaction();
    try {
      // confirm_goods_receipt() hace todo esto en un solo lado (DB): aplica
      // inventario, corre three-way matching y abre disputa si corresponde.
      // Mismo motivo que la vieja migracion de status 3 explicaba: no llamar
      // warehouseService aqui, correria en otra conexion fuera de esta txn.
      await txn.query(goodsReceipt.confirm, [goodsReceiptId]);

      try {
        const amountsResult = await txn.query(
          purchase.getOrderAmountsForJournal,
          [access.purchase_order_id],
        );
        if (amountsResult.rows.length > 0) {
          const row = amountsResult.rows[0];
          await this.journalService.generatePurchaseJournal(
            {
              tenantId: row.tenant_id,
              purchaseOrderId: access.purchase_order_id,
              subtotalAmount: Number(row.subtotal_amount),
              taxAmount: Number(row.tax_amount),
              totalAmount: Number(row.total_amount),
              entryDate: new Date(),
            },
            txn,
          );
        }
      } catch (accountingError) {
        this.logger.error(
          `Error generating purchase journal for order ${access.purchase_order_id}: ${(accountingError as Error).message}`,
        );
      }

      await txn.commit();
    } catch (error) {
      await txn.rollback();
      throw error;
    }

    return this.getPurchaseOrderById(access.purchase_order_id, session);
  }

  /**
   * Cancela una recepcion iniciada por error mientras sigue PENDING -- borra
   * el goods_receipt (cascada se lleva sus items) para poder reintentar
   * limpio con startGoodsReceipt. No afecta el status de la orden (sigue
   * "enviada").
   */
  async cancelGoodsReceipt(goodsReceiptId: string, session: IUserSession) {
    const access = await this.getGoodsReceiptAccessOrThrow(goodsReceiptId);
    this.assertTenantAccess(access.tenant_id, session);

    if (access.status !== 'PENDING') {
      throw new ForbiddenException(
        'Solo se puede cancelar una recepcion mientras esta PENDING',
      );
    }

    try {
      await this.db.query(goodsReceipt.cancel, [goodsReceiptId]);
    } catch (e: any) {
      throw new BadRequestException(
        'Error al cancelar la recepcion: ' + (e.detail || e.message),
      );
    }

    return this.getPurchaseOrderById(access.purchase_order_id, session);
  }

  async getGoodsReceipt(goodsReceiptId: string, session: IUserSession) {
    const access = await this.getGoodsReceiptAccessOrThrow(goodsReceiptId);
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(goodsReceipt.getWithItems, [
      goodsReceiptId,
    ]);
    return result.rows[0] ?? null;
  }

  async listDisputes(orderId: string, session: IUserSession) {
    const access = await this.getOrderAccessOrThrow(orderId);
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(disputes.listByOrder, [orderId]);
    return result.rows;
  }

  /**
   * Reporte manual de discrepancia (ej. detectada fuera del flujo de
   * recepcion, o antes de que exista un goods_receipt). confirmGoodsReceipt()
   * abre disputas automaticamente para discrepancias que el three-way
   * matching detecta al confirmar -- esto cubre el caso en que alguien nota
   * algo por su cuenta.
   */
  async createDispute(dto: CreateDisputeDto, session: IUserSession) {
    const accessResult = await this.db.query(
      disputes.getOrderAccessForDispute,
      [dto.purchase_order_id],
    );
    const access = accessResult.rows[0] as
      | { purchase_order_id: string; tenant_id: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(disputes.create, [
      dto.purchase_order_id,
      dto.supplier_invoice_id ?? null,
      access.tenant_id,
      dto.dispute_type,
      dto.description,
    ]);
    return result.rows[0];
  }

  async resolveDispute(
    disputeId: string,
    dto: ResolveDisputeDto,
    session: IUserSession,
  ) {
    const accessResult = await this.db.query(disputes.getAccessById, [
      disputeId,
    ]);
    const access = accessResult.rows[0] as
      | { dispute_id: string; tenant_id: string; status: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Disputa no encontrada');
    }
    this.assertTenantAccess(access.tenant_id, session);

    if (access.status !== 'OPEN') {
      throw new BadRequestException('Esta disputa ya fue resuelta');
    }

    const result = await this.db.query(disputes.resolve, [
      dto.resolution_notes,
      disputeId,
    ]);
    return result.rows[0];
  }

  private async getGoodsReceiptAccessOrThrow(goodsReceiptId: string) {
    const result = await this.db.query(goodsReceipt.getAccess, [
      goodsReceiptId,
    ]);
    const access = result.rows[0] as
      | {
          goods_receipt_id: string;
          purchase_order_id: string;
          status: string;
          tenant_id: string;
        }
      | undefined;

    if (!access) {
      throw new NotFoundException('Recepcion de mercancia no encontrada');
    }

    return access;
  }

  async updateSupplierInvoice(
    invoiceId: string,
    dto: UpdateSupplierInvoiceDto,
    session: IUserSession,
  ) {
    const accessResult = await this.db.query(purchase.getInvoiceAccess, [
      invoiceId,
    ]);
    const access = accessResult.rows[0] as InvoiceAccessRow | undefined;

    if (!access) {
      throw new NotFoundException('Factura no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    if (access.purchase_order_status_id !== INVOICE_EDITABLE_ORDER_STATUS_ID) {
      throw new ForbiddenException(
        'La factura solo puede editarse mientras la orden esta en estado "enviada"',
      );
    }

    try {
      await this.db.query(purchase.updateSupplierInvoice, [
        invoiceId,
        JSON.stringify(dto.items),
        access.tenant_id,
      ]);
    } catch (e: any) {
      throw new BadRequestException(
        'Error al actualizar la factura: ' + (e.detail || e.message),
      );
    }

    return this.getPurchaseOrderById(access.purchase_order_id, session);
  }

  async getThreeWayMatching(orderId: string, session: IUserSession) {
    const access = await this.getOrderAccessOrThrow(orderId);
    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(purchase.getMatchingByOrderId, [
      orderId,
    ]);

    if (!result.rows.length) {
      return {
        purchase_order_id: orderId,
        matching_found: false,
        message: 'No existe conciliacion three-way matching para esta orden',
      };
    }

    const row = result.rows[0];
    return {
      matching_found: true,
      matching_id: row.matching_id,
      purchase_order_id: row.purchase_order_id,
      goods_receipt_id: row.goods_receipt_id,
      supplier_invoice_id: row.supplier_invoice_id,
      amounts_matched: row.amounts_matched,
      quantities_matched: row.quantities_matched,
      is_matched: row.is_matched,
      matched_at: row.matched_at,
      amount_comparison: row.amount_comparison,
      quantity_comparison: row.quantity_comparison,
    };
  }

  private async getOrderAccessOrThrow(
    orderId: string,
  ): Promise<OrderAccessRow> {
    const result = await this.db.query(purchase.getAccessById, [orderId]);
    const access = result.rows[0] as OrderAccessRow | undefined;

    if (!access) {
      throw new NotFoundException('Orden de compra no encontrada');
    }

    return access;
  }

  private assertTenantAccess(resourceTenantId: string, session: IUserSession) {
    if (this.isSuperuser(session.role_id)) {
      return;
    }

    if (resourceTenantId !== session.tenant_id) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso',
      );
    }
  }

  private isSuperuser(roleId: number) {
    return (
      this.stateService.getRole(roleId).role_hierarchy === SUPERUSER_HIERARCHY
    );
  }
}
