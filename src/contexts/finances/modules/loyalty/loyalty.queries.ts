// Consultas crudas para la Vista financiera de Puntos de Fidelidad.
// Todo se agrega a nivel tenant (los saldos de puntos no tienen dimension de sucursal).
// bucket_start sale en hora local de negocio (finances.time.ts).

import { bucketLabel, localTs } from '@/contexts/finances/finances.time';

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

  // Tasa USD -> VES vigente hoy. El pasivo de puntos es una deuda actual, asi
  // que su equivalente en bolivares se valora a la tasa de hoy (FNZ-FI-02).
  getCurrentRate: `
    SELECT general_schema.get_exchange_rate_at(
      $1::uuid,
      (now() AT TIME ZONE 'UTC')
    )::text AS usd_ves_rate
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
  //   - otorgados: invoice.points_accumulated (puntos generados en la venta) mas
  //     los puntos proporcionales de cada cobro de CxC (score_transaction con
  //     sale_collection_id, FNZ-FI-03)
  //   - canjeados: customer_payment.points_redeemed (pagos con puntos)
  // Ambas se unen a la venta para obtener la sucursal y aislar por tenant.
  // $1 = tenant_id; $2 = bucket_unit (text); $3 = range_start (timestamp);
  // $4 = branch_id (uuid|null) -> NULL = todas las sucursales.
  getGrowth: `
    WITH earned AS (
      SELECT bucket_start, SUM(points) AS points
      FROM (
        SELECT
          ${bucketLabel('$2', localTs('dsi.invoiced_at'))} AS bucket_start,
          dsi.points_accumulated::numeric AS points
        FROM pos_schema.invoice dsi
        INNER JOIN pos_schema.sale s ON s.sale_id = dsi.sale_id
        INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
        WHERE b.tenant_id = $1
          AND dsi.invoiced_at >= $3
          AND dsi.points_accumulated > 0
          AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)

        UNION ALL

        SELECT
          ${bucketLabel('$2', localTs('st.created_at'))} AS bucket_start,
          st.points::numeric AS points
        FROM pos_schema.score_transaction st
        INNER JOIN pos_schema.sale s ON s.sale_id = st.sale_id
        INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
        WHERE st.tenant_id = $1
          AND b.tenant_id = $1
          AND st.sale_collection_id IS NOT NULL
          AND st.points > 0
          AND st.created_at >= $3
          AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      ) src
      GROUP BY bucket_start
    ),
    redeemed AS (
      SELECT
        ${bucketLabel('$2', localTs('cp.payment_date'))} AS bucket_start,
        SUM(cp.points_redeemed)         AS points
      FROM pos_schema.customer_payment cp
      INNER JOIN pos_schema.sale s ON s.sale_id = cp.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id = $1
        AND cp.is_points_redemption = true
        AND cp.payment_date >= $3
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      GROUP BY 1
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
