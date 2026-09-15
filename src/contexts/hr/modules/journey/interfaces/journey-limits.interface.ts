/**
 * Limites de jornada (Art. 173 LOTTT). Fuente unica de verdad,
 * consumida por journey/ y por contract.service (validacion de
 * weekly_hours al actualizar el contrato).
 */
export interface JourneyLimit {
  maxDaily: number;
  maxWeekly: number;
}

export const JOURNEY_LIMITS: Readonly<Record<string, JourneyLimit>> = {
  diurna: { maxDaily: 8, maxWeekly: 40 },
  nocturna: { maxDaily: 7, maxWeekly: 35 },
  mixta: { maxDaily: 7.5, maxWeekly: 37.5 },
};

/**
 * Regimenes de excepcion (Arts. 175, 176). No sujetos a los limites
 * ordinarios de JOURNEY_LIMITS, pero con sus propios topes.
 */
export const JOURNEY_EXCEPTION_REGIMES: Readonly<
  Record<string, Record<string, unknown>>
> = {
  direccion: {
    exempt: true,
    maxDaily: 11,
    avgWeeklyOver8Weeks: 40,
    restDaysPerWeek: 2,
    article: '175',
  },
  turnos_continuos: {
    avgWeeklyOver8Weeks: 42,
    compensatoryVacationDay: true,
    article: '176',
  },
};
