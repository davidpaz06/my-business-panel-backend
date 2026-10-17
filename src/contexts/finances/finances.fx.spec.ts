import { dateNoonUtc, rateAt, sumBoth, toUsd, toVes } from './finances.fx';

describe('finances.fx', () => {
  it('usa la tasa del tenant en el instante del movimiento', () => {
    expect(rateAt('$1', 's.sale_date')).toBe(
      'general_schema.get_exchange_rate_at($1, s.sale_date)',
    );
  });

  it('convierte segun la moneda de origen (1 = VES, 2 = USD)', () => {
    expect(toUsd('a', 'c', 'r')).toBe(
      '(CASE WHEN c = 2 THEN a ELSE a / NULLIF(r, 0) END)',
    );
    expect(toVes('a', 'c', 'r')).toBe(
      '(CASE WHEN c = 1 THEN a ELSE a * r END)',
    );
  });

  it('las fechas sin hora toman la tasa del mediodia local', () => {
    expect(dateNoonUtc('e.expense_date')).toContain("time '12:00'");
    expect(dateNoonUtc('e.expense_date')).toContain("'America/Caracas'");
  });

  it('sumBoth produce las columnas _usd y _ves', () => {
    const sql = sumBoth('total', 'm.amount', 'm.currency_id', 'fx.rate');
    expect(sql).toContain('AS total_usd');
    expect(sql).toContain('AS total_ves');
  });
});
