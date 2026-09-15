import {
  additionalDays,
  computableYears,
  monthsBetween,
} from './severance-calculation';

describe('additionalDays (Art. 142.b)', () => {
  it('año 1 exacto -> 0 días adicionales', () => {
    expect(additionalDays(1)).toBe(0);
  });

  it('año 2 -> 2 días adicionales acumulados', () => {
    expect(additionalDays(2)).toBe(2);
  });

  it('tope 30 días adicionales al año 16', () => {
    expect(additionalDays(16)).toBe(30);
  });

  it('no crece mas alla del tope (año 17)', () => {
    expect(additionalDays(17)).toBe(30);
  });

  it('antiguedad < 1 año -> 0', () => {
    expect(additionalDays(0)).toBe(0);
  });
});

describe('computableYears (Art. 142.c)', () => {
  it('fracción 7 meses redondea a año completo', () => {
    expect(computableYears(3, 7)).toBe(4);
  });

  it('fracción 5 meses NO redondea', () => {
    expect(computableYears(3, 5)).toBe(3);
  });

  it('fracción exactamente 6 meses NO redondea (estricto > 6)', () => {
    expect(computableYears(3, 6)).toBe(3);
  });
});

describe('monthsBetween', () => {
  it('antigüedad exacta de 1 año, 0 meses de fracción', () => {
    const result = monthsBetween(
      new Date('2020-01-15T00:00:00Z'),
      new Date('2021-01-15T00:00:00Z'),
    );
    expect(result).toEqual({
      completeYears: 1,
      remainderMonths: 0,
      totalMonths: 12,
    });
  });

  it('antigüedad de 1 año y 7 meses de fracción', () => {
    const result = monthsBetween(
      new Date('2020-01-15T00:00:00Z'),
      new Date('2021-08-20T00:00:00Z'),
    );
    expect(result).toEqual({
      completeYears: 1,
      remainderMonths: 7,
      totalMonths: 19,
    });
  });

  it('antigüedad menor a 3 meses (Art. 142.e)', () => {
    const result = monthsBetween(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-03-15T00:00:00Z'),
    );
    expect(result.totalMonths).toBeLessThan(3);
  });
});
