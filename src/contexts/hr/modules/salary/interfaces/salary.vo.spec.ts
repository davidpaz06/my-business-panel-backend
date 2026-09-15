import Decimal from 'decimal.js';
import { Salary } from './salary.vo';

describe('Salary VO (Arts. 104, 113, 122)', () => {
  // Monto mensual 9000, 30 días de utilidades, 15 días de bono
  // vacacional: numeros elegidos para que las alicuotas den exacto.
  const salary = new Salary(
    new Decimal(9000),
    new Decimal(30),
    new Decimal(15),
  );

  it('salario diario (Art. 113): mensual / 30', () => {
    expect(salary.daily().toNumber()).toBe(300);
  });

  it('salario hora: diario / horas de jornada', () => {
    expect(salary.hourly(8).toNumber()).toBe(37.5);
  });

  it('alicuota de utilidades: diario * días / 360', () => {
    expect(salary.alicuotaUtilidades().toNumber()).toBe(25);
  });

  it('alicuota de bono vacacional: diario * días / 360', () => {
    expect(salary.alicuotaBonoVacacional().toNumber()).toBe(12.5);
  });

  it('salario integral diario (Art. 122): normal + ambas alicuotas', () => {
    expect(salary.integralDaily().toNumber()).toBe(337.5);
  });
});
