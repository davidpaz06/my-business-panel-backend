// Moneda del programa de fidelidad (FNZ-FI-01, decision D4): USD.
//
// Las tasas del programa (`points_earned_per_currency_unit`,
// `points_redeemed_per_currency_unit`) y el compra minima para acumular
// (`minimum_purchase_for_points`) se expresan por cada USD. Una venta en
// bolivares se lleva a USD con la tasa vigente del tenant antes de acumular
// puntos; sin esto, una venta de 10 USD otorgaba los mismos puntos que una de
// Bs. 10.

export const USD_CURRENCY_ID = 2;

interface QueryRunner {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

// Monto en USD de un importe en la moneda dada, con la tasa USD -> VES
// vigente ahora para el tenant (general_schema.get_exchange_rate_at).
const toProgramCurrencyQuery = `
  SELECT
    CASE
      WHEN $2::int = ${USD_CURRENCY_ID} THEN $3::numeric
      ELSE $3::numeric / NULLIF(
        general_schema.get_exchange_rate_at($1::uuid, (now() AT TIME ZONE 'UTC')),
        0
      )
    END AS amount_usd
`;

/**
 * Importe en la moneda del programa (USD). Devuelve null si hace falta una
 * tasa y el tenant no tiene ninguna: el llamador no debe acumular puntos con
 * un monto sin convertir.
 */
export async function toProgramCurrency(
  runner: QueryRunner,
  tenantId: string,
  currencyId: number | null | undefined,
  amount: number,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const { rows } = await runner.query(toProgramCurrencyQuery, [
    tenantId,
    currencyId ?? 1,
    amount,
  ]);
  const value = rows[0]?.amount_usd;
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Puntos otorgados por una venta (o un cobro proporcional). `totalAmount`
 * decide si se alcanza la compra minima; `baseAmount` es el monto que genera
 * puntos (el total en una venta de contado, lo abonado en credito/apartado).
 * Ambos van en la moneda de la venta.
 */
export async function calculateEarnedPoints(
  runner: QueryRunner,
  program: {
    points_earned_per_currency_unit: unknown;
    minimum_purchase_for_points: unknown;
  },
  tenantId: string,
  currencyId: number | null | undefined,
  totalAmount: number,
  baseAmount: number,
): Promise<number> {
  const totalUsd = await toProgramCurrency(
    runner,
    tenantId,
    currencyId,
    totalAmount,
  );
  if (totalUsd === null || totalUsd <= 0) return 0;
  if (totalUsd < Number(program.minimum_purchase_for_points)) return 0;

  // El monto base es una fraccion del total: se convierte con la misma tasa.
  const baseUsd = totalUsd * (Math.min(baseAmount, totalAmount) / totalAmount);
  return Math.max(
    Math.floor(baseUsd * Number(program.points_earned_per_currency_unit)),
    0,
  );
}
