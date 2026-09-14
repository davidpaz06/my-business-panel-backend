/**
 * Pisos legales mejorables por convencion colectiva (LOTTT, doc S1.2).
 * La LOTTT es de orden publico e irrenunciable (Arts. 2, 19): una
 * convencion colectiva solo puede MEJORAR el minimo legal, nunca
 * reducirlo (Arts. 18.2, 434). Solo estas claves tienen un piso
 * validado aqui; el resto de payroll_parameters son constantes
 * estructurales (topes, divisores) o valores externos sin piso fijo
 * (salario_minimo_nacional, tasa_activa_bcv).
 */
export const MEJORABLE_LEGAL_FLOORS: Readonly<Record<string, number>> = {
  dias_utilidades: 30, // Art. 131
  // dias_bono_vacacional_base: sin consumidor en el calculo del salario
  // integral. SalaryService.getIntegral() escala SIEMPRE por antiguedad
  // via vacations/interfaces/vacation-calculation.ts#bonusVacationDays()
  // (15 + 1/anio, tope 30, Art. 192), no lee este parametro. Se conserva
  // la validacion de piso por si se reintroduce un uso futuro.
  dias_bono_vacacional_base: 15, // Art. 192
  dias_vacaciones_base: 15, // Art. 190
  recargo_nocturno: 0.3, // Art. 117
  recargo_hora_extra: 0.5, // Art. 118
  porcentaje_prestaciones_utilidades: 0.15, // Art. 131
};
