// Royalty configuration queries.
//
// Model:
//   royalty_rule           — minimum purchase amount threshold.
//   royalty_rule_dimension — classification dimensions (group types) the
//                            rule applies to. Without a row here, that
//                            dimension is excluded for this rule.
//   royalty_option         — (rule, group, quantity). Selecting a group
//                            implicitly includes its descendants via a
//                            recursive CTE at lookup time.
//                            variant.giftable = true is the sole gate for
//                            eligibility.

const OPTIONS_AGG = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'royalty_option_id', o.royalty_option_id,
          'royalty_rule_id', o.royalty_rule_id,
          'tenant_product_group_id', o.tenant_product_group_id,
          'tenant_product_group_type_id', g.tenant_product_group_type_id,
          'group_name', g.group_name,
          'parent_group_id', g.parent_group_id,
          'hierarchy_level', g.hierarchy_level,
          'quantity', o.quantity
        ) ORDER BY g.hierarchy_level, g.group_name
      )
      FROM pos_schema.royalty_option o
      INNER JOIN general_schema.tenant_product_group g
        ON g.tenant_id = o.tenant_id
       AND g.tenant_product_group_id = o.tenant_product_group_id
      WHERE o.royalty_rule_id = r.royalty_rule_id
    ),
    '[]'::json
  ) AS options
`;

const DIMENSIONS_AGG = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'tenant_product_group_type_id', d.tenant_product_group_type_id,
          'type_name', t.type_name
        ) ORDER BY t.type_name
      )
      FROM pos_schema.royalty_rule_dimension d
      INNER JOIN general_schema.tenant_product_group_type t
        ON t.tenant_id = d.tenant_id
       AND t.tenant_product_group_type_id = d.tenant_product_group_type_id
      WHERE d.royalty_rule_id = r.royalty_rule_id
    ),
    '[]'::json
  ) AS dimensions
`;

export const posRoyaltyQueries = {
  listRulesByTenant: `
    SELECT
      r.royalty_rule_id,
      r.tenant_id,
      r.min_amount,
      r.created_at,
      r.updated_at,
      ${OPTIONS_AGG},
      ${DIMENSIONS_AGG}
    FROM pos_schema.royalty_rule r
    WHERE r.tenant_id = $1
    ORDER BY r.min_amount ASC
  `,

  getRuleById: `
    SELECT
      r.royalty_rule_id,
      r.tenant_id,
      r.min_amount,
      r.created_at,
      r.updated_at,
      ${OPTIONS_AGG},
      ${DIMENSIONS_AGG}
    FROM pos_schema.royalty_rule r
    WHERE r.royalty_rule_id = $1
  `,

  createRule: `
    INSERT INTO pos_schema.royalty_rule (tenant_id, min_amount)
    VALUES ($1, $2)
    RETURNING royalty_rule_id, tenant_id, min_amount, created_at, updated_at
  `,

  updateRule: `
    UPDATE pos_schema.royalty_rule
    SET min_amount = $2, updated_at = NOW()
    WHERE royalty_rule_id = $1
    RETURNING royalty_rule_id, tenant_id, min_amount, created_at, updated_at
  `,

  deleteRule: `
    DELETE FROM pos_schema.royalty_rule WHERE royalty_rule_id = $1
  `,

  // ── Rule dimensions ───────────────────────────────────────────────────────

  getRuleDimensionTypeIds: `
    SELECT tenant_product_group_type_id
    FROM pos_schema.royalty_rule_dimension
    WHERE royalty_rule_id = $1
  `,

  getRuleTenantId: `
    SELECT tenant_id FROM pos_schema.royalty_rule WHERE royalty_rule_id = $1
  `,

  clearRuleDimensions: `
    DELETE FROM pos_schema.royalty_rule_dimension
    WHERE royalty_rule_id = $1
  `,

  insertRuleDimension: `
    INSERT INTO pos_schema.royalty_rule_dimension
      (royalty_rule_id, tenant_id, tenant_product_group_type_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (royalty_rule_id, tenant_product_group_type_id) DO NOTHING
  `,

  // Wipe options whose group belongs to a type that is NOT in the new
  // dimension set. Run before clear+reinsert so the cleanup is scoped.
  deleteOptionsByRuleExcludingTypes: `
    DELETE FROM pos_schema.royalty_option o
    USING general_schema.tenant_product_group g
    WHERE o.royalty_rule_id = $1
      AND g.tenant_id = o.tenant_id
      AND g.tenant_product_group_id = o.tenant_product_group_id
      AND NOT (g.tenant_product_group_type_id = ANY($2::uuid[]))
  `,

  // ── Options ───────────────────────────────────────────────────────────────

  createOption: `
    INSERT INTO pos_schema.royalty_option (royalty_rule_id, tenant_id, tenant_product_group_id, quantity)
    SELECT $1, r.tenant_id, $2, $3
    FROM pos_schema.royalty_rule r
    WHERE r.royalty_rule_id = $1
    RETURNING royalty_option_id, royalty_rule_id, tenant_product_group_id, quantity, created_at
  `,

  updateOption: `
    UPDATE pos_schema.royalty_option
    SET quantity = $2
    WHERE royalty_option_id = $1
    RETURNING royalty_option_id, royalty_rule_id, tenant_product_group_id, quantity, created_at
  `,

  deleteOption: `
    DELETE FROM pos_schema.royalty_option WHERE royalty_option_id = $1
  `,

  // Guard: option's group must belong to one of the rule's active
  // dimensions. Used by createOption flow at the service layer.
  isGroupInRuleDimensions: `
    SELECT 1
    FROM pos_schema.royalty_rule_dimension d
    INNER JOIN general_schema.tenant_product_group g
      ON g.tenant_id = d.tenant_id
     AND g.tenant_product_group_type_id = d.tenant_product_group_type_id
    WHERE d.royalty_rule_id = $1
      AND g.tenant_product_group_id = $2
    LIMIT 1
  `,

  // ── POS lookup ───────────────────────────────────────────────────────────

  getApplicableRules: `
    SELECT
      r.royalty_rule_id,
      r.tenant_id,
      r.min_amount,
      r.created_at,
      r.updated_at,
      FLOOR($2::numeric / r.min_amount)::int AS multiplier,
      ${OPTIONS_AGG},
      ${DIMENSIONS_AGG}
    FROM pos_schema.royalty_rule r
    WHERE r.tenant_id = $1
      AND r.min_amount <= $2
    ORDER BY r.min_amount ASC
  `,

  // Recursive CTE: start at the chosen group, walk descendants via
  // parent_group_id. Collect distinct giftable variants assigned to any
  // descendant group.
  getGiftableProductsByGroup: `
    WITH RECURSIVE descendants AS (
      SELECT tenant_id, tenant_product_group_id
      FROM general_schema.tenant_product_group
      WHERE tenant_product_group_id = $1
      UNION ALL
      SELECT g.tenant_id, g.tenant_product_group_id
      FROM general_schema.tenant_product_group g
      INNER JOIN descendants d
        ON g.parent_group_id = d.tenant_product_group_id
       AND g.tenant_id = d.tenant_id
    )
    SELECT DISTINCT
      pv.product_variant_id,
      pv.variant_name,
      pv.sku,
      pv.unit_price,
      pv.giftable_from
    FROM general_schema.product_variant pv
    INNER JOIN general_schema.product_variant_group_assignment pvga
      ON pvga.product_variant_id = pv.product_variant_id
     AND pvga.tenant_id = pv.tenant_id
    INNER JOIN descendants d
      ON d.tenant_product_group_id = pvga.tenant_product_group_id
     AND d.tenant_id = pvga.tenant_id
    WHERE pv.giftable = true
      AND pv.is_active = true
    ORDER BY pv.variant_name ASC
  `,

  // ── Analytics (Regalias) ─────────────────────────────────────────────────────
  // Regalia = sale_item con sale_price_type = 'ROYALTY'. Valor = total_price
  // (cantidad x precio de venta). Filtrable por sucursal e intervalo de tiempo.
  // Params comunes: $1 = tenant_id, $2 = branch_id (uuid|null), $3 = range_start (timestamp),
  //                 $4 = bucket_unit (text, solo evolucion).

  // Totales: valor entregado en regalias vs ventas reales (para el % respecto a ventas).
  royaltyTotals: `
    WITH gifts AS (
      SELECT
        COALESCE(SUM(si.total_price), 0) AS total_value,
        COUNT(*)                         AS gift_lines
      FROM pos_schema.sale_item si
      INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id = $1
        AND si.sale_price_type = 'ROYALTY'
        AND s.is_completed = true
        AND s.sale_date >= $3
        AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
    ),
    sales AS (
      SELECT COALESCE(SUM(s.total_amount), 0) AS total_sales
      FROM pos_schema.sale s
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id = $1
        AND s.is_completed = true
        AND s.sale_date >= $3
        AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
    )
    SELECT
      g.total_value::text AS total_value,
      g.gift_lines::text  AS gift_lines,
      sl.total_sales::text AS total_sales
    FROM gifts g CROSS JOIN sales sl
  `,

  // Top categorias mas regaladas.
  royaltyByCategory: `
    SELECT
      pc.product_category_id                      AS category_id,
      COALESCE(pc.category_name, 'Sin categoria') AS category_name,
      SUM(si.total_price)::text                   AS value,
      SUM(si.quantity)::text                      AS quantity
    FROM pos_schema.sale_item si
    INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    INNER JOIN general_schema.product_variant pv
      ON pv.tenant_id = si.tenant_id
     AND pv.product_variant_id = si.product_variant_id
    LEFT JOIN general_schema.product p ON p.product_id = pv.product_id
    LEFT JOIN general_schema.product_category pc
      ON pc.product_category_id = p.product_category_id
    WHERE b.tenant_id = $1
      AND si.sale_price_type = 'ROYALTY'
      AND s.is_completed = true
      AND s.sale_date >= $3
      AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
    GROUP BY pc.product_category_id, pc.category_name
    ORDER BY SUM(si.total_price) DESC
    LIMIT 10
  `,

  // Top clientes con mas regalias.
  royaltyByCustomer: `
    SELECT
      s.tenant_customer_id,
      COALESCE(tc.first_name || ' ' || tc.last_name, 'Cliente general') AS name,
      tc.document_number,
      SUM(si.total_price)::text AS value,
      SUM(si.quantity)::text    AS quantity
    FROM pos_schema.sale_item si
    INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    LEFT JOIN general_schema.tenant_customer tc
      ON tc.tenant_customer_id = s.tenant_customer_id
    WHERE b.tenant_id = $1
      AND si.sale_price_type = 'ROYALTY'
      AND s.is_completed = true
      AND s.sale_date >= $3
      AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
    GROUP BY s.tenant_customer_id, tc.first_name, tc.last_name, tc.document_number
    ORDER BY SUM(si.total_price) DESC
    LIMIT 10
  `,

  // Evolucion temporal de la mercancia obsequiada.
  royaltyEvolution: `
    SELECT
      date_trunc($4, s.sale_date)::text AS bucket_start,
      SUM(si.total_price)::text         AS value,
      SUM(si.quantity)::text            AS quantity
    FROM pos_schema.sale_item si
    INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    WHERE b.tenant_id = $1
      AND si.sale_price_type = 'ROYALTY'
      AND s.is_completed = true
      AND s.sale_date >= $3
      AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
    GROUP BY bucket_start
    ORDER BY bucket_start
  `,
};
