import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { posQueries } from '@pos/pos.queries';
import { purchaseQueries } from '@purchase/purchase.queries';
import {
  CreateCreditDebitNoteDto,
  VoidCreditDebitNoteDto,
} from './dto/credit-debit-note.dto';
import {
  CreditDebitNote,
  InvoiceContextForNote,
} from './interface/credit-debit-note.interface';

const { creditDebitNote } = posQueries;
const { supplierCredits } = purchaseQueries;

/**
 * Notas de credito/debito sobre facturas de venta (MBP_Cambios_CR_a_Venezuela.md,
 * seccion 5 -- POS). La factura original nunca se edita ni anula; la nota es
 * un registro de ajuste aparte, auditable. Si la venta tiene cuenta por
 * cobrar abierta, un trigger de DB (apply_credit_debit_note_to_ar,
 * migrations/pos/032) refleja el ajuste en lo que el cliente aun debe --
 * este service no toca account_receivable directamente.
 */
@Injectable()
export class CreditDebitNoteService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateCreditDebitNoteDto,
  ): Promise<CreditDebitNote> {
    const ctxRes = await this.db.query(creditDebitNote.getInvoiceContext, [
      dto.invoice_id,
    ]);
    const ctx: InvoiceContextForNote | undefined = ctxRes.rows[0];

    if (!ctx || ctx.tenant_id !== tenantId) {
      throw new NotFoundException(`Factura ${dto.invoice_id} no encontrada.`);
    }

    if (dto.note_type === 'credit') {
      const sumsRes = await this.db.query(creditDebitNote.sumActiveByInvoice, [
        dto.invoice_id,
      ]);
      const sums = sumsRes.rows[0] as {
        total_credit: string;
        total_debit: string;
      };

      // Saldo creditable: lo facturado, menos creditos ya aplicados, mas
      // debitos ya aplicados (un debito sube el techo -- son cargos
      // adicionales que tambien podrian acreditarse despues).
      const creditableBalance = new Decimal(ctx.total_amount)
        .minus(sums.total_credit)
        .plus(sums.total_debit);

      if (new Decimal(dto.amount).greaterThan(creditableBalance.plus(0.01))) {
        throw new BadRequestException(
          `El monto del credito (${dto.amount}) excede el saldo facturado disponible ` +
            `(${creditableBalance.toFixed(2)}). Revise las notas ya aplicadas a esta factura.`,
        );
      }
    }

    if (dto.reason_kind === 'mercancia_danada' && dto.note_type === 'credit') {
      const supplierAccessRes = await this.db.query(
        supplierCredits.getSupplierAccess,
        [dto.supplier_id],
      );
      const supplierAccess = supplierAccessRes.rows[0] as
        | { supplier_id: string; tenant_id: string }
        | undefined;

      if (!supplierAccess || supplierAccess.tenant_id !== tenantId) {
        throw new NotFoundException(
          `Proveedor ${dto.supplier_id} no encontrado.`,
        );
      }
    }

    const txn = await this.db.transaction();
    try {
      const result = await txn.query(creditDebitNote.create, [
        tenantId,
        dto.invoice_id,
        dto.note_type,
        dto.reason_kind,
        dto.description ?? null,
        dto.amount,
        dto.currency_id ?? null,
        userId,
      ]);
      const note = result.rows[0] as CreditDebitNote;

      // Vinculo con Compras (MBP_Cambios_CR_a_Venezuela.md, seccion 5): el
      // monto de una nota de credito por mercancia danada queda disponible
      // como credito de proveedor, aplicable en la proxima orden de compra.
      if (dto.reason_kind === 'mercancia_danada' && dto.note_type === 'credit') {
        await txn.query(supplierCredits.create, [
          tenantId,
          dto.supplier_id,
          note.note_id,
          dto.amount,
        ]);
      }

      await txn.commit();
      return note;
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  async listByInvoice(
    tenantId: string,
    invoiceId: string,
  ): Promise<CreditDebitNote[]> {
    const ctxRes = await this.db.query(creditDebitNote.getInvoiceContext, [
      invoiceId,
    ]);
    const ctx: InvoiceContextForNote | undefined = ctxRes.rows[0];
    if (!ctx || ctx.tenant_id !== tenantId) {
      throw new NotFoundException(`Factura ${invoiceId} no encontrada.`);
    }

    const result = await this.db.query(creditDebitNote.listByInvoice, [
      invoiceId,
    ]);
    return result.rows;
  }

  async listByTenant(tenantId: string) {
    const result = await this.db.query(creditDebitNote.listByTenant, [
      tenantId,
    ]);
    return result.rows;
  }

  async voidNote(
    tenantId: string,
    noteId: string,
    _dto: VoidCreditDebitNoteDto,
  ): Promise<CreditDebitNote> {
    const existing = await this.db.query(creditDebitNote.getById, [noteId]);
    const row = existing.rows[0] as
      | { note_id: string; tenant_id: string; is_voided: boolean }
      | undefined;

    if (!row || row.tenant_id !== tenantId) {
      throw new NotFoundException(`Nota ${noteId} no encontrada.`);
    }
    if (row.is_voided) {
      throw new BadRequestException('Esta nota ya esta anulada.');
    }

    const result = await this.db.query(creditDebitNote.void, [noteId]);
    return result.rows[0];
  }
}
