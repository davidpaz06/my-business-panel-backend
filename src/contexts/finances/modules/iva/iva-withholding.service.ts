import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { AccountingJournalService } from '../accounting/accounting-journal.service';
import { ivaWithholdingQueries } from './iva-withholding.queries';

export interface WithholdingConfig {
  is_agent: boolean;
  suppliers: Array<{
    supplier_id: string;
    supplier_name: string;
    iva_retention_percentage: number;
  }>;
}

/**
 * Retencion de IVA en compras (FNZ-IV-06). Modelo parametrizable: el tenant
 * marca si es agente de retencion y cada proveedor lleva el porcentaje a
 * retener. Ningun porcentaje ni sujeto obligado se asume: los carga el
 * contador segun la normativa vigente del SENIAT.
 */
@Injectable()
export class IvaWithholdingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly journalService: AccountingJournalService,
  ) {}

  async getConfig(tenantId: string): Promise<WithholdingConfig> {
    const [flag, suppliers] = await Promise.all([
      this.db.query(ivaWithholdingQueries.getAgentFlag, [tenantId]),
      this.db.query(ivaWithholdingQueries.listSuppliers, [tenantId]),
    ]);
    return {
      is_agent: Boolean(flag.rows[0]?.is_iva_withholding_agent),
      suppliers: suppliers.rows,
    };
  }

  async setAgent(tenantId: string, isAgent: boolean) {
    const { rows } = await this.db.query(ivaWithholdingQueries.setAgentFlag, [
      tenantId,
      isAgent,
    ]);
    if (!rows.length) throw new NotFoundException('Empresa no encontrada');
    return { is_agent: rows[0].is_iva_withholding_agent as boolean };
  }

  async setSupplierPercentage(
    tenantId: string,
    supplierId: string,
    percentage: number,
  ) {
    const { rows } = await this.db.query(
      ivaWithholdingQueries.setSupplierPercentage,
      [tenantId, supplierId, percentage],
    );
    if (!rows.length) throw new NotFoundException('Proveedor no encontrado');
    return rows[0];
  }

  async listCandidates(tenantId: string) {
    const { rows } = await this.db.query(ivaWithholdingQueries.listCandidates, [
      tenantId,
    ]);
    return rows;
  }

  async list(tenantId: string, start: string, end: string) {
    const { rows } = await this.db.query(ivaWithholdingQueries.listWithholdings, [
      tenantId,
      start,
      end,
    ]);
    return rows;
  }

  /**
   * Emite el comprobante de una factura de proveedor y registra su asiento
   * (Dr CxP / Cr Retenciones por Pagar) en la misma transaccion: si el asiento
   * falla, no queda comprobante.
   */
  async issue(tenantId: string, userId: string, supplierInvoiceId: string) {
    const { rows } = await this.db.query(
      ivaWithholdingQueries.getInvoiceForWithholding,
      [tenantId, supplierInvoiceId],
    );
    const invoice = rows[0] as
      | {
          supplier_invoice_id: string;
          invoice_number: string;
          taxable_base: number;
          iva_amount: number;
          supplier_id: string;
          retention_percentage: number;
          is_iva_withholding_agent: boolean;
        }
      | undefined;
    if (!invoice) throw new NotFoundException('Factura de proveedor no encontrada');
    if (!invoice.is_iva_withholding_agent) {
      throw new BadRequestException(
        'La empresa no esta marcada como agente de retencion de IVA',
      );
    }
    if (!(invoice.retention_percentage > 0)) {
      throw new BadRequestException(
        'El proveedor no tiene porcentaje de retencion de IVA configurado',
      );
    }
    if (!(invoice.iva_amount > 0)) {
      throw new BadRequestException('La factura no tiene IVA que retener');
    }

    const retained = new Decimal(invoice.iva_amount)
      .mul(invoice.retention_percentage)
      .div(100)
      .toDecimalPlaces(3);

    const txn = await this.db.transaction();
    try {
      // Correlativo por tenant sin carreras: se serializa la numeracion.
      await txn.query(ivaWithholdingQueries.lockTenantNumbering, [tenantId]);
      const { rows: num } = await txn.query(
        ivaWithholdingQueries.nextVoucherNumber,
        [tenantId],
      );
      const { rows: rate } = await txn.query(ivaWithholdingQueries.currentRate, [
        tenantId,
      ]);

      const { rows: created } = await txn.query(
        ivaWithholdingQueries.insertWithholding,
        [
          tenantId,
          Number(num[0].next_number),
          supplierInvoiceId,
          invoice.supplier_id,
          invoice.invoice_number,
          invoice.taxable_base,
          invoice.iva_amount,
          invoice.retention_percentage,
          retained.toNumber(),
          rate[0]?.rate ?? null,
          userId,
        ],
      );
      const withholdingId = created[0].withholding_id as string;

      try {
        await this.journalService.generateWithholdingJournal(
          {
            tenantId,
            withholdingId,
            retainedAmount: retained.toNumber(),
            currencyId: 2,
            entryDate: new Date(),
            description: `Retencion de IVA ${created[0].voucher_number} - factura ${invoice.invoice_number}`,
          },
          txn,
        );
      } catch (journalError) {
        throw new BadRequestException(
          'No se pudo registrar el asiento de la retencion: ' +
            (journalError as Error).message,
        );
      }

      await txn.commit();
      return {
        withholding_id: withholdingId,
        voucher_number: Number(created[0].voucher_number),
        retained_amount: retained.toNumber(),
      };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      // Violacion del indice unico: ya existe un comprobante vigente.
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'La factura ya tiene un comprobante de retencion vigente',
        );
      }
      throw error;
    }
  }

  /** Anula el comprobante (conserva su numero) y revierte su asiento. */
  async void(tenantId: string, withholdingId: string) {
    const { rows } = await this.db.query(ivaWithholdingQueries.getWithholding, [
      tenantId,
      withholdingId,
    ]);
    if (!rows.length) throw new NotFoundException('Comprobante no encontrado');
    if (rows[0].is_voided) {
      throw new BadRequestException('El comprobante ya esta anulado');
    }

    const txn = await this.db.transaction();
    try {
      await txn.query(ivaWithholdingQueries.voidWithholding, [
        tenantId,
        withholdingId,
      ]);
      await this.journalService.reverseEntryBySource(
        tenantId,
        'IVA_WITHHOLDING',
        withholdingId,
        new Date(),
        `Anulacion de retencion de IVA - ${withholdingId}`,
        txn,
      );
      await txn.commit();
      return { withholding_id: withholdingId, is_voided: true };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }
}
