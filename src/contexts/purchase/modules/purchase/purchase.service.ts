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
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { purchaseQueries } from '@purchase/purchase.queries';
import { WarehouseService } from '@/contexts/inventory/modules/warehouse/warehouse.service';
import { AccountingJournalService } from '@/contexts/finances/modules/accounting/accounting-journal.service';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const { purchase, payments, ap, catalog } = purchaseQueries;
const SUPERUSER_HIERARCHY = 1;
const INVOICE_EDITABLE_ORDER_STATUS_ID = 2; // Shipped / "enviada"

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
    const allowedTransitions: Record<number, number[]> = {
      1: [2, 4],
      2: [3, 4],
      3: [],
      4: [],
    };

    if (currentStatus === statusId) {
      return {
        ...(await this.getPurchaseOrderById(orderId, session)),
        message: 'La orden ya tiene ese estado',
      };
    }

    const isAllowed = (allowedTransitions[currentStatus] || []).includes(
      statusId,
    );
    if (!isAllowed) {
      throw new BadRequestException(
        `Transicion invalida: ${currentStatus} -> ${statusId}`,
      );
    }

    if (statusId === 3) {
      const txn = await this.db.transaction();
      try {
        // The status UPDATE fires purchase_schema.create_goods_receipt, which
        // in turn calls purchase_schema.apply_inventory_on_delivery to push
        // the items into inventory_schema.inventory at the destination
        // warehouse (with composite expansion via product_variant_composition).
        // Inventory is therefore handled at the DB level and we MUST NOT call
        // warehouseService.addStockToProduct here: it uses a separate
        // connection outside this txn, would block on the row lock that the
        // trigger holds, and double-count the stock.
        await txn.query(purchase.updateOrderStatus, [statusId, orderId]);

        try {
          const amountsResult = await txn.query(
            purchase.getOrderAmountsForJournal,
            [orderId],
          );
          if (amountsResult.rows.length > 0) {
            const row = amountsResult.rows[0];
            await this.journalService.generatePurchaseJournal(
              {
                tenantId: row.tenant_id,
                purchaseOrderId: orderId,
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
            `Error generating purchase journal for order ${orderId}: ${(accountingError as Error).message}`,
          );
        }

        await txn.commit();
      } catch (error) {
        await txn.rollback();
        throw error;
      }
    } else {
      await this.db.query(purchase.updateOrderStatus, [statusId, orderId]);
    }

    return this.getPurchaseOrderById(orderId, session);
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
