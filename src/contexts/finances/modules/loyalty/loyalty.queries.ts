// Consultas crudas para la Vista financiera de Puntos de Fidelidad.
// Todo se agrega a nivel tenant (los saldos de puntos no tienen dimension de sucursal).

export const loyaltyQueries = {
  // Programa de fidelidad activo del tenant (tasa de canje para la equivalencia monetaria).
  getActiveProgram: `
    SELECT
      points_earned_per_currency_unit,
      points_redeemed_per_currency_unit,
      is_active
    FROM pos_schema.loyalty_program
    WHERE tenant_id = $1 AND is_active = true
    LIMIT 1
  `,

  // Totales del pasivo de puntos: activos (saldo), generados (lifetime), utilizados (redeemed).
  getTotals: `
    SELECT
      COALESCE(SUM(score), 0)::text                     AS active_points,
      COALESCE(SUM(lifetime_score), 0)::text            AS lifetime_points,
      COALESCE(SUM(score_redeemed), 0)::text            AS redeemed_points,
      COUNT(*) FILTER (WHERE score > 0)::text           AS customers_with_points
    FROM pos_schema.tenant_customer_score
    WHERE tenant_id = $1
  `,

  // Crecimiento del programa: puntos otorgados vs canjeados por bucket de tiempo,
  // filtrables por sucursal. Se toman de las tablas realmente pobladas en el flujo
  // de venta (el ledger score_transaction no se escribe en este flujo):
  //   - otorgados: invoice.points_accumulated (puntos generados en la venta)
  //   - canjeados: customer_payment.points_redeemed (pagos con puntos)
  // Ambas se unen a la venta para obtener la sucursal y aislar por tenant.
  // $1 = tenant_id; $2 = bucket_unit (text); $3 = range_start (timestamp);
  // $4 = branch_id (uuid|null) -> NULL = todas las sucursales.
  getGrowth: `
    WITH earned AS (
      SELECT
        date_trunc($2, dsi.invoiced_at) AS bucket_start,
        SUM(dsi.points_accumulated)     AS points
      FROM pos_schema.invoice dsi
      INNER JOIN pos_schema.sale s ON s.sale_id = dsi.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id = $1
        AND dsi.invoiced_at >= $3
        AND dsi.points_accumulated > 0
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      GROUP BY bucket_start
    ),
    redeemed AS (
      SELECT
        date_trunc($2, cp.payment_date) AS bucket_start,
        SUM(cp.points_redeemed)         AS points
      FROM pos_schema.customer_payment cp
      INNER JOIN pos_schema.sale s ON s.sale_id = cp.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id = $1
        AND cp.is_points_redemption = true
        AND cp.payment_date >= $3
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      GROUP BY bucket_start
    )
    SELECT
      COALESCE(e.bucket_start, r.bucket_start)::text AS bucket_start,
      COALESCE(e.points, 0)::text                    AS earned,
      COALESCE(r.points, 0)::text                    AS redeemed
    FROM earned e
    FULL OUTER JOIN redeemed r ON e.bucket_start = r.bucket_start
    ORDER BY bucket_start
  `,

  // Clientes con mas puntos activos.
  getTopCustomers: `
    SELECT
      tcs.tenant_customer_id,
      (tc.first_name || ' ' || tc.last_name) AS name,
      tc.document_number,
      tcs.score,
      tcs.lifetime_score
    FROM pos_schema.tenant_customer_score tcs
    INNER JOIN general_schema.tenant_customer tc
      ON tc.tenant_customer_id = tcs.tenant_customer_id
    WHERE tcs.tenant_id = $1
      AND tcs.score > 0
    ORDER BY tcs.score DESC
    LIMIT 10
  `,
};
