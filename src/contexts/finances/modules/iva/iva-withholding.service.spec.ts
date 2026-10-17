import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IvaWithholdingService } from './iva-withholding.service';

const INVOICE = {
  supplier_invoice_id: 'inv-1',
  invoice_number: 'F-001',
  taxable_base: 100,
  iva_amount: 16,
  supplier_id: 'sup-1',
  retention_percentage: 75,
  is_iva_withholding_agent: true,
};

function build(invoice: Record<string, unknown> | null, opts: { journalFails?: boolean } = {}) {
  const txnQueries: Array<{ sql: string; params: unknown[] }> = [];
  const txn = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      txnQueries.push({ sql, params });
      if (sql.includes('MAX(voucher_number)')) {
        return Promise.resolve({ rows: [{ next_number: 7 }] });
      }
      if (sql.includes('get_exchange_rate_at')) {
        return Promise.resolve({ rows: [{ rate: '50' }] });
      }
      if (sql.includes('INSERT INTO accounting_schema.iva_withholding')) {
        return Promise.resolve({
          rows: [{ withholding_id: 'w-1', voucher_number: 7, issued_at: new Date() }],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
    commit: jest.fn(),
    rollback: jest.fn(),
  };
  const db = {
    query: jest.fn(() => Promise.resolve({ rows: invoice ? [invoice] : [] })),
    transaction: jest.fn(() => Promise.resolve(txn)),
  };
  const journal = {
    generateWithholdingJournal: jest.fn(() =>
      opts.journalFails
        ? Promise.reject(new Error('sin cuenta'))
        : Promise.resolve('entry-1'),
    ),
    reverseEntryBySource: jest.fn(() => Promise.resolve('entry-2')),
  };
  const service = new IvaWithholdingService(db as any, journal as any);
  return { service, db, txn, journal, txnQueries };
}

describe('IvaWithholdingService (FNZ-IV-06)', () => {
  it('emite el comprobante con el porcentaje del proveedor y el siguiente correlativo', async () => {
    const { service, txn, journal, txnQueries } = build(INVOICE);
    const res = await service.issue('t1', 'u1', 'inv-1');

    expect(res).toEqual({
      withholding_id: 'w-1',
      voucher_number: 7,
      retained_amount: 12, // 16 * 75 %
    });
    const insert = txnQueries.find((q) =>
      q.sql.includes('INSERT INTO accounting_schema.iva_withholding'),
    )!;
    // tenant, numero, factura, proveedor, nro factura, base, iva, %, retenido, tasa, usuario
    expect(insert.params).toEqual([
      't1', 7, 'inv-1', 'sup-1', 'F-001', 100, 16, 75, 12, '50', 'u1',
    ]);
    expect(journal.generateWithholdingJournal).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        withholdingId: 'w-1',
        retainedAmount: 12,
        currencyId: 2,
      }),
      txn,
    );
    expect(txn.commit).toHaveBeenCalled();
  });

  it('serializa la numeracion con un candado por tenant', async () => {
    const { service, txnQueries } = build(INVOICE);
    await service.issue('t1', 'u1', 'inv-1');
    expect(txnQueries[0].sql).toContain('pg_advisory_xact_lock');
  });

  it('si el asiento falla no queda comprobante', async () => {
    const { service, txn } = build(INVOICE, { journalFails: true });
    await expect(service.issue('t1', 'u1', 'inv-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(txn.rollback).toHaveBeenCalled();
    expect(txn.commit).not.toHaveBeenCalled();
  });

  it('rechaza si el tenant no es agente de retencion', async () => {
    const { service, db } = build({ ...INVOICE, is_iva_withholding_agent: false });
    await expect(service.issue('t1', 'u1', 'inv-1')).rejects.toThrow(
      /agente de retencion/,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rechaza si el proveedor no tiene porcentaje', async () => {
    const { service } = build({ ...INVOICE, retention_percentage: 0 });
    await expect(service.issue('t1', 'u1', 'inv-1')).rejects.toThrow(
      /porcentaje de retencion/,
    );
  });

  it('rechaza una factura sin IVA', async () => {
    const { service } = build({ ...INVOICE, iva_amount: 0 });
    await expect(service.issue('t1', 'u1', 'inv-1')).rejects.toThrow(
      /no tiene IVA/,
    );
  });

  it('una factura de otro tenant responde 404', async () => {
    const { service } = build(null);
    await expect(service.issue('t1', 'u1', 'inv-x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('anular revierte el asiento y no reusa el numero', async () => {
    const { service, db, txn, journal } = build(INVOICE);
    db.query.mockImplementation(() =>
      Promise.resolve({ rows: [{ withholding_id: 'w-1', is_voided: false }] }),
    );
    const res = await service.void('t1', 'w-1');
    expect(res).toEqual({ withholding_id: 'w-1', is_voided: true });
    expect(journal.reverseEntryBySource).toHaveBeenCalledWith(
      't1',
      'IVA_WITHHOLDING',
      'w-1',
      expect.any(Date),
      expect.any(String),
      txn,
    );
    expect(txn.commit).toHaveBeenCalled();
  });

  it('no anula dos veces', async () => {
    const { service, db } = build(INVOICE);
    db.query.mockImplementation(() =>
      Promise.resolve({ rows: [{ withholding_id: 'w-1', is_voided: true }] }),
    );
    await expect(service.void('t1', 'w-1')).rejects.toThrow(/ya esta anulado/);
  });
});
