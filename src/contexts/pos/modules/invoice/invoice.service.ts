import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { Invoice, InvoiceDB, FullInvoice } from './interface/invoice.interface';
import { posQueries } from '@pos/pos.queries';
import { InvalidInvoice } from '@/common/errors/invalid_bill.error';
import { InvoiceNotFound } from '@/common/errors/invoice_not_found.error';

const { invoice } = posQueries;

@Injectable()
export class InvoiceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createInvoice(data: Invoice, dbClient?: any) {
    const {
      tenant_customer_id,
      currency_id,
      subtotal_amount,
      tax_amount,
      total_amount,
      due_date,
      cash_register_session_id,
      points_accumulated,
      ad_message,
      amount_paid,
      change_amount,
      invoiced_at,
      updated_at,
      sale_id,
    } = data;
    const client = dbClient || this.db;
    const res = await client.query(invoice.create, [
      tenant_customer_id,
      currency_id,
      subtotal_amount,
      tax_amount,
      total_amount,
      due_date ?? null,
      cash_register_session_id ?? null,
      points_accumulated ?? 0,
      ad_message ?? null,
      amount_paid ?? 0,
      change_amount ?? 0,
      invoiced_at,
      updated_at,
      sale_id,
    ]);
    if (res.rows.length == 0) throw new InvalidInvoice();

    // Poblar las lineas de la factura desde los sale_item. El encabezado ya trae
    // los totales autoritativos de la venta; los items alimentan el detalle
    // impreso y el calculo de IVA de notas de credito.
    await client.query(invoice.createItemsFromSale, [
      res.rows[0].invoice_id,
      sale_id,
    ]);

    return { message: 'Invoice created!', invoice: res.rows[0] };
  }

  async getTenantInvoices(tenantId: string): Promise<InvoiceDB[]> {
    const result = await this.db.query(invoice.getBills, [tenantId]);
    return result.rows;
  }

  async getCustomerInvoices(
    tenantId: string,
    doc: string,
  ): Promise<InvoiceDB[]> {
    const result = await this.db.query(invoice.getCustomerInvoices, [
      tenantId,
      doc,
    ]);
    return result.rows;
  }

  async getInvoiceById(saleId: string): Promise<FullInvoice> {
    const result = await this.db.query(invoice.getInvoiceById, [saleId]);
    if (result.rows.length == 0) throw new InvoiceNotFound();
    return result.rows[0];
  }

  async getInvoiceBySaleId(saleId: string): Promise<FullInvoice | null> {
    const result = await this.db.query(invoice.getInvoiceBySaleId, [saleId]);
    return result.rows[0] ?? null;
  }

  async deleteInvoice(invoiceId: string) {
    const result = await this.db.query(invoice.deleteInvoice, [invoiceId]);
    if (result.rows.length == 0)
      throw new InternalServerErrorException('Error deleting invoice from db.');
    return { message: `Invoice with id: ${invoiceId} deleted` };
  }
}
