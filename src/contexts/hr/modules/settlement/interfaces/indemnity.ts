/**
 * Causales que activan la indemnizacion del Art. 92: terminacion por
 * causa ajena al trabajador, o despido injustificado. En esos casos
 * la indemnizacion es equivalente al monto de las prestaciones
 * sociales (se duplica el pago).
 */
const INDEMNITY_TERMINATION_TYPES = new Set([
  'despido_injustificado',
  'causa_ajena_al_trabajador',
]);

export function indemnityApplies(terminationType?: string | null): boolean {
  return !!terminationType && INDEMNITY_TERMINATION_TYPES.has(terminationType);
}
