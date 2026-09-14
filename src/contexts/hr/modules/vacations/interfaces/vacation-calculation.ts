/**
 * Vacaciones (Art. 190 LOTTT). El derecho NACE al cumplir el primer
 * anio: antes es CERO. 15 dias habiles + 1 por anio sucesivo, tope
 * de 15 adicionales (maximo 30, alcanzado al anio 16).
 */
export function vacationDays(completeYears: number): number {
  if (completeYears < 1) return 0;
  return 15 + Math.min(completeYears - 1, 15);
}

/**
 * Bono vacacional (Art. 192 LOTTT). 15 dias + 1 por anio de
 * servicio, tope 30. Tiene caracter salarial: alimenta la alicuota
 * del salario integral (Art. 122).
 */
export function bonusVacationDays(completeYears: number): number {
  return Math.min(15 + Math.max(completeYears - 1, 0), 30);
}
