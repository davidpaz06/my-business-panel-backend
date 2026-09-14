import Decimal from 'decimal.js';

/** Anio comercial: reparte el beneficio anual (en dias) sobre 360 (Art. 122). */
const COMMERCIAL_YEAR_DAYS = 360;

/** Divisor del salario diario (Art. 113): salario mensual / 30. */
const DAILY_DIVISOR = 30;

/**
 * Value Object del salario venezolano (LOTTT). Calculo puro, sin
 * acceso a base de datos.
 *
 * Regla de oro: salario normal (Art. 104) para recargos, feriados,
 * vacaciones y bono vacacional. Salario integral (Art. 122) SOLO
 * para prestaciones e indemnizaciones. Nunca intercambiables.
 */
export class Salary {
  constructor(
    private readonly monthly: Decimal,
    private readonly utilidadesDays: Decimal,
    private readonly bonoVacacionalDays: Decimal,
  ) {}

  /** Salario diario (Art. 113). */
  daily(): Decimal {
    return this.monthly.div(DAILY_DIVISOR);
  }

  /** Salario hora, segun las horas de la jornada del contrato (Art. 173). */
  hourly(journeyHours: number): Decimal {
    return this.daily().div(journeyHours);
  }

  alicuotaUtilidades(): Decimal {
    return this.daily().mul(this.utilidadesDays).div(COMMERCIAL_YEAR_DAYS);
  }

  alicuotaBonoVacacional(): Decimal {
    return this.daily().mul(this.bonoVacacionalDays).div(COMMERCIAL_YEAR_DAYS);
  }

  /** Salario integral diario (Art. 122): normal + ambas alicuotas. */
  integralDaily(): Decimal {
    return this.daily()
      .add(this.alicuotaUtilidades())
      .add(this.alicuotaBonoVacacional());
  }
}
