/**
 * Horas diarias de la jornada segun su tipo (Art. 173 LOTTT).
 * Usadas como divisor del salario-hora (doc S2.1: salario-hora =
 * salario diario / horas de la jornada).
 */
export const JOURNEY_DAILY_HOURS: Readonly<Record<string, number>> = {
  diurna: 8,
  nocturna: 7,
  mixta: 7.5,
};
