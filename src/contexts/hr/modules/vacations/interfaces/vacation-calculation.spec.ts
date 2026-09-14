import { bonusVacationDays, vacationDays } from './vacation-calculation';

describe('vacationDays (Art. 190)', () => {
  it('antes de cumplir el primer año -> 0 (el derecho aún no nace)', () => {
    expect(vacationDays(0)).toBe(0);
  });

  it('año 1 -> 15 días hábiles', () => {
    expect(vacationDays(1)).toBe(15);
  });

  it('año 2 -> 16 días (15 + 1)', () => {
    expect(vacationDays(2)).toBe(16);
  });

  it('tope 30 días al año 16', () => {
    expect(vacationDays(16)).toBe(30);
  });

  it('no crece mas alla del tope (año 17)', () => {
    expect(vacationDays(17)).toBe(30);
  });
});

describe('bonusVacationDays (Art. 192)', () => {
  it('año 1 -> 15 días', () => {
    expect(bonusVacationDays(1)).toBe(15);
  });

  it('bono vacacional tope 30', () => {
    expect(bonusVacationDays(16)).toBe(30);
  });

  it('no crece mas alla del tope', () => {
    expect(bonusVacationDays(20)).toBe(30);
  });
});
