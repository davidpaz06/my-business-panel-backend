import { businessDate, timestampInLocalDays } from './finances.time';

describe('finances.time', () => {
  it('despues de las 20:00 en Caracas sigue siendo el mismo dia', () => {
    // 2026-10-16 01:30 UTC = 2026-10-15 21:30 en Caracas
    expect(businessDate(new Date('2026-10-16T01:30:00Z'))).toBe('2026-10-15');
    expect(businessDate(new Date('2026-10-16T04:00:00Z'))).toBe('2026-10-16');
  });

  it('el rango incluye el dia final completo sin transformar la columna', () => {
    const sql = timestampInLocalDays('s.sale_date', '$2', '$3');
    expect(sql).toContain('s.sale_date >= ');
    expect(sql).toContain('s.sale_date < ');
    expect(sql).toContain('($3)::date + 1');
  });
});
