import { BUSINESS_TZ } from './finances.time';

// Conversion historica de montos (FNZ-X-02).
//
// Cada monto de Finanzas se devuelve en las dos monedas del sistema, USD y
// VES, convertido con la tasa vigente para el tenant en la fecha del
// movimiento (general_schema.get_exchange_rate_at, migracion 044). El
// frontend solo elige la columna segun el toggle de moneda: no convierte con
// la tasa de hoy, que distorsionaba todo lo historico.
//
// Ids de general_schema.currency: 1 = VES, 2 = USD. La tasa es USD -> VES.

/** SQL: tasa USD -> VES del tenant en un instante UTC (timestamp). */
export const rateAt = (tenantExpr: string, utcTimestampExpr: string): string =>
  `general_schema.get_exchange_rate_at(${tenantExpr}, ${utcTimestampExpr})`;

/**
 * SQL: instante UTC del mediodia local de una fecha. Para columnas `date`
 * (expense_date, due_date): la tasa vigente durante ese dia.
 */
export const dateNoonUtc = (dateExpr: string): string =>
  `(((${dateExpr})::date + time '12:00') AT TIME ZONE '${BUSINESS_TZ}' AT TIME ZONE 'UTC')`;

/** SQL: monto expresado en USD (NULL si hace falta tasa y no hay ninguna). */
export const toUsd = (
  amountExpr: string,
  currencyExpr: string,
  rateExpr: string,
): string =>
  `(CASE WHEN ${currencyExpr} = 2 THEN ${amountExpr} ELSE ${amountExpr} / NULLIF(${rateExpr}, 0) END)`;

/** SQL: monto expresado en VES. */
export const toVes = (
  amountExpr: string,
  currencyExpr: string,
  rateExpr: string,
): string =>
  `(CASE WHEN ${currencyExpr} = 1 THEN ${amountExpr} ELSE ${amountExpr} * ${rateExpr} END)`;

/**
 * SQL: par de columnas `<alias>_usd`, `<alias>_ves` con la suma convertida.
 * Usar dentro de un SELECT con GROUP BY.
 */
export const sumBoth = (
  alias: string,
  amountExpr: string,
  currencyExpr: string,
  rateExpr: string,
): string =>
  `COALESCE(SUM(${toUsd(amountExpr, currencyExpr, rateExpr)}), 0) AS ${alias}_usd,
    COALESCE(SUM(${toVes(amountExpr, currencyExpr, rateExpr)}), 0) AS ${alias}_ves`;
