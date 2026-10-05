import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import {
  BulkUpdateProducts,
  ReturnProduct,
  ReturnTransactionDto,
} from './dto/return_transaction.dto';
import { bulkReturns, posQueries } from '@pos/pos.queries';
import { FindReturnsDto } from './dto/find_returns.dto';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

const { returns } = posQueries;

interface SaleContextRow {
  sale_id: string;
  tenant_customer_id: string | null;
  sale_date: Date;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  is_completed: boolean;
  branch_id: string;
  branch_name: string | null;
  tenant_id: string;
  currency_code: string | null;
  currency_symbol: string | null;
  first_name: string | null;
  last_name: string | null;
  document_number: string | null;
  customer_email: string | null;
  invoice_id: string | null;
  digital_invoiced_at: Date | null;
  digital_subtotal: string | null;
  digital_tax: string | null;
  digital_total: string | null;
}

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenantScope: TenantScopeService,
  ) {}

  /**
   * Contexto de la venta acotado al tenant (scopeTenantId null = superusuario
   * de plataforma). Una venta de otra empresa responde 404 como una inexistente.
   */
  private async loadSaleContext(
    saleId: string,
    scopeTenantId: string | null,
  ): Promise<SaleContextRow> {
    const ctxResult = await this.db.query(returns.getSaleContext, [
      saleId,
      scopeTenantId,
    ]);
    if (!ctxResult.rows.length) {
      throw new NotFoundException(`Sale not found: ${saleId}`);
    }
    return ctxResult.rows[0];
  }

  /**
   * Returns the full refund context for a given sale: sale info, customer,
   * invoice (always exists for completed sales), and the line items.
   */
  async getSaleRefundContext(saleId: string, scopeTenantId: string | null) {
    const row = await this.loadSaleContext(saleId, scopeTenantId);

    const itemsResult = await this.db.query(returns.getSaleItemsForRefund, [
      saleId,
    ]);

    return {
      sale: {
        sale_id: row.sale_id,
        tenant_customer_id: row.tenant_customer_id,
        sale_date: row.sale_date,
        subtotal_amount: Number(row.subtotal_amount),
        tax_amount: Number(row.tax_amount),
        total_amount: Number(row.total_amount),
        is_completed: row.is_completed,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        tenant_id: row.tenant_id,
        currency_code: row.currency_code,
        currency_symbol: row.currency_symbol,
      },
      customer: row.tenant_customer_id
        ? {
            tenant_customer_id: row.tenant_customer_id,
            first_name: row.first_name,
            last_name: row.last_name,
            document_number: row.document_number,
            email: row.customer_email,
          }
        : null,
      invoice: row.invoice_id
        ? {
            invoice_id: row.invoice_id,
            invoiced_at: row.digital_invoiced_at,
            subtotal_amount: Number(row.digital_subtotal ?? 0),
            tax_amount: Number(row.digital_tax ?? 0),
            total_amount: Number(row.digital_total ?? 0),
          }
        : null,
      items: itemsResult.rows.map((it: any) => ({
        sale_item_id: it.sale_item_id,
        product_variant_id: it.product_variant_id,
        sku: it.sku,
        variant_name: it.variant_name,
        available_quantity: Number(it.available_quantity),
        unit_price: Number(it.unit_price),
        total_price: Number(it.total_price),
        invoice_item_id: it.invoice_item_id,
      })),
    };
  }

  /**
   * Creates a partial return for a sale. Auto-sets return_date server-side.
   * Resolves the invoice ID from the sale.
   */
  async createPartialRefund(
    data: ReturnTransactionDto,
    scopeTenantId: string | null,
  ) {
    const {
      sale_id,
      return_products,
      refund_method,
      return_status_id,
      description,
    } = data;

    if (!Array.isArray(return_products) || return_products.length === 0) {
      throw new BadRequestException(
        'Debe especificar al menos un producto a reembolsar',
      );
    }

    // Resolve invoice references and customer from the sale
    const ctx = await this.loadSaleContext(sale_id, scopeTenantId);

    // Las lineas devueltas deben ser de ESTA venta: sin esto se podrian
    // descontar lineas de ventas de otras empresas (el trigger de devolucion
    // reconcilia por sale_item_id).
    const itemIds = [...new Set(return_products.map((p) => p.sale_item_id))];
    const owned = await this.db.query(returns.countSaleItemsOfSale, [
      sale_id,
      itemIds,
    ]);
    if ((owned.rows[0]?.total ?? 0) !== itemIds.length) {
      throw new BadRequestException(
        'Alguna linea a reembolsar no pertenece a la venta indicada',
      );
    }

    // Un cliente enviado por el cliente HTTP debe ser del tenant de la venta.
    if (data.tenant_customer_id) {
      await this.tenantScope.assertOwnedByTenant(
        'customer',
        data.tenant_customer_id,
        ctx.tenant_id,
      );
    }

    if (!ctx.invoice_id) {
      throw new BadRequestException(
        'La venta no tiene factura asociada — no se puede reembolsar',
      );
    }

    const tenantCustomerId = data.tenant_customer_id ?? ctx.tenant_customer_id;

    // Compute total refund amount from line items
    const totalRefund = return_products.reduce((acc, p) => {
      const lineTotal = Number(
        (p.total_price ?? p.quantity * p.unit_price).toFixed(2),
      );
      return acc + lineTotal;
    }, 0);

    await this.db.query('BEGIN');
    try {
      // 1. Create return_transaction header (server sets return_date)
      const headerRes = await this.db.query(returns.newTransaction, [
        ctx.invoice_id,
        tenantCustomerId ?? null,
        Number(totalRefund.toFixed(2)),
        refund_method ?? null,
        return_status_id ?? null,
        description,
        null, // return_date — falls back to NOW() in SQL
      ]);

      const returnTransactionId: string =
        headerRes.rows[0].return_transaction_id;

      // 2. Bulk insert return_product rows. The update_on_return trigger
      //    handles all reconciliation (sale_item, invoice_item,
      //    invoice totals, sale totals).
      const productRows: ReturnProduct[] = return_products.map((p) => ({
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_price: Number(
          (p.total_price ?? p.quantity * p.unit_price).toFixed(2),
        ),
        sale_item_id: p.sale_item_id,
      }));

      const bulk = this.bulkInsertReturns(productRows, returnTransactionId);
      await this.db.query(bulk.query, bulk.values);

      await this.db.query('COMMIT');
      return {
        message: 'Reembolso parcial registrado correctamente',
        return_transaction_id: returnTransactionId,
        total_refund_amount: Number(totalRefund.toFixed(2)),
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Error al registrar reembolso',
      );
    }
  }

  /**
   * Full refund: marks the sale as refunded and creates a return_transaction
   * record. Invoices are preserved with the is_refunded flag on the sale
   * serving as the authoritative cancelled indicator.
   */
  async processFullRefund(
    saleId: string,
    description: string,
    scopeTenantId: string | null,
  ) {
    const ctx = await this.loadSaleContext(saleId, scopeTenantId);

    if (!ctx.invoice_id) {
      throw new BadRequestException(
        'La venta no tiene factura asociada — no se puede reembolsar',
      );
    }

    await this.db.query('BEGIN');
    try {
      const headerRes = await this.db.query(returns.newTransaction, [
        ctx.invoice_id,
        ctx.tenant_customer_id ?? null,
        Number(ctx.total_amount),
        null,
        null,
        description,
        null,
      ]);

      const returnTransactionId: string =
        headerRes.rows[0].return_transaction_id;

      await this.db.query(returns.markSaleRefunded, [saleId]);

      await this.db.query('COMMIT');
      return {
        message: 'Reembolso completo registrado',
        return_transaction_id: returnTransactionId,
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Error al procesar reembolso completo',
      );
    }
  }

  async getReturnDetail(
    returnTransactionId: string,
    scopeTenantId: string | null,
  ) {
    // Primero la cabecera acotada al tenant; los productos solo se leen si la
    // devolucion es del tenant.
    const headerResult = await this.db.query(returns.getById, [
      returnTransactionId,
      scopeTenantId,
    ]);

    if (!headerResult.rows.length) {
      throw new NotFoundException(
        `Return transaction not found: ${returnTransactionId}`,
      );
    }

    const productsResult = await this.db.query(returns.getProducts, [
      returnTransactionId,
    ]);

    return {
      transaction: headerResult.rows[0],
      products: productsResult.rows,
    };
  }

  async findReturns(
    findReturnsDto: FindReturnsDto,
    scopeTenantId: string | null,
  ) {
    const { rows } = await this.db.query(returns.find, [
      findReturnsDto.invoice_id,
      findReturnsDto.tenant_customer_id,
      findReturnsDto.return_status_id,
      findReturnsDto.refund_method,
      findReturnsDto.date_from,
      findReturnsDto.date_to,
      scopeTenantId,
    ]);
    return { results: rows };
  }

  bulkInsertReturns(
    products: ReturnProduct[],
    returnTransaction: string,
  ): { query: string; values: any[] } {
    if (!Array.isArray(products) || products.length === 0)
      return { query: '', values: [] };

    const values: any[] = [];
    const placeholders: string[] = [];
    let index = 1;

    const tuples = bulkReturns.length;

    products.forEach((p) => {
      const rowPlaceholder = [];
      for (let i = 0; i < tuples; i++) {
        rowPlaceholder.push(`$${index++}`);
      }
      placeholders.push(`(${rowPlaceholder.join(', ')})`);

      bulkReturns.forEach((k) => {
        if (k === 'return_transaction_id') {
          values.push(returnTransaction);
        } else {
          values.push(p[k as keyof ReturnProduct]);
        }
      });
    });

    const query = `
      INSERT INTO pos_schema.return_product (${bulkReturns.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING sale_item_id, quantity, total_price
    `;

    return { query, values };
  }

  // Kept for any external callers; no longer used by the partial refund flow
  // because update_on_return trigger now performs the reconciliation.
  generateBulkUpdate(data: BulkUpdateProducts[]) {
    const values: any[] = [];
    const placeholder: string[] = [];
    let index = 1;

    data.forEach((d) => {
      placeholder.push(`($${index++}::uuid, $${index++}, $${index++})`);
      values.push(d.sale_item_id, d.quantity, d.total_price);
    });

    const q = `
      UPDATE pos_schema.sale_item AS s
      SET
          quantity = COALESCE(s.quantity, 0) - data.quantity::integer,
          total_price = COALESCE(s.total_price, 0) - data.total_price::numeric
      FROM (
        VALUES ${placeholder.join(', ')}
      ) AS data(sale_item_id, quantity, total_price)
      WHERE s.sale_item_id = data.sale_item_id AND (COALESCE(s.quantity, 0) - data.quantity::integer) >= 0
    `;
    return { query: q, values: values };
  }
}
