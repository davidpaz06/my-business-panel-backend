import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { FullSaleDto, NewSingleSaleDto } from './dto/sales.dto';
import { posQueries } from '@pos/pos.queries';

import { CustomerPaymentService } from '../../../general/modules/customer_payment/customer-payment.service';
import { Condition, SaleFromDb } from './interface/sale.interface';
import { SaleCreationError } from '@/common/errors/sale_creation.error';
import { paginate } from '@/common/utilities/paginator';
import { InvoiceService } from '../invoice/invoice.service';
import { AccountingJournalService } from '../../../finances/modules/accounting/accounting-journal.service';
import { SaleItemService } from '../sale-item/sale-item.service';
import { WarehouseService } from '@/contexts/inventory/modules/warehouse/warehouse.service';

const { sales, loyaltyScore } = posQueries;

@Injectable()
export class SaleService {
  private readonly logger = new Logger(SaleService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly saleItemService: SaleItemService,
    private readonly customerPaymentService: CustomerPaymentService,
    private readonly warehouseService: WarehouseService,
    private readonly invoiceService: InvoiceService,
    private readonly journalService: AccountingJournalService,
  ) {}

  async createSale(data: NewSingleSaleDto) {
    const params = [
        data.branch_id,
        data.tenant_customer_id,
        data.sale_condition,
        data.sale_date,
        data.currency_id,
        data.subtotal_amount,
        data.tax_amount,
        data.total_amount,
        data.is_completed,
        null, // seller_user_id
      ],
      { rows } = await this.db.query(sales.createSale, params);

    const saleId = rows[0].sale_id as string;

    if (data.is_completed) {
      await this.linkSaleToActiveSession(
        this.db,
        data.branch_id,
        saleId,
        data.sale_date,
        data.cash_register_id ?? null,
      );
    }

    return saleId;
  }

  async createFullSale(data: FullSaleDto) {
    const { items, payments } = data;

    const hasPointsPayment = (payments ?? []).some(
      (p) => p.is_points_redemption,
    );
    if (hasPointsPayment && !data.tenant_customer_id) {
      throw new BadRequestException(
        'Se requiere asociar un cliente para realizar pagos con puntos de fidelidad.',
      );
    }

    if (data.sale_condition === '02' && !data.due_date) {
      throw new BadRequestException(
        'due_date es requerido para ventas a crédito (condición 02).',
      );
    }

    if (data.sale_condition === '04' && !data.due_date) {
      throw new BadRequestException(
        'due_date es requerido para ventas en apartado (condición 04).',
      );
    }

    const totalSale = data.subtotal_amount + data.tax_amount;
    const upfront = data.amount_paid ?? 0;
    const arBalance = totalSale - upfront;
    const isCredit = data.sale_condition === '02';
    const isApartado = data.sale_condition === '04';
    // Credit sale or apartado (layaway) with outstanding balance is not
    // "completed" until fully paid -- apartado was missing here (bug found
    // in the VE credit-sale audit): a layaway with balance > 0 could be
    // flagged is_completed = true, contradicting its own semantics
    // (merchandise reserved, not released until paid) and polluting any
    // report/dashboard that filters on sale.is_completed as "realized sale".
    const effectiveIsCompleted =
      data.is_completed && !((isCredit || isApartado) && arBalance > 0.01);

    const txn = await this.db.transaction();
    try {
      let saleId: string;
      try {
        const { rows } = await txn.query(sales.createSale, [
          data.branch_id,
          data.tenant_customer_id,
          data.sale_condition,
          new Date(data.sale_date),
          data.currency_id,
          data.subtotal_amount,
          data.tax_amount,
          data.total_amount,
          effectiveIsCompleted,
          data.seller_user_id ?? null,
        ]);
        saleId = rows[0].sale_id;

        if (data.is_completed || isApartado) {
          await this.linkSaleToActiveSession(
            txn,
            data.branch_id,
            saleId,
            new Date(data.sale_date),
            data.cash_register_id ?? null,
          );
        }

        await txn.bulkInsert(
          'pos_schema.sale_item',
          [
            'sale_id',
            'tenant_id',
            'product_variant_id',
            'quantity',
            'unit_price',
            'total_price',
            'sale_price_type',
            'promotion_id',
            'royalty_option_id',
            'royalty_rule_id',
            'original_price',
            'discount_applied',
          ],
          items.map((item) => [
            saleId,
            item.tenant_id,
            item.product_variant_id,
            item.quantity,
            item.unit_price,
            item.total_price,
            item.sale_price_type ?? 'NORMAL',
            item.promotion_id ?? null,
            item.royalty_option_id ?? null,
            item.royalty_rule_id ?? null,
            item.original_price ?? item.unit_price,
            item.discount_applied ?? 0,
          ]),
        );

        // Decrement stock from the branch's "sales floor" warehouse.
        // Apartado sales skip this — stock is reserved but not consumed until
        // the balance is fully paid (handled by AccountsReceivableService).
        if (!isApartado) {
          const wh = await txn.query(
            `SELECT warehouse_id FROM inventory_schema.warehouse
             WHERE branch_id = $1 AND is_branch = true LIMIT 1`,
            [data.branch_id],
          );
          if (!wh.rows[0]) {
            throw new BadRequestException(
              'Branch sin warehouse de piso de venta (is_branch=true)',
            );
          }
          await this.warehouseService.consumeStockForSale(
            data.tenant_id,
            wh.rows[0].warehouse_id,
            items.map((it) => ({
              product_variant_id: it.product_variant_id,
              quantity: Number(it.quantity),
            })),
            txn,
          );
        }

        await txn.bulkInsert(
          'pos_schema.customer_payment',
          [
            'tenant_customer_id',
            'sale_id',
            'payment_method_id',
            'is_points_redemption',
            'points_redeemed',
            'points_to_currency_rate',
            'payment_amount',
            'payment_date',
            'currency_id',
            'verified',
          ],
          payments.map((p) => [
            p.tenant_customer_id,
            saleId,
            p.payment_method_id,
            p.is_points_redemption,
            p.points_redeemed,
            p.points_to_currency_rate,
            p.payment_amount,
            p.payment_date,
            p.currency_id,
            p.verified,
          ]),
        );

        // Points credited at sale time are proportional to the upfront paid
        // amount. Remaining points accrue as collections are registered.
        const loyaltyBaseAmount =
          isCredit || isApartado
            ? Math.min(upfront, data.total_amount)
            : data.total_amount;
        let pointsAccumulated = 0;
        if (data.tenant_customer_id) {
          const { rows: lpRows } = await txn.query(
            loyaltyScore.getActiveProgramForTenant,
            [data.tenant_id],
          );
          const lp = lpRows[0];
          if (
            lp &&
            data.total_amount >= Number(lp.minimum_purchase_for_points)
          ) {
            pointsAccumulated = Math.floor(
              loyaltyBaseAmount * Number(lp.points_earned_per_currency_unit),
            );
          }
        }

        await this.invoiceService.createInvoice(
          {
            tenant_customer_id: data.tenant_customer_id ?? null,
            currency_id: data.currency_id,
            subtotal_amount: data.subtotal_amount,
            tax_amount: data.tax_amount,
            total_amount: data.total_amount,
            due_date: data.due_date ? new Date(data.due_date) : new Date(),
            cash_register_session_id: data.cash_register_session_id ?? null,
            points_accumulated: pointsAccumulated,
            ad_message: data.ad_message ?? null,
            amount_paid: data.amount_paid ?? 0,
            change_amount: data.change_amount ?? 0,
            invoiced_at: new Date(),
            updated_at: new Date(),
            sale_id: saleId,
          },
          txn,
        );

        const needsAr = (isCredit && arBalance > 0) || isApartado;

        if (needsAr) {
          const arTypesRes = await txn.query(
            `SELECT account_receivable_type_id, type_name
             FROM general_schema.account_receivable_type
             WHERE type_name IN ('venta_credito', 'venta_apartado')`,
          );
          const arTypeMap = new Map<string, string>(
            arTypesRes.rows.map(
              (r: {
                type_name: string;
                account_receivable_type_id: string;
              }) => [r.type_name, r.account_receivable_type_id],
            ),
          );

          const arTypeName =
            data.sale_condition === '04' ? 'venta_apartado' : 'venta_credito';
          const arTypeId = arTypeMap.get(arTypeName) ?? null;

          const arRes = await txn.query(
            `INSERT INTO general_schema.account_receivable(
               account_receivable_type_id, account_status, tenant_id, tenant_customer_id,
               has_invoice, has_tax, subtotal, amount_paid, is_paid, due_date
             ) VALUES (
               $1,
               (SELECT status_id FROM general_schema.account_receivable_status WHERE status_name = 'Pending' LIMIT 1),
               $2, $3, TRUE, $4, $5, $6, FALSE, $7
             )
             RETURNING account_receivable_id`,
            [
              arTypeId,
              data.tenant_id,
              data.tenant_customer_id ?? null,
              data.tax_amount > 0,
              data.subtotal_amount,
              upfront,
              new Date(data.due_date!),
            ],
          );
          const accountReceivableId: string =
            arRes.rows[0].account_receivable_id;

          const sarRes = await txn.query(
            `INSERT INTO pos_schema.sale_account_receivable(
               account_receivable_id, sale_id, tax_amount, account_receivable_status
             ) VALUES (
               $1, $2, $3,
               (SELECT status_id FROM general_schema.account_receivable_status WHERE status_name = $4 LIMIT 1)
             )
             RETURNING sale_account_receivable_id`,
            [
              accountReceivableId,
              saleId,
              data.tax_amount,
              upfront > 0 ? 'Partial Paid' : 'Pending',
            ],
          );
          const saleAccountReceivableId: string =
            sarRes.rows[0].sale_account_receivable_id;

          // Record upfront payment as a sale_collection row so subsequent
          // recalcs (SUM of collections) reflect the initial amount.
          if (upfront > 0) {
            const initialPayment = (payments ?? []).find(
              (p) => Number(p.payment_amount ?? 0) > 0,
            );
            await txn.query(
              `INSERT INTO pos_schema.sale_collection
                 (sale_account_receivable_id, amount_paid, payment_method_id, currency_id,
                  original_amount, exchange_rate, payment_reference, payment_date, notes)
               VALUES ($1, $2, $3, COALESCE($4, 1), $5, $6, $7, $8, $9)`,
              [
                saleAccountReceivableId,
                upfront,
                initialPayment?.payment_method_id ?? 1,
                data.currency_id ?? null,
                upfront,
                1,
                null,
                new Date(data.sale_date),
                'Abono inicial registrado al crear la venta',
              ],
            );
          }
        }

        if (!isApartado) {
          try {
            await this.journalService.generateSaleJournal(
              {
                tenantId: data.tenant_id,
                saleId,
                saleCondition: data.sale_condition,
                subtotalAmount: data.subtotal_amount,
                taxAmount: data.tax_amount,
                totalAmount: data.total_amount,
                entryDate: new Date(data.sale_date),
              },
              txn,
            );

            let totalCost = 0;
            for (const item of items) {
              const res = await txn.query(
                `SELECT COALESCE(weighted_avg_cost, cost_price, 0) AS item_cost
                 FROM general_schema.product_variant
                 WHERE tenant_id = $1 AND product_variant_id = $2 LIMIT 1`,
                [data.tenant_id, item.product_variant_id],
              );
              if (res.rows.length > 0) {
                const itemCost = Number(res.rows[0].item_cost);
                await txn.query(
                  `UPDATE pos_schema.sale_item
                   SET cost_price_at_sale = $1
                   WHERE sale_id = $2 AND product_variant_id = $3 AND tenant_id = $4`,
                  [itemCost, saleId, item.product_variant_id, item.tenant_id],
                );
                if (itemCost > 0) {
                  totalCost += itemCost * item.quantity;
                }
              }
            }

            if (totalCost > 0) {
              await this.journalService.generateSaleCogsJournal(
                {
                  tenantId: data.tenant_id,
                  saleId,
                  totalCost,
                  entryDate: new Date(data.sale_date),
                },
                txn,
              );
            }
          } catch (accountingError) {
            // Log but don't fail the sale — accounting is secondary
            this.logger.error(
              `Error generating journal entries for sale ${saleId}: ${(accountingError as Error).message}`,
            );
          }
        }

        await txn.commit();
      } catch (txnError) {
        await txn.rollback();
        throw txnError;
      }

      // Accumulate loyalty points — non-blocking, must not fail the sale
      if (data.tenant_customer_id) {
        try {
          const { rows: programRows } = await this.db.query(
            loyaltyScore.getActiveProgramForTenant,
            [data.tenant_id],
          );
          const program = programRows[0];
          if (
            program &&
            data.total_amount >= Number(program.minimum_purchase_for_points)
          ) {
            const earnBase =
              isCredit || isApartado
                ? Math.min(upfront, data.total_amount)
                : data.total_amount;
            const pointsEarned = Math.floor(
              earnBase * Number(program.points_earned_per_currency_unit),
            );
            if (pointsEarned > 0) {
              await this.db.query(loyaltyScore.upsertEarned, [
                data.tenant_id,
                data.tenant_customer_id,
                pointsEarned,
              ]);
            }
          }
          // Deduct redeemed points from any points-redemption payment rows
          const redeemedPoints = (data.payments ?? []).reduce(
            (sum, p) =>
              sum + (p.is_points_redemption ? (p.points_redeemed ?? 0) : 0),
            0,
          );
          if (redeemedPoints > 0) {
            await this.db.query(loyaltyScore.deductRedeemed, [
              data.tenant_id,
              data.tenant_customer_id,
              redeemedPoints,
            ]);
          }
        } catch (loyaltyError) {
          this.logger.error(
            `Loyalty points update failed for sale ${saleId}: ${(loyaltyError as Error).message}`,
          );
        }
      }

      return { saleId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Error creating full sale: ${(error as Error).message}`,
      );
      throw new SaleCreationError();
    }
  }

  async getAllSalesByBranch(branch_id: string): Promise<SaleFromDb[]> {
    const result = await this.db.query(sales.getSalesByBranch, [branch_id]);
    return result.rows;
  }

  async getAllSalesByTenant(tenantId: string, limit = 100, offset = 0) {
    return paginate({
      dbClient: this.db,
      table: `
        (SELECT s.sale_id, s.sale_date, s.total_amount, s.subtotal_amount, s.tax_amount,
          s.is_completed, s.is_refunded, s.tenant_customer_id,
          s.created_at, b.branch_id, b.branch_name, c.currency_code, c.symbol, b.tenant_id,
          (SELECT rt.return_transaction_id FROM pos_schema.return_transaction rt
            INNER JOIN pos_schema.invoice inv ON inv.invoice_id = rt.invoice_id
            WHERE inv.sale_id = s.sale_id LIMIT 1
          ) AS return_transaction_id
        FROM pos_schema.sale s
        INNER JOIN general_schema.branch b USING(branch_id)
        INNER JOIN general_schema.currency c USING(currency_id)
        ) AS paginated_sales
      `,
      selectColumns: [
        'sale_id',
        'sale_date',
        'total_amount',
        'subtotal_amount',
        'tax_amount',
        'is_completed',
        'is_refunded',
        'branch_id',
        'branch_name',
        'currency_code',
        'symbol',
        'tenant_customer_id',
        'created_at',
        'return_transaction_id',
      ],
      pkFields: ['sale_id'],
      where: { tenant_id: tenantId },
      options: { limit, offset, sortBy: 'created_at', order: 'DESC' },
    });
  }

  async getAllConditions(): Promise<Condition[]> {
    const { rows } = await this.db.query(sales.getConditions);

    return rows;
  }

  private async linkSaleToActiveSession(
    executor: {
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{ rowCount?: number | null }>;
    },
    branchId: string,
    saleId: string,
    transactionTime?: Date | null,
    cashRegisterId?: string | null,
  ): Promise<void> {
    const result = await executor.query(sales.linkSaleToActiveSession, [
      branchId,
      saleId,
      transactionTime ?? null,
      cashRegisterId ?? null,
    ]);

    if (!result.rowCount || result.rowCount < 1) {
      this.logger.warn(
        `Sale ${saleId} was completed without an active cash register session in branch ${branchId}${cashRegisterId ? ` for cash register ${cashRegisterId}` : ''}`,
      );
    }
  }
}
