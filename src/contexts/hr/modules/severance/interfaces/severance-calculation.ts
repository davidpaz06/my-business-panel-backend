const DAY_MS = 24 * 60 * 60 * 1000;

export interface MonthsBetweenResult {
  completeYears: number;
  remainderMonths: number;
  totalMonths: number;
}

/** Antiguedad exacta en anios completos + meses de fraccion. */
export function monthsBetween(hire: Date, end: Date): MonthsBetweenResult {
  let years = end.getUTCFullYear() - hire.getUTCFullYear();
  let months = end.getUTCMonth() - hire.getUTCMonth();
  const dayDiff = end.getUTCDate() - hire.getUTCDate();

  if (dayDiff < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return {
    completeYears: Math.max(years, 0),
    remainderMonths: Math.max(months, 0),
    totalMonths: Math.max(years * 12 + months, 0),
  };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Dias adicionales por antiguedad (Art. 142.b). SOLO empiezan a
 * acumularse DESPUES de cumplido el primer anio de servicio.
 * Tope 30 dias, alcanzado al anio 16.
 */
export function additionalDays(
  completeYears: number,
  perYear = 2,
  cap = 30,
): number {
  if (completeYears < 1) return 0;
  return Math.min((completeYears - 1) * perYear, cap);
}

/**
 * Anios computables para el retroactivo (Art. 142.c). La fraccion
 * redondea a anio completo SOLO si supera los 6 meses (estricto:
 * exactamente 6 no redondea).
 */
export function computableYears(
  completeYears: number,
  remainderMonths: number,
): number {
  return completeYears + (remainderMonths > 6 ? 1 : 0);
}
