// Zona horaria de negocio de Finanzas.
//
// Las columnas `timestamp without time zone` se guardan en hora UTC (la DB de
// staging/produccion corre en UTC y el frontend envia fechas ISO en UTC), pero
// el negocio opera en Venezuela (UTC-4): una venta de las 21:00 en Caracas
// queda guardada como 01:00 del dia siguiente. Para agrupar por dia o filtrar
// por un rango de dias hay que llevar esos timestamps a la hora local.
// Las columnas `date` (expense_date, pay_date, due_date) ya son fechas locales
// y NO se convierten.

export const BUSINESS_TZ = 'America/Caracas';

/** SQL: timestamp UTC -> timestamp en hora local de negocio. */
export const localTs = (column: string): string =>
  `((${column}) AT TIME ZONE 'UTC' AT TIME ZONE '${BUSINESS_TZ}')`;

/** SQL: inicio (00:00 local) del dia `dateExpr`, expresado en UTC para comparar con columnas timestamp. */
const utcStartOfLocalDay = (dateExpr: string): string =>
  `(((${dateExpr})::date)::timestamp AT TIME ZONE '${BUSINESS_TZ}' AT TIME ZONE 'UTC')`;

/**
 * SQL: la columna timestamp cae entre los dias locales `startParam` y
 * `endParam`, ambos inclusive. Compara contra la columna sin transformarla
 * para no anular los indices.
 */
export const timestampInLocalDays = (
  column: string,
  startParam: string,
  endParam: string,
): string =>
  `${column} >= ${utcStartOfLocalDay(startParam)} AND ${column} < ${utcStartOfLocalDay(`(${endParam})::date + 1`)}`;

/** SQL: la columna date cae entre los dias `startParam` y `endParam`, ambos inclusive. */
export const dateInDays = (
  column: string,
  startParam: string,
  endParam: string,
): string => `${column} BETWEEN (${startParam})::date AND (${endParam})::date`;

/**
 * SQL: inicio de bucket como texto ISO local sin zona ("2026-10-15T00:00:00").
 * Sin sufijo de zona el navegador lo interpreta como hora local, asi la
 * etiqueta del dia no se corre al convertir desde UTC.
 */
export const bucketLabel = (unitParam: string, localExpr: string): string =>
  `to_char(date_trunc(${unitParam}, ${localExpr}), 'YYYY-MM-DD"T"HH24:MI:SS')`;

/** Fecha de hoy (YYYY-MM-DD) en la zona de negocio, para rangos por defecto. */
export function businessToday(now: Date = new Date()): string {
  return businessDate(now);
}

/** Fecha (YYYY-MM-DD) de un instante en la zona de negocio. */
export function businessDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
