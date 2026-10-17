import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { WarehouseService } from '@/contexts/inventory/modules/warehouse/warehouse.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { accountsReceivableQueries } from './accounts-receivable.queries';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { posQueries } from '@pos/pos.queries';
import { calculateEarnedPoints } from '../loyal-program/loyalty-currency';
import { AccountingJournalService } from '@/contexts/finances/modules/accounting/accounting-journal.service';

const { ar, collections, catalog, apartado } = accountsReceivableQueries;
const { loyaltyScore, saleItems } = posQueries;

@Injectable()
export class AccountsReceivableService {
  private readonly logger = new Logger(AccountsReceivableService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenantScope: TenantScopeService,
    private readonly warehouseService: WarehouseService,
    private readonly journalService: AccountingJournalService,
  ) {}

  async getAccountsReceivable(session: IUserSession, page = 1, limit = 50) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
    const offset = (safePage - 1) * safeLimit;

    const result = this.tenantScope.isSuperuser(session)
      ? await this.db.query(ar.getAllGlobal, [safeLimit, offset])
      : await this.db.query(ar.getAllByTenant, [
          session.tenant_id,
          safeLimit,
          offset,
        ]);

    const total = result.rows[0]?.total_count
      ? parseInt(result.rows[0].total_count, 10)
      : 0;

    return {
      receivables: result.rows.map(({ total_count, ...row }) => row),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getCatalogs() {
    const [statuses, paymentMethods, currencies] = await Promise.all([
      this.db.query(catalog.getReceivableStatuses),
      this.db.query(catalog.getPaymentMethods),
      this.db.query(catalog.getCurrencies),
    ]);

    return {
      receivable_statuses: statuses.rows,
      payment_methods: paymentMethods.rows,
      currencies: currencies.rows,
    };
  }

  async registerCollection(dto: CreateCollectionDto, session: IUserSession) {
    const accessResult = await this.db.query(collections.getReceivableAccess, [
      dto.sale_account_receivable_id,
    ]);
    const access = accessResult.rows[0] as
      | {
          sale_account_receivable_id: string;
          sale_id: string;
          tenant_id: string;
        }
      | undefined;

    if (!access) {
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    const txn = await this.db.transaction();
    let collectionId!: string;
    let receivableRow: unknown;
    try {
      // Backfill the initial upfront payment if it was not recorded as a
      // sale_collection row at sale creation (legacy AR rows). Without this,
      // SUM(collections) underreports the paid amount and the recalc loses
      // the upfront portion.
      await txn.query(collections.backfillMissingInitialCollection, [
        dto.sale_account_receivable_id,
      ]);

      let insertResult;
      try {
        insertResult = await txn.query(collections.insertCollection, [
          dto.sale_account_receivable_id,
          dto.amount_paid,
          dto.payment_method_id,
          dto.currency_id ?? null,
          dto.original_amount ?? null,
          dto.exchange_rate ?? null,
          dto.payment_reference ?? null,
        ]);
      } catch (e: any) {
        throw new BadRequestException(
          'Error al registrar el cobro: ' + (e.detail || e.message),
        );
      }

      collectionId = insertResult.rows[0]?.sale_collection_id;
      if (!collectionId) {
        throw new BadRequestException(
          'No se pudo obtener el identificador del cobro registrado',
        );
      }

      // Asiento del cobro (FNZ-X-04): Caja/Bancos contra Cuentas por Cobrar.
      // Secundario (no tumba el cobro) y en savepoint dentro de la txn.
      const cobroId = collectionId;
      await this.journalService.trySecondary(
        txn,
        `cobro ${cobroId}`,
        async () => {
          const { rows: curRows } = await txn.query(
            collections.getReceivableCurrency,
            [dto.sale_account_receivable_id],
          );
          const currencyId = Number(curRows[0]?.currency_id ?? 1);
          const entryDate = new Date();
          const settlement = await this.journalService.buildSettlement(
            access.tenant_id,
            currencyId,
            entryDate,
            [
              {
                payment_method_id: Number(dto.payment_method_id),
                payment_amount: Number(dto.amount_paid),
                currency_id: currencyId,
              },
            ],
            0,
            txn,
          );
          await this.journalService.generatePaymentReceivedJournal(
            {
              tenantId: access.tenant_id,
              sourceId: cobroId,
              amount: Number(dto.amount_paid),
              settlement,
              currencyId,
              entryDate,
              description: `Cobro de cuenta por cobrar - venta ${access.sale_id}`,
            },
            txn,
          );
        },
      );

      // Recalc AR totals + status defensively. The DB has a trigger that does
      // the same, but bootstrap.sql in some environments lacks it.
      await txn.query(collections.recalcReceivableTotals, [
        dto.sale_account_receivable_id,
      ]);

      const receivableResult = await txn.query(ar.getUpdatedReceivableById, [
        dto.sale_account_receivable_id,
      ]);
      receivableRow = receivableResult.rows[0] ?? null;

      await txn.commit();
    } catch (error) {
      await txn.rollback();
      throw error;
    }

    const arInfo = await this.db.query(apartado.getARTypeAndSaleInfo, [
      dto.sale_account_receivable_id,
    ]);
    const arRow = arInfo.rows[0] as
      | {
          type_name: string;
          sale_id: string;
          is_paid: boolean;
          tenant_id: string;
          tenant_customer_id: string | null;
          branch_id: string;
          currency_id: number | null;
          total_amount: string | number;
        }
      | undefined;

    if (arRow) {
      try {
        await this.grantProportionalLoyaltyPoints(
          arRow.tenant_id,
          arRow.tenant_customer_id,
          arRow.currency_id,
          Number(arRow.total_amount),
          Number(dto.amount_paid),
          arRow.sale_id,
          collectionId,
        );
      } catch (loyaltyError) {
        this.logger.error(
          `Loyalty points update failed for collection ${collectionId}: ${(loyaltyError as Error).message}`,
        );
      }

      if (arRow.is_paid) {
        if (arRow.type_name === 'venta_apartado') {
          await this.completeApartado(
            arRow.sale_id,
            arRow.branch_id,
            arRow.tenant_id,
          );
        } else if (arRow.type_name === 'venta_credito') {
          try {
            await this.db.query(apartado.completeCreditSale, [arRow.sale_id]);
          } catch (err) {
            this.logger.error(
              `Error completando venta crédito ${arRow.sale_id}: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    return {
      collection_id: collectionId,
      sale_account_receivable: receivableRow,
    };
  }

  private async grantProportionalLoyaltyPoints(
    tenantId: string,
    tenantCustomerId: string | null,
    saleCurrencyId: number | null,
    saleTotal: number,
    paidAmount: number,
    saleId: string,
    collectionId: string,
  ): Promise<void> {
    if (!tenantCustomerId || paidAmount <= 0) return;

    const { rows: programRows } = await this.db.query(
      loyaltyScore.getActiveProgramForTenant,
      [tenantId],
    );
    const program = programRows[0];
    if (!program) return;

    // FNZ-FI-01: el programa se define en USD; el total de la venta y el
    // cobro (ambos en la moneda de la venta) se convierten antes de aplicar
    // la compra minima y la tasa de acumulacion.
    const points = await calculateEarnedPoints(
      this.db,
      program,
      tenantId,
      saleCurrencyId,
      saleTotal,
      paidAmount,
    );
    if (points <= 0) return;

    await this.db.query(loyaltyScore.upsertEarned, [
      tenantId,
      tenantCustomerId,
      points,
    ]);
    // FNZ-FI-03: queda en el ledger para el grafico de crecimiento de Finanzas.
    await this.db.query(loyaltyScore.insertCollectionEarned, [
      tenantId,
      tenantCustomerId,
      points,
      saleId,
      collectionId,
    ]);
  }

  private async completeApartado(
    saleId: string,
    branchId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      const itemsRes = await this.db.query(apartado.getSaleItems, [saleId]);
      const items = itemsRes.rows as Array<{
        product_variant_id: string;
        quantity: number;
      }>;

      const whRes = await this.db.query(
        `SELECT warehouse_id FROM inventory_schema.warehouse
         WHERE branch_id = $1 AND is_branch = true LIMIT 1`,
        [branchId],
      );
      if (!whRes.rows[0]) {
        throw new Error(`Branch ${branchId} sin warehouse de piso de venta`);
      }
      const warehouseId: string = whRes.rows[0].warehouse_id;

      const txn = await this.db.transaction();
      try {
        await this.warehouseService.consumeStockForSale(
          tenantId,
          warehouseId,
          items.map((it) => ({
            product_variant_id: it.product_variant_id,
            quantity: Number(it.quantity),
          })),
          txn,
        );
        await txn.query(apartado.completeSale, [saleId]);
        // Apartados creados antes de FNZ-RT-02 quedaron sin costo de venta.
        await txn.query(saleItems.fixCostAtSale, [saleId]);

        // Asiento de la venta al entregarse el apartado (FNZ-X-04): todo el
        // total contra Cuentas por Cobrar, que los abonos ya fueron
        // acreditando; mas el costo de venta.
        await this.journalService.trySecondary(
          txn,
          `apartado ${saleId}`,
          async () => {
            const { rows } = await txn.query(apartado.getSaleForJournal, [
              saleId,
            ]);
            const sale = rows[0];
            if (!sale) return;
            const entryDate = new Date();
            await this.journalService.generateSaleJournal(
              {
                tenantId,
                saleId,
                saleCondition: '04',
                subtotalAmount: Number(sale.subtotal_amount),
                taxAmount: Number(sale.tax_amount),
                totalAmount: Number(sale.total_amount),
                settlement: { cash: 0, bank: 0, points: 0 },
                currencyId: Number(sale.currency_id ?? 1),
                entryDate,
              },
              txn,
            );
            const totalCost = Number(sale.total_cost);
            if (totalCost > 0) {
              await this.journalService.generateSaleCogsJournal(
                { tenantId, saleId, totalCost, entryDate },
                txn,
              );
            }
          },
        );
        await txn.commit();
      } catch (err) {
        await txn.rollback();
        throw err;
      }
    } catch (error) {
      this.logger.error(
        `Error completando apartado ${saleId}: ${(error as Error).message}`,
      );
    }
  }

  async updateCollection(
    collectionId: string,
    dto: UpdateCollectionDto,
    session: IUserSession,
  ) {
    const accessResult = await this.db.query(collections.getCollectionAccess, [
      collectionId,
    ]);
    const access = accessResult.rows[0] as
      | {
          sale_collection_id: string;
          tenant_id: string;
          sale_account_receivable_id: string;
        }
      | undefined;

    if (!access) {
      throw new NotFoundException('Cobro no encontrado');
    }

    this.assertTenantAccess(access.tenant_id, session);

    const txn = await this.db.transaction();
    try {
      await txn.query(collections.updateCollection, [
        dto.amount_paid,
        dto.payment_method_id,
        dto.currency_id ?? null,
        dto.payment_reference ?? null,
        collectionId,
        dto.original_amount ?? null,
        dto.exchange_rate ?? null,
      ]);

      await txn.query(collections.recalcReceivableTotals, [
        access.sale_account_receivable_id,
      ]);

      const receivableResult = await txn.query(ar.getUpdatedReceivableById, [
        access.sale_account_receivable_id,
      ]);

      await txn.commit();

      return {
        collection_id: collectionId,
        sale_account_receivable: receivableResult.rows[0] ?? null,
      };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  private assertTenantAccess(resourceTenantId: string, session: IUserSession) {
    if (this.tenantScope.isSuperuser(session)) {
      return;
    }
    if (resourceTenantId !== session.tenant_id) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso',
      );
    }
  }
}
