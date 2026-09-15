import Decimal from 'decimal.js';
import {
  CalculatorInput,
  IPayrollStrategy,
} from '../interface/payroll-strategy.interface';

/**
 * Valor-hora normal (Art. 113): salario normal diario / horas de la
 * jornada (Art. 173, ver JOURNEY_LIMITS en journey/interfaces).
 */
function hourlyRate(baseSalary: Decimal, journeyHours: Decimal): Decimal {
  return baseSalary.dividedBy(30).dividedBy(journeyHours);
}

/**
 * Bono nocturno (Art. 117). weightedHours ya viene de
 * hr_schema.overtime_record con el rate_factor efectivo aplicado
 * (1 + recargo_nocturno vigente al momento del registro): no se
 * reaplica el recargo aqui, solo se valoriza a precio de hora normal.
 */
export class NightSurchargeStrategy implements IPayrollStrategy {
  calculate(input: CalculatorInput): Decimal {
    const journeyHours = new Decimal(input.context?.journeyHours || 8);
    const weightedHours = new Decimal(
      input.context?.nocturnaWeightedHours || 0,
    );

    if (weightedHours.isZero()) return new Decimal(0);

    return hourlyRate(input.baseSalary, journeyHours)
      .mul(weightedHours)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

/**
 * Horas extraordinarias (Art. 118). El rate_factor por evento ya
 * refleja 1.5x autorizado o 2.0x sin autorizacion de Inspectoria
 * (doble recargo, Art. 182) — se persiste asi en overtime_record al
 * crear el registro, no se recalcula en la planilla.
 */
export class OvertimeStrategy implements IPayrollStrategy {
  calculate(input: CalculatorInput): Decimal {
    const journeyHours = new Decimal(input.context?.journeyHours || 8);
    const weightedHours = new Decimal(input.context?.extraWeightedHours || 0);

    if (weightedHours.isZero()) return new Decimal(0);

    return hourlyRate(input.baseSalary, journeyHours)
      .mul(weightedHours)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

/**
 * Feriado o dia de descanso trabajado (Art. 120). weightedHours trae
 * el recargo del 50% ya aplicado por evento (overtime_record kind =
 * 'feriado'); el pago del dia en si (no trabajado) se maneja aparte,
 * como parte del salario base mensual.
 */
export class HolidayWorkedStrategy implements IPayrollStrategy {
  calculate(input: CalculatorInput): Decimal {
    const journeyHours = new Decimal(input.context?.journeyHours || 8);
    const weightedHours = new Decimal(input.context?.feriadoWeightedHours || 0);

    if (weightedHours.isZero()) return new Decimal(0);

    return hourlyRate(input.baseSalary, journeyHours)
      .mul(weightedHours)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

export class IncapacityStrategy implements IPayrollStrategy {
  calculate(input: CalculatorInput): Decimal {
    const base = input.baseSalary;
    const dailyRate = base.dividedBy(new Decimal(30));
    const days = new Decimal(input.context?.incapacityDays || 0);
    const percentage = new Decimal(input.context?.percentage || 0);

    if (!days || days.isZero()) return new Decimal(0);

    const incapacityPayment = dailyRate
      .mul(percentage.dividedBy(new Decimal(100)))
      .mul(days);

    return incapacityPayment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

export class IncapacityDeductionStrategy implements IPayrollStrategy {
  calculate(input: CalculatorInput): Decimal {
    const base = input.baseSalary;
    const dailyRate = base.dividedBy(new Decimal(30));
    const days = new Decimal(input.context?.incapacityDays || 0);

    if (!days || days.isZero()) return new Decimal(0);

    const incapacityDeduction = dailyRate.mul(days);

    // El motor de calculo (calc-engine.service.ts) ya RESTA
    // totalDeductions en la formula final del neto; las estrategias de
    // tipo 'deduction' deben devolver magnitud POSITIVA. Multiplicar
    // por -1 aqui invertia el efecto: la deduccion terminaba SUMANDO
    // al neto en vez de restar.
    return incapacityDeduction.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}
