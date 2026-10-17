import { AccountingJournalService } from './accounting-journal.service';

// Cuenta ficticia por codigo: el id es el propio codigo, asi las lineas se
// leen directo en las aserciones.
function makeTxn(originalLines: Array<Record<string, unknown>> = []) {
  const inserted: Array<{ table: string; rows: unknown[][] }> = [];
  const entries: unknown[][] = [];
  const txn = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM accounting_schema.chart_of_accounts')) {
        return Promise.resolve({ rows: [{ account_id: params[1] }] });
      }
      if (sql.includes('FROM accounting_schema.source_type')) {
        return Promise.resolve({
          rows: [{ source_type_id: String(params[0]) }],
        });
      }
      if (sql.includes('FROM accounting_schema.journal_entry_status')) {
        return Promise.resolve({ rows: [{ status_id: 1 }] });
      }
      if (sql.includes('get_exchange_rate_at')) {
        return Promise.resolve({ rows: [{ rate: 50 }] });
      }
      if (sql.includes('FROM accounting_schema.journal_entry je')) {
        return Promise.resolve({ rows: originalLines });
      }
      if (sql.includes('INSERT INTO accounting_schema.journal_entry')) {
        entries.push(params);
        return Promise.resolve({ rows: [{ entry_id: 'entry-1' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    bulkInsert: jest.fn((table: string, _cols: string[], rows: unknown[][]) => {
      inserted.push({ table, rows });
      return Promise.resolve();
    }),
  };
  return { txn: txn as any, inserted, entries };
}

// Saldo por cuenta de las lineas del asiento: debe - haber.
function net(rows: unknown[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [, account, debit, credit] of rows as [
    string,
    string,
    number,
    number,
  ][]) {
    out[account] = Math.round(((out[account] ?? 0) + debit - credit) * 100) / 100;
  }
  return out;
}

describe('AccountingJournalService - devoluciones y notas (FNZ-X-04)', () => {
  const service = new AccountingJournalService({} as any);
  const base = { tenantId: 't1', entryDate: new Date('2026-10-17T12:00:00Z') };

  it('devolucion en efectivo de una venta pagada: reverso de ingreso e IVA contra Caja', async () => {
    const { txn, inserted } = makeTxn();
    await service.generateReturnJournal(
      {
        ...base,
        returnId: 'r1',
        netAmount: 100,
        taxAmount: 16,
        receivableCredit: 0,
        refundMethodId: 1,
      },
      txn,
    );
    expect(net(inserted[0].rows)).toEqual({
      '4-1-002': 100,
      '2-1-003': 16,
      '1-1-001': -116,
    });
  });

  it('devolucion de una venta a credito: baja la CxC y el resto sale de Bancos', async () => {
    const { txn, inserted } = makeTxn();
    await service.generateReturnJournal(
      {
        ...base,
        returnId: 'r2',
        netAmount: 100,
        taxAmount: 16,
        receivableCredit: 80,
        refundMethodId: 6,
      },
      txn,
    );
    expect(net(inserted[0].rows)).toEqual({
      '4-1-002': 100,
      '2-1-003': 16,
      '1-1-003': -80,
      '1-1-002': -36,
    });
  });

  it('el asiento en USD se registra en VES con la tasa', async () => {
    const { txn, inserted, entries } = makeTxn();
    await service.generateReturnJournal(
      {
        ...base,
        returnId: 'r3',
        currencyId: 2,
        netAmount: 10,
        taxAmount: 1.6,
        receivableCredit: 0,
        refundMethodId: 1,
      },
      txn,
    );
    expect(net(inserted[0].rows)['4-1-002']).toBe(500);
    // currency_id y exchange_rate del encabezado
    expect(entries[0].slice(-2)).toEqual([2, 50]);
  });

  it('nota de credito con CxC abierta: reduce la CxC y el excedente queda a favor del cliente', async () => {
    const { txn, inserted } = makeTxn();
    await service.generateNoteJournal(
      {
        ...base,
        noteId: 'n1',
        noteType: 'credit',
        netAmount: 100,
        taxAmount: 16,
        receivableCredit: 70,
      },
      txn,
    );
    expect(net(inserted[0].rows)).toEqual({
      '4-1-002': 100,
      '2-1-003': 16,
      '1-1-003': -70,
      '2-1-008': -46,
    });
  });

  it('nota de debito: carga a CxC contra ingreso e IVA debito', async () => {
    const { txn, inserted } = makeTxn();
    await service.generateNoteJournal(
      {
        ...base,
        noteId: 'n2',
        noteType: 'debit',
        netAmount: 50,
        taxAmount: 8,
        receivableCredit: 0,
      },
      txn,
    );
    expect(net(inserted[0].rows)).toEqual({
      '1-1-003': 58,
      '4-1-001': -50,
      '2-1-003': -8,
    });
  });

  it('retencion de IVA: baja la CxP del proveedor y sube Retenciones por Pagar', async () => {
    const { txn, inserted } = makeTxn();
    await service.generateWithholdingJournal(
      { ...base, withholdingId: 'w1', retainedAmount: 12, currencyId: 2 },
      txn,
    );
    // USD a tasa 50
    expect(net(inserted[0].rows)).toEqual({ '2-1-001': 600, '2-1-004': -600 });
  });

  it('anular un asiento lo revierte linea por linea', async () => {
    const { txn, inserted } = makeTxn([
      { account_id: 'A', debit_amount: '58.00', credit_amount: '0', description: 'x' },
      { account_id: 'B', debit_amount: '0', credit_amount: '58.00', description: 'y' },
    ]);
    const id = await service.reverseEntryBySource(
      't1',
      'DEBIT_NOTE',
      'n2',
      base.entryDate,
      'Anulacion',
      txn,
    );
    expect(id).toBe('entry-1');
    expect(net(inserted[0].rows)).toEqual({ A: -58, B: 58 });
  });

  it('anular un documento sin asiento no hace nada', async () => {
    const { txn, inserted } = makeTxn([]);
    const id = await service.reverseEntryBySource(
      't1',
      'CREDIT_NOTE',
      'n3',
      base.entryDate,
      'Anulacion',
      txn,
    );
    expect(id).toBeNull();
    expect(inserted).toHaveLength(0);
  });
});
