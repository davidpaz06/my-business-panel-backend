import { createQueries } from '@crane-technologies/database';

export const generalQueryDefs = {
  users: {
    all: 'SELECT user_id, email, role_id, tenant_id FROM general_schema.users',
    byId: 'SELECT user_id, email, role_id, tenant_id, created_at, updated_at FROM general_schema.users WHERE user_id = $1 LIMIT 1',
    byIdFull: `
      SELECT
        u.user_id, u.email, u.role_id, u.tenant_id, u.created_at, u.updated_at,
        e.employee_id, e.first_name, e.last_name, e.doc_number, e.phone,
        e.email AS employee_email, e.is_active, e.payment_schedule_id, e.branch_id,
        c.contract_id, c.start_date::text AS start_date, c.end_date::text AS end_date,
        c.hours, c.base_salary, c.duties, c.duties_type_id, c.turn_type, c.turn_id
      FROM general_schema.users u
      LEFT JOIN hr_schema.employee e ON e.user_id = u.user_id
      LEFT JOIN hr_schema.contract c ON c.contract_id = e.contract_id
      WHERE u.user_id = $1 LIMIT 1
    `,

    byEmail:
      'SELECT user_id, email, role_id FROM general_schema.users WHERE email = $1 LIMIT 1',
    byTenant:
      'SELECT user_id, email, role_id, created_at FROM general_schema.users WHERE tenant_id = $1',
    byEmailWithPassword:
      'SELECT * FROM general_schema.users WHERE email = $1 LIMIT 1',
    create: `
      INSERT INTO general_schema.users 
      (tenant_id, email, password_hash, role_id, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, NOW(), NOW()) 
      RETURNING *
    `,
    update: `
      UPDATE general_schema.users
      SET
        email = COALESCE($1, email),
        role_id = COALESCE($2, role_id),
        updated_at = NOW()
      WHERE user_id = $3
      RETURNING user_id, email, role_id, tenant_id, created_at, updated_at
    `,
    assignRole:
      'UPDATE general_schema.users SET role_id = $1 WHERE user_id = $2',
    delete:
      'DELETE FROM general_schema.users WHERE user_id = $1 RETURNING user_id, email',
    getByEmails: `
      SELECT user_id, email FROM general_schema.users
      WHERE email = ANY($1)
      ORDER BY created_at DESC
    `,
  },

  role: {
    all: 'SELECT * FROM general_schema.role',
  },

  identificationType: {
    all: 'SELECT * FROM general_schema.identification_type',
    byId: 'SELECT * FROM general_schema.identification_type WHERE identification_type_id = $1',
    delete:
      'DELETE FROM general_schema.identification_type WHERE identification_type_id = $1',
  },

  customer: {
    all: `
      SELECT
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
      FROM general_schema.tenant_customer
      WHERE tenant_id = $1
    `,
    allPaginated: `
      SELECT
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
      FROM general_schema.tenant_customer
      WHERE tenant_id = $1
        AND ($4::int IS NULL OR customer_segment_id = $4)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    search: `
      SELECT
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
      FROM general_schema.tenant_customer
      WHERE tenant_id = $1
        AND ($4::int IS NULL OR customer_segment_id = $4)
        AND (
          first_name ILIKE '%' || $2 || '%' OR
          last_name ILIKE '%' || $2 || '%' OR
          document_number ILIKE '%' || $2 || '%' OR
          email ILIKE '%' || $2 || '%' OR
          phone ILIKE '%' || $2 || '%'
        )
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $5
    `,
    allGlobal: `
      SELECT
        tc.tenant_customer_id AS customer_id, tc.tenant_id,
        tc.first_name, tc.last_name,
        tc.identification_type_id AS identification_type,
        tc.document_number,
        tc.econ_activity, tc.email, tc.phone, tc.birthdate, tc.address,
        tc.customer_segment_id AS segment_id,
        tc.is_tenant, tc.created_at, tc.updated_at,
        t.tenant_name
      FROM general_schema.tenant_customer tc
      LEFT JOIN general_schema.tenant t USING(tenant_id)
      ORDER BY tc.created_at DESC
      LIMIT $1 OFFSET $2
    `,
    countByTenant:
      'SELECT COUNT(*)::int AS total FROM general_schema.tenant_customer WHERE tenant_id = $1 AND ($2::int IS NULL OR customer_segment_id = $2)',
    countSearch: `
      SELECT COUNT(*)::int AS total
      FROM general_schema.tenant_customer
      WHERE tenant_id = $1
        AND ($3::int IS NULL OR customer_segment_id = $3)
        AND (
          first_name ILIKE '%' || $2 || '%' OR
          last_name ILIKE '%' || $2 || '%' OR
          document_number ILIKE '%' || $2 || '%' OR
          email ILIKE '%' || $2 || '%' OR
          phone ILIKE '%' || $2 || '%'
        )
    `,
    countAll:
      'SELECT COUNT(*)::int AS total FROM general_schema.tenant_customer',
    byId: `
      SELECT
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
      FROM general_schema.tenant_customer
      WHERE tenant_customer_id = $1
    `,
    getInfo: `
      SELECT
        tc.tenant_customer_id AS customer_id,
        tc.tenant_id,
        tc.first_name,
        tc.last_name,
        tc.document_number,
        tc.email,
        tc.phone,
        tc.econ_activity,
        tc.address,
        tc.birthdate,
        tc.is_tenant,
        tc.created_at,
        tc.updated_at,
        tc.identification_type_id AS identification_type,
        tc.customer_segment_id AS segment_id,
        d.type_name,
        t.tenant_name,
        cs.segment_name
      FROM general_schema.tenant_customer tc
      INNER JOIN general_schema.tenant t USING(tenant_id)
      LEFT JOIN general_schema.customer_segment cs USING(customer_segment_id)
      LEFT JOIN general_schema.identification_type d ON d.identification_type_id = tc.identification_type_id
      WHERE tc.document_number = $1
    `,
    create: `
      INSERT INTO general_schema.tenant_customer
        (tenant_id, first_name, last_name, identification_type_id, document_number, econ_activity, email, phone, birthdate, address, created_at, updated_at, is_tenant, customer_segment_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12)
      RETURNING
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
    `,
    byEmail: `
      SELECT
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, created_at, updated_at
      FROM general_schema.tenant_customer
      WHERE email = $1
    `,
    delete:
      'DELETE FROM general_schema.tenant_customer WHERE tenant_customer_id = $1',

    // Enriched detail: customer + segment name + loyalty score
    detail: `
      SELECT
        tc.tenant_customer_id AS customer_id,
        tc.tenant_id,
        tc.first_name,
        tc.last_name,
        tc.identification_type_id AS identification_type,
        tc.document_number,
        tc.econ_activity,
        tc.email,
        tc.phone,
        tc.birthdate,
        tc.address,
        tc.is_tenant,
        tc.created_at,
        tc.updated_at,
        tc.customer_segment_id AS segment_id,
        cs.segment_name,
        cs.segment_hierarchy,
        COALESCE(tcs.score, 0)          AS loyalty_score,
        COALESCE(tcs.lifetime_score, 0) AS loyalty_lifetime_score,
        COALESCE(tcs.score_redeemed, 0) AS loyalty_score_redeemed,
        tcs.last_earned_at,
        tcs.last_redeemed_at,
        lp.loyalty_program_id,
        lp.points_earned_per_currency_unit,
        lp.points_redeemed_per_currency_unit,
        lp.minimum_purchase_for_points,
        lp.is_active AS loyalty_program_active
      FROM general_schema.tenant_customer tc
      LEFT JOIN general_schema.customer_segment cs USING(customer_segment_id)
      LEFT JOIN pos_schema.tenant_customer_score tcs
        ON tcs.tenant_customer_id = tc.tenant_customer_id
        AND tcs.tenant_id = tc.tenant_id
      LEFT JOIN pos_schema.loyalty_program lp
        ON lp.tenant_id = tc.tenant_id AND lp.is_active = true
      WHERE tc.tenant_customer_id = $1
      LIMIT 1
    `,

    // Paginated sales history for a specific customer
    salesHistory: `
      SELECT
        s.sale_id,
        s.sale_date,
        s.subtotal_amount,
        s.tax_amount,
        s.total_amount,
        s.is_completed,
        cur.currency_code,
        cur.symbol AS currency_symbol,
        b.branch_name,
        inv.invoice_id,
        inv.invoiced_at   AS digital_invoiced_at,
        rt.return_transaction_id,
        rt.return_status_id,
        rt.total_refund_amount
      FROM pos_schema.sale s
      LEFT JOIN general_schema.branch b ON b.branch_id = s.branch_id
      LEFT JOIN general_schema.currency cur ON cur.currency_id = s.currency_id
      LEFT JOIN pos_schema.invoice inv ON inv.sale_id = s.sale_id
      LEFT JOIN pos_schema.return_transaction rt
        ON rt.invoice_id = inv.invoice_id
      WHERE s.tenant_customer_id = $1
      ORDER BY s.sale_date DESC
      LIMIT $2 OFFSET $3
    `,

    salesHistoryCount: `
      SELECT COUNT(*)::int AS total
      FROM pos_schema.sale
      WHERE tenant_customer_id = $1
    `,
  },

  region: {
    all: 'SELECT * FROM general_schema.region ORDER BY region_id',
  },

  currency: {
    all: `
      SELECT currency_id, currency_code, currency_name, symbol, created_at, updated_at
      FROM general_schema.currency
      ORDER BY currency_code
    `,
    byId: `
      SELECT currency_id, currency_code, currency_name, symbol
      FROM general_schema.currency
      WHERE currency_id = $1 LIMIT 1
    `,
  },

  exchangeRate: {
    // Ledger global inmutable de la tasa base USD -> VES. Nunca se edita ni
    // se borra: cada cambio es una fila nueva (migrations/general/034).
    ledgerByTenant: `
      SELECT tenant_id, effective_at, change_kind, source,
             base_rate, delta, effective_rate, created_at
      FROM general_schema.tenant_exchange_rate_ledger
      WHERE tenant_id = $1
      LIMIT 200
    `,
    // Tasa vigente aplicable al tenant: base global + su diferencial.
    // Fuente unica de verdad para toda la aplicacion.
    effectiveForTenant: `
      SELECT
        r.base_rate, r.delta, r.effective_rate, r.base_at, r.delta_at,
        (SELECT currency_id FROM general_schema.currency WHERE currency_code = 'USD') AS from_currency_id,
        (SELECT currency_id FROM general_schema.currency WHERE currency_code = 'VES') AS to_currency_id
      FROM general_schema.get_effective_exchange_rate($1) r
    `,
    insertBaseRate: `
      INSERT INTO general_schema.exchange_rate
        (from_currency_id, to_currency_id, rate, effective_at, effective_date, source)
      SELECT
        (SELECT currency_id FROM general_schema.currency WHERE currency_code = 'USD'),
        (SELECT currency_id FROM general_schema.currency WHERE currency_code = 'VES'),
        $1, CURRENT_TIMESTAMP, CURRENT_DATE, COALESCE($2, 'MANUAL')
      RETURNING exchange_rate_id, rate, effective_at, source, created_at
    `,
    insertDelta: `
      INSERT INTO general_schema.tenant_exchange_delta
        (tenant_id, delta, source, created_by)
      VALUES ($1, $2, COALESCE($3, 'MANUAL'), $4)
      RETURNING delta_id, tenant_id, delta, effective_at, source, created_at
    `,
    currentBase: `
      SELECT exchange_rate_id, rate, effective_at, source, created_at
      FROM general_schema.exchange_rate
      ORDER BY effective_at DESC, created_at DESC
      LIMIT 1
    `,
  },

  tenant: {
    all: 'SELECT * FROM general_schema.tenant',
    byId: 'SELECT * FROM general_schema.tenant WHERE tenant_id = $1',
    create: `
    INSERT INTO general_schema.tenant (tenant_name, contact_email, contact_phone, identification, econ_activity, sign, is_subscribed, created_at, updated_at, region_id, identification_type_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9)
    RETURNING *
    `,
    delete: 'DELETE FROM general_schema.tenant WHERE tenant_id = $1',
    updateStripeId:
      'UPDATE general_schema.tenant SET stripe_id = $1 WHERE tenant_id = $2',
  },

  tenantPayment: {
    all: 'SELECT * FROM general_schema.tenant_payment WHERE tenant_id = $1',
    create: `
    INSERT INTO general_schema.tenant_payment (tenant_id, payment_method_id, payment_amount, details)
    VALUES ($1, $2, $3, $4)
    RETURNING tenant_payment_id
    `,
  },

  productCategory: {
    all: 'SELECT product_category_id AS category_id, category_name FROM general_schema.product_category',
    allPaginated: `
      SELECT product_category_id AS category_id, category_name
      FROM general_schema.product_category
      WHERE ($1::text IS NULL OR category_name ILIKE '%' || $1 || '%')
      ORDER BY category_name
      LIMIT $2 OFFSET $3
    `,
    byId: 'SELECT product_category_id AS category_id, category_name, parent_category_id, hierarchy_level FROM general_schema.product_category WHERE product_category_id = $1',
    create:
      'INSERT INTO general_schema.product_category (category_name) VALUES ($1) RETURNING *',
    update:
      'UPDATE general_schema.product_category SET category_name = $1 WHERE product_category_id = $2',
    delete:
      'DELETE FROM general_schema.product_category WHERE product_category_id = $1',
  },

  customerSegmentMargin: {
    all: 'SELECT * FROM general_schema.customer_segment_margin',
    create: `
    INSERT INTO general_schema.customer_segment_margin (tenant_id, customer_segment_id, customer_segment_margin_type_id, spending_threshold, seniority_months, frequency_per_month)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    delete:
      'DELETE FROM general_schema.customer_segment_margin WHERE customer_segment_margin_id = $1',
    getInfo: `
    SELECT cm.customer_segment_margin_id, t.tenant_name, cs.segment_name, cmt.type_name, cm.spending_threshold, cm.seniority_months, cm.frequency_per_month FROM general_schema.customer_segment_margin cm
    INNER JOIN general_schema.tenant t USING(tenant_id)
    INNER JOIN general_schema.customer_segment cs USING(customer_segment_id)
    LEFT JOIN general_schema.customer_segment_margin_type cmt USING(customer_segment_margin_type_id)
    WHERE cm.tenant_id = $1 
    ORDER BY cm.customer_segment_margin_id
    `,
  },

  products: {
    getAll: `
    SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
           CASE
             WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
             ELSE pv.unit_price
           END AS unit_price,
           pv.cost_price, pv.is_active, pv.is_composite,
           pv.supplier_id, s.supplier_name,
           pv.giftable, pv.giftable_from, pv.includes_iva,
           pv.created_at, pv.updated_at
    FROM general_schema.product_variant pv
    LEFT JOIN LATERAL (
      SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
      FROM general_schema.product_variant_composition pvc
      JOIN general_schema.product_variant child
        ON child.tenant_id = pvc.tenant_id
       AND child.product_variant_id = pvc.child_product_variant_id
      WHERE pvc.tenant_id = pv.tenant_id
        AND pvc.parent_product_variant_id = pv.product_variant_id
    ) comp ON TRUE
    LEFT JOIN purchase_schema.supplier s ON s.supplier_id = pv.supplier_id
    WHERE pv.tenant_id = $1
    `,
    getAllPaginated: `
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.cost_price, pv.is_active, pv.is_composite, pv.tenant_id,
             pv.supplier_id, s.supplier_name,
             pv.giftable, pv.giftable_from, pv.includes_iva,
             pv.created_at, pv.updated_at
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      LEFT JOIN purchase_schema.supplier s ON s.supplier_id = pv.supplier_id
      WHERE pv.tenant_id = $1
      ORDER BY pv.sku
      LIMIT $2 OFFSET $3
    `,
    getAllGlobal: `
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.is_active, pv.is_composite, pv.tenant_id, t.tenant_name
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      LEFT JOIN general_schema.tenant t USING(tenant_id)
      ORDER BY t.tenant_name, pv.sku
      LIMIT $1 OFFSET $2
    `,
    countByTenant:
      'SELECT COUNT(*)::int AS total FROM general_schema.product_variant WHERE tenant_id = $1',
    countAll:
      'SELECT COUNT(*)::int AS total FROM general_schema.product_variant',
    getBySku: `
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.is_active, pv.is_composite, pv.includes_iva
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      WHERE pv.sku = $1
      `,
    searchByTenant: `
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.cost_price, pv.is_active, pv.is_composite, pv.tenant_id,
             pv.supplier_id, s.supplier_name,
             pv.giftable, pv.giftable_from,
             pv.created_at, pv.updated_at
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      LEFT JOIN purchase_schema.supplier s ON s.supplier_id = pv.supplier_id
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
      ORDER BY pv.sku
      LIMIT $3 OFFSET $4
      `,
    countSearchByTenant: `
      SELECT COUNT(*)::int AS total
      FROM general_schema.product_variant pv
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
      `,
    getById: `
      SELECT * FROM general_schema.product_variant
      WHERE product_variant_id = $1 AND tenant_id = $2
      LIMIT 1
      `,
    getByIdWithAttributes: `
      SELECT
        pv.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'attribute_value_id', av.attribute_value_id,
            'value', av.value_name,
            'tenant_attribute_id', av.tenant_attribute_id,
            'attribute_name', ta.attribute_name
          ))
          FROM general_schema.attribute_assignation aa
          JOIN general_schema.attribute_value av ON av.attribute_value_id = aa.attribute_value_id
          JOIN general_schema.tenant_attribute ta ON ta.tenant_attribute_id = av.tenant_attribute_id
          WHERE aa.tenant_id = pv.tenant_id AND aa.product_variant_id = pv.product_variant_id
        ), '[]'::json) AS attributes,
        COALESCE((
          SELECT json_agg(json_build_object(
            'tenant_product_group_id', g.tenant_product_group_id,
            'group_name', g.group_name,
            'tenant_product_group_type_id', g.tenant_product_group_type_id,
            'type_name', t.type_name
          ))
          FROM general_schema.product_variant_group_assignment a
          JOIN general_schema.tenant_product_group g
            ON g.tenant_id = a.tenant_id AND g.tenant_product_group_id = a.tenant_product_group_id
          JOIN general_schema.tenant_product_group_type t
            ON t.tenant_id = g.tenant_id AND t.tenant_product_group_type_id = g.tenant_product_group_type_id
          WHERE a.tenant_id = pv.tenant_id AND a.product_variant_id = pv.product_variant_id
        ), '[]'::json) AS groups
      FROM general_schema.product_variant pv
      WHERE pv.product_variant_id = $1 AND pv.tenant_id = $2
      LIMIT 1
      `,
    searchByTenantWithGroups: `
      WITH RECURSIVE group_tree(node) AS (
        SELECT unnest($5::uuid[])
        UNION
        SELECT pg.tenant_product_group_id
        FROM general_schema.tenant_product_group pg
        JOIN group_tree gt ON gt.node = pg.parent_group_id
        WHERE pg.tenant_id = $1
      )
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.is_active, pv.is_composite, pv.tenant_id
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
        AND (
          $5::uuid[] IS NULL OR cardinality($5::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.product_variant_group_assignment a
            WHERE a.tenant_id = pv.tenant_id
              AND a.product_variant_id = pv.product_variant_id
              AND a.tenant_product_group_id IN (SELECT node FROM group_tree)
          )
        )
      ORDER BY pv.sku
      LIMIT $3 OFFSET $4
      `,
    countSearchByTenantWithGroups: `
      WITH RECURSIVE group_tree(node) AS (
        SELECT unnest($3::uuid[])
        UNION
        SELECT pg.tenant_product_group_id
        FROM general_schema.tenant_product_group pg
        JOIN group_tree gt ON gt.node = pg.parent_group_id
        WHERE pg.tenant_id = $1
      )
      SELECT COUNT(*)::int AS total
      FROM general_schema.product_variant pv
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
        AND (
          $3::uuid[] IS NULL OR cardinality($3::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.product_variant_group_assignment a
            WHERE a.tenant_id = pv.tenant_id
              AND a.product_variant_id = pv.product_variant_id
              AND a.tenant_product_group_id IN (SELECT node FROM group_tree)
          )
        )
      `,
    searchByTenantFiltered: `
      WITH RECURSIVE group_tree(node) AS (
        SELECT unnest($5::uuid[])
        UNION
        SELECT pg.tenant_product_group_id
        FROM general_schema.tenant_product_group pg
        JOIN group_tree gt ON gt.node = pg.parent_group_id
        WHERE pg.tenant_id = $1
      )
      SELECT pv.product_variant_id, pv.sku, pv.variant_name, pv.product_id,
             CASE
               WHEN pv.is_composite THEN COALESCE(comp.computed_unit_price, pv.unit_price)
               ELSE pv.unit_price
             END AS unit_price,
             pv.cost_price, pv.is_active, pv.is_composite, pv.tenant_id,
             pv.supplier_id, s.supplier_name,
             pv.giftable, pv.giftable_from, pv.includes_iva,
             pv.created_at, pv.updated_at
      FROM general_schema.product_variant pv
      LEFT JOIN LATERAL (
        SELECT SUM(child.unit_price * pvc.quantity)::numeric(10,2) AS computed_unit_price
        FROM general_schema.product_variant_composition pvc
        JOIN general_schema.product_variant child
          ON child.tenant_id = pvc.tenant_id
         AND child.product_variant_id = pvc.child_product_variant_id
        WHERE pvc.tenant_id = pv.tenant_id
          AND pvc.parent_product_variant_id = pv.product_variant_id
      ) comp ON TRUE
      LEFT JOIN purchase_schema.supplier s ON s.supplier_id = pv.supplier_id
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
        AND (
          $5::uuid[] IS NULL OR cardinality($5::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.product_variant_group_assignment a
            WHERE a.tenant_id = pv.tenant_id
              AND a.product_variant_id = pv.product_variant_id
              AND a.tenant_product_group_id IN (SELECT node FROM group_tree)
          )
        )
        AND (
          $6::uuid[] IS NULL OR cardinality($6::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.attribute_assignation aa
            WHERE aa.product_variant_id = pv.product_variant_id
              AND aa.attribute_value_id = ANY($6::uuid[])
          )
        )
        AND ($7::boolean IS NULL OR NOT $7 OR pv.supplier_id IS NULL)
      ORDER BY pv.sku
      LIMIT $3 OFFSET $4
      `,
    countSearchByTenantFiltered: `
      WITH RECURSIVE group_tree(node) AS (
        SELECT unnest($3::uuid[])
        UNION
        SELECT pg.tenant_product_group_id
        FROM general_schema.tenant_product_group pg
        JOIN group_tree gt ON gt.node = pg.parent_group_id
        WHERE pg.tenant_id = $1
      )
      SELECT COUNT(*)::int AS total
      FROM general_schema.product_variant pv
      WHERE pv.tenant_id = $1
        AND pv.is_active = TRUE
        AND ($2::text IS NULL OR $2 = '' OR pv.sku ILIKE '%' || $2 || '%' OR pv.variant_name ILIKE '%' || $2 || '%')
        AND (
          $3::uuid[] IS NULL OR cardinality($3::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.product_variant_group_assignment a
            WHERE a.tenant_id = pv.tenant_id
              AND a.product_variant_id = pv.product_variant_id
              AND a.tenant_product_group_id IN (SELECT node FROM group_tree)
          )
        )
        AND (
          $4::uuid[] IS NULL OR cardinality($4::uuid[]) = 0 OR EXISTS (
            SELECT 1 FROM general_schema.attribute_assignation aa
            WHERE aa.product_variant_id = pv.product_variant_id
              AND aa.attribute_value_id = ANY($4::uuid[])
          )
        )
        AND ($5::boolean IS NULL OR NOT $5 OR pv.supplier_id IS NULL)
      `,
    create: `
      INSERT INTO general_schema.product_variant (tenant_id, sku, variant_name, product_id, unit_price, cost_price)
      SELECT $1, $2, $3, $4, $5, COALESCE($6, 0)
      WHERE NOT EXISTS (
        SELECT 1 FROM general_schema.product_variant pv
        WHERE pv.tenant_id = $1
        AND (pv.sku = $2 OR LOWER(pv.variant_name) = LOWER($3))
        )
        RETURNING *
        `,
    setComposite: `
      UPDATE general_schema.product_variant
      SET is_composite = $3, updated_at = NOW()
      WHERE tenant_id = $1 AND product_variant_id = $2
      `,
    delete:
      'DELETE FROM general_schema.product_variant WHERE product_variant_id = $1',
  },

  globalAttribute: {
    all: `
      SELECT global_attribute_id, attribute_name, created_at, updated_at
      FROM general_schema.global_attribute
      ORDER BY attribute_name
    `,
    byId: `
      SELECT global_attribute_id, attribute_name FROM general_schema.global_attribute
      WHERE global_attribute_id = $1 LIMIT 1
    `,
  },

  tenantAttribute: {
    byTenant: `
      SELECT ta.tenant_attribute_id, ta.tenant_id, ta.global_attribute_id,
             ta.attribute_name, ta.is_custom, ta.created_at, ta.updated_at,
             ga.attribute_name AS global_attribute_name
      FROM general_schema.tenant_attribute ta
      LEFT JOIN general_schema.global_attribute ga ON ga.global_attribute_id = ta.global_attribute_id
      WHERE ta.tenant_id = $1
      ORDER BY ta.attribute_name
    `,
    /**
     * Unified search: returns the UNION of (a) tenant_attribute rows for the
     * tenant and (b) global_attribute rows that are NOT yet linked to that
     * tenant. Each row carries `source` ∈ {'TENANT','GLOBAL'} so the client
     * can distinguish. Filtered by case-insensitive name match.
     */
    searchUnified: `
      WITH tenant_rows AS (
        SELECT
          'TENANT'::text                              AS source,
          ta.tenant_attribute_id::text               AS id,
          ta.global_attribute_id::text               AS global_attribute_id,
          ta.attribute_name                           AS name,
          ta.is_custom                                AS is_custom
        FROM general_schema.tenant_attribute ta
        WHERE ta.tenant_id = $1
          AND ($2::text IS NULL OR $2 = '' OR ta.attribute_name ILIKE '%' || $2 || '%')
      ),
      global_rows AS (
        SELECT
          'GLOBAL'::text                              AS source,
          ga.global_attribute_id::text               AS id,
          ga.global_attribute_id::text               AS global_attribute_id,
          ga.attribute_name                           AS name,
          FALSE                                       AS is_custom
        FROM general_schema.global_attribute ga
        WHERE NOT EXISTS (
          SELECT 1 FROM general_schema.tenant_attribute ta
          WHERE ta.tenant_id = $1 AND ta.global_attribute_id = ga.global_attribute_id
        )
        AND ($2::text IS NULL OR $2 = '' OR ga.attribute_name ILIKE '%' || $2 || '%')
      )
      SELECT * FROM (
        SELECT * FROM tenant_rows
        UNION ALL
        SELECT * FROM global_rows
      ) combined
      ORDER BY name
      LIMIT $3 OFFSET $4
    `,
    countSearchUnified: `
      WITH tenant_rows AS (
        SELECT 1 FROM general_schema.tenant_attribute ta
        WHERE ta.tenant_id = $1
          AND ($2::text IS NULL OR $2 = '' OR ta.attribute_name ILIKE '%' || $2 || '%')
      ),
      global_rows AS (
        SELECT 1 FROM general_schema.global_attribute ga
        WHERE NOT EXISTS (
          SELECT 1 FROM general_schema.tenant_attribute ta
          WHERE ta.tenant_id = $1 AND ta.global_attribute_id = ga.global_attribute_id
        )
        AND ($2::text IS NULL OR $2 = '' OR ga.attribute_name ILIKE '%' || $2 || '%')
      )
      SELECT (
        (SELECT COUNT(*) FROM tenant_rows) +
        (SELECT COUNT(*) FROM global_rows)
      )::int AS total
    `,
    byId: `
      SELECT * FROM general_schema.tenant_attribute
      WHERE tenant_attribute_id = $1 AND tenant_id = $2 LIMIT 1
    `,
    createCustom: `
      INSERT INTO general_schema.tenant_attribute
        (tenant_id, attribute_name, is_custom, global_attribute_id)
      VALUES ($1, $2, TRUE, NULL)
      RETURNING *
    `,
    createFromGlobal: `
      INSERT INTO general_schema.tenant_attribute
        (tenant_id, attribute_name, is_custom, global_attribute_id)
      SELECT $1, ga.attribute_name, FALSE, ga.global_attribute_id
      FROM general_schema.global_attribute ga
      WHERE ga.global_attribute_id = $2
      RETURNING *
    `,
    update: `
      UPDATE general_schema.tenant_attribute
      SET attribute_name = COALESCE($3, attribute_name), updated_at = NOW()
      WHERE tenant_attribute_id = $1 AND tenant_id = $2
      RETURNING *
    `,
    delete: `
      DELETE FROM general_schema.tenant_attribute
      WHERE tenant_attribute_id = $1 AND tenant_id = $2
      RETURNING tenant_attribute_id
    `,
  },

  attributeValue: {
    byTenantAttribute: `
      SELECT av.attribute_value_id, av.tenant_id, av.tenant_attribute_id,
             av.value_name AS value, av.created_at, av.updated_at
      FROM general_schema.attribute_value av
      WHERE av.tenant_attribute_id = $1 AND av.tenant_id = $2
      ORDER BY av.value_name
    `,
    byId: `
      SELECT attribute_value_id, tenant_id, tenant_attribute_id,
             value_name AS value, created_at, updated_at
      FROM general_schema.attribute_value
      WHERE attribute_value_id = $1 AND tenant_id = $2 LIMIT 1
    `,
    create: `
      INSERT INTO general_schema.attribute_value (tenant_id, tenant_attribute_id, value_name)
      VALUES ($1, $2, $3)
      RETURNING attribute_value_id, tenant_id, tenant_attribute_id,
                value_name AS value, created_at, updated_at
    `,
    update: `
      UPDATE general_schema.attribute_value
      SET value_name = COALESCE($3, value_name), updated_at = NOW()
      WHERE attribute_value_id = $1 AND tenant_id = $2
      RETURNING attribute_value_id, tenant_id, tenant_attribute_id,
                value_name AS value, created_at, updated_at
    `,
    delete: `
      DELETE FROM general_schema.attribute_value
      WHERE attribute_value_id = $1 AND tenant_id = $2
      RETURNING attribute_value_id
    `,
  },

  attributeAssignation: {
    byVariant: `
      SELECT aa.attribute_value_id, av.value_name AS value, av.tenant_attribute_id,
             ta.attribute_name
      FROM general_schema.attribute_assignation aa
      JOIN general_schema.attribute_value av ON av.attribute_value_id = aa.attribute_value_id
      JOIN general_schema.tenant_attribute ta ON ta.tenant_attribute_id = av.tenant_attribute_id
      WHERE aa.tenant_id = $1 AND aa.product_variant_id = $2
    `,
    validateValuesOwnedByTenant: `
      SELECT COUNT(*)::int AS owned
      FROM general_schema.attribute_value
      WHERE tenant_id = $1 AND attribute_value_id = ANY($2::uuid[])
    `,
    deleteForVariant: `
      DELETE FROM general_schema.attribute_assignation
      WHERE tenant_id = $1 AND product_variant_id = $2
    `,
  },

  productComposition: {
    byParent: `
      SELECT pvc.parent_product_variant_id, pvc.child_product_variant_id, pvc.quantity,
             pv.sku AS child_sku, pv.variant_name AS child_variant_name,
             pv.is_composite AS child_is_composite
      FROM general_schema.product_variant_composition pvc
      JOIN general_schema.product_variant pv
        ON pv.tenant_id = pvc.tenant_id AND pv.product_variant_id = pvc.child_product_variant_id
      WHERE pvc.tenant_id = $1 AND pvc.parent_product_variant_id = $2
    `,
    byChild: `
      SELECT pvc.parent_product_variant_id, pvc.child_product_variant_id, pvc.quantity,
             pv.sku AS parent_sku, pv.variant_name AS parent_variant_name
      FROM general_schema.product_variant_composition pvc
      JOIN general_schema.product_variant pv
        ON pv.tenant_id = pvc.tenant_id AND pv.product_variant_id = pvc.parent_product_variant_id
      WHERE pvc.tenant_id = $1 AND pvc.child_product_variant_id = $2
    `,
    descendants: `
      WITH RECURSIVE d(node) AS (
        SELECT child_product_variant_id FROM general_schema.product_variant_composition
          WHERE tenant_id = $1 AND parent_product_variant_id = $2
        UNION
        SELECT pvc.child_product_variant_id FROM general_schema.product_variant_composition pvc
          INNER JOIN d ON d.node = pvc.parent_product_variant_id
          WHERE pvc.tenant_id = $1
      )
      SELECT node FROM d
    `,
    deleteAllForParent: `
      DELETE FROM general_schema.product_variant_composition
      WHERE tenant_id = $1 AND parent_product_variant_id = $2
    `,
    updateQuantity: `
      UPDATE general_schema.product_variant_composition
      SET quantity = $4, updated_at = NOW()
      WHERE tenant_id = $1 AND parent_product_variant_id = $2 AND child_product_variant_id = $3
      RETURNING *
    `,
  },

  tenantProductGroupType: {
    byTenant: `
      SELECT * FROM general_schema.tenant_product_group_type
      WHERE tenant_id = $1
      ORDER BY type_name
    `,
    byId: `
      SELECT * FROM general_schema.tenant_product_group_type
      WHERE tenant_product_group_type_id = $1 AND tenant_id = $2 LIMIT 1
    `,
    create: `
      INSERT INTO general_schema.tenant_product_group_type
        (tenant_id, type_name, description, is_active)
      VALUES ($1, $2, $3, COALESCE($4, TRUE))
      RETURNING *
    `,
    update: `
      UPDATE general_schema.tenant_product_group_type
      SET type_name   = COALESCE($3, type_name),
          description = COALESCE($4, description),
          is_active   = COALESCE($5, is_active),
          updated_at  = NOW()
      WHERE tenant_product_group_type_id = $1 AND tenant_id = $2
      RETURNING *
    `,
    delete: `
      DELETE FROM general_schema.tenant_product_group_type
      WHERE tenant_product_group_type_id = $1 AND tenant_id = $2
      RETURNING tenant_product_group_type_id
    `,
  },

  tenantProductGroup: {
    byTenant: `
      SELECT g.*, t.type_name FROM general_schema.tenant_product_group g
      LEFT JOIN general_schema.tenant_product_group_type t
        ON t.tenant_id = g.tenant_id AND t.tenant_product_group_type_id = g.tenant_product_group_type_id
      WHERE g.tenant_id = $1
      ORDER BY t.type_name, g.hierarchy_level, g.group_name
    `,
    byId: `
      SELECT * FROM general_schema.tenant_product_group
      WHERE tenant_product_group_id = $1 AND tenant_id = $2 LIMIT 1
    `,
    tree: `
      WITH RECURSIVE tree AS (
        SELECT g.*, ARRAY[g.group_name]::text[] AS path
        FROM general_schema.tenant_product_group g
        WHERE g.tenant_id = $1 AND g.tenant_product_group_type_id = $2 AND g.parent_group_id IS NULL
        UNION ALL
        SELECT g.*, t.path || g.group_name
        FROM general_schema.tenant_product_group g
        JOIN tree t ON t.tenant_id = g.tenant_id AND t.tenant_product_group_id = g.parent_group_id
        WHERE g.tenant_id = $1
      )
      SELECT * FROM tree ORDER BY path
    `,
    descendants: `
      WITH RECURSIVE d(node) AS (
        SELECT tenant_product_group_id FROM general_schema.tenant_product_group
        WHERE tenant_id = $1 AND tenant_product_group_id = $2
        UNION
        SELECT g.tenant_product_group_id FROM general_schema.tenant_product_group g
        INNER JOIN d ON d.node = g.parent_group_id
        WHERE g.tenant_id = $1
      )
      SELECT node FROM d
    `,
    create: `
      INSERT INTO general_schema.tenant_product_group
        (tenant_id, tenant_product_group_type_id, parent_group_id, group_name, hierarchy_level, is_active)
      VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, TRUE))
      RETURNING *
    `,
    update: `
      UPDATE general_schema.tenant_product_group
      SET group_name      = COALESCE($3, group_name),
          parent_group_id = $4,
          hierarchy_level = COALESCE($5, hierarchy_level),
          is_active       = COALESCE($6, is_active),
          updated_at      = NOW()
      WHERE tenant_product_group_id = $1 AND tenant_id = $2
      RETURNING *
    `,
    delete: `
      DELETE FROM general_schema.tenant_product_group
      WHERE tenant_product_group_id = $1 AND tenant_id = $2
      RETURNING tenant_product_group_id
    `,
    validateGroupsOwnedByTenant: `
      SELECT COUNT(*)::int AS owned
      FROM general_schema.tenant_product_group
      WHERE tenant_id = $1 AND tenant_product_group_id = ANY($2::uuid[])
    `,
  },

  productVariantGroupAssignment: {
    byVariant: `
      SELECT a.tenant_product_group_id, g.group_name, g.tenant_product_group_type_id,
             t.type_name, g.hierarchy_level
      FROM general_schema.product_variant_group_assignment a
      JOIN general_schema.tenant_product_group g
        ON g.tenant_id = a.tenant_id AND g.tenant_product_group_id = a.tenant_product_group_id
      JOIN general_schema.tenant_product_group_type t
        ON t.tenant_id = g.tenant_id AND t.tenant_product_group_type_id = g.tenant_product_group_type_id
      WHERE a.tenant_id = $1 AND a.product_variant_id = $2
    `,
    variantsByGroup: `
      WITH RECURSIVE tree(node) AS (
        SELECT $2::uuid
        UNION
        SELECT g.tenant_product_group_id
        FROM general_schema.tenant_product_group g
        JOIN tree t ON t.node = g.parent_group_id
        WHERE g.tenant_id = $1
      )
      SELECT DISTINCT pv.product_variant_id, pv.sku, pv.variant_name, pv.unit_price
      FROM general_schema.product_variant_group_assignment a
      JOIN general_schema.product_variant pv
        ON pv.tenant_id = a.tenant_id AND pv.product_variant_id = a.product_variant_id
      WHERE a.tenant_id = $1
        AND a.tenant_product_group_id IN (SELECT node FROM tree)
      ORDER BY pv.sku
    `,
    deleteForVariant: `
      DELETE FROM general_schema.product_variant_group_assignment
      WHERE tenant_id = $1 AND product_variant_id = $2
    `,
  },

  customerPayment: {
    getPayments: `
    SELECT cp.payment_amount, pm.name, cp.payment_date, cp.verified, tc.first_name, tc.last_name, c.symbol FROM pos_schema.customer_payment cp
    INNER JOIN general_schema.tenant_customer tc USING(tenant_customer_id)
    INNER JOIN general_schema.payment_method pm USING(payments_method_id)
    INNER JOIN general_schema.currency c USING(currency_id)
    `,
    getCustomerPayments: `
    SELECT cp.payment_amount, pm.name, cp.payment_date, cp.verified, tc.first_name, tc.last_name, c.currency_code FROM pos_schema.customer_payment cp
    INNER JOIN general_schema.tenant_customer tc USING(tenant_customer_id)
    INNER JOIN general_schema.payment_method pm USING(payment_method_id)
    INNER JOIN general_schema.currency c USING(currency_id)
    WHERE cp.tenant_customer_id = $1
    `,
    createNewPayment: `
    INSERT INTO pos_schema.customer_payment (tenant_customer_id, sale_id, payment_method_id, payment_amount, payment_date, currency_id, verified)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    deletePayment:
      'DELETE FROM pos_schema.customer_payment WHERE customer_payment_id = $1',
  },

  branch: {
    all: `
    SELECT * FROM general_schema.branch
    `,
    allPaginated: `
      SELECT b.*, t.tenant_name FROM general_schema.branch b
      LEFT JOIN general_schema.tenant t USING(tenant_id)
      ORDER BY t.tenant_name, b.branch_name
      LIMIT $1 OFFSET $2
    `,
    countAll: 'SELECT COUNT(*)::int AS total FROM general_schema.branch',
    byId: `
    SELECT * FROM general_schema.branch b
    WHERE b.branch_id = $1 LIMIT 1
    `,
    byTenant: `
    SELECT * FROM general_schema.branch WHERE tenant_id = $1
    `,
    byTenantPaginated: `
      SELECT * FROM general_schema.branch
      WHERE tenant_id = $1
      ORDER BY is_main_branch DESC, created_at DESC
      LIMIT $2 OFFSET $3
    `,
    countByTenant:
      'SELECT COUNT(*)::int AS total FROM general_schema.branch WHERE tenant_id = $1',
    byName: `
    SELECT * FROM general_schema.branch WHERE branch_name = $1 LIMIT 1
    `,
    byIdAndTenant: `
    SELECT * FROM general_schema.branch WHERE branch_id = $1 AND tenant_id = $2 LIMIT 1
    `,
    update: `
    UPDATE general_schema.branch SET 
    branch_name = COALESCE($2, branch_name),
    branch_number = COALESCE($3, branch_number),
    branch_address = COALESCE($4, branch_address),
    contact_email = COALESCE($5, contact_email),
    is_main_branch = COALESCE($6, is_main_branch),
    updated_at = NOW()
    WHERE branch_id = $1
    RETURNING *
    `,
    create: `
    INSERT INTO general_schema.branch (tenant_id, branch_name, branch_number, branch_address, contact_email, is_main_branch, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING *
    `,
    delete: `
    DELETE FROM general_schema.branch WHERE branch_id = $1 RETURNING *
    `,
  },

  subscriptions: {
    cancelSubscription:
      'UPDATE general_schema.tenant SET is_subscribed = false WHERE tenant_id = $1',
    createSubscription: `
    INSERT INTO general_schema.subscription (
      tenant_id, subscription_type_id, tenant_payment_id,
      start_date, end_date
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING subscription_id
    `,
  },

  customerSegment: {
    getSegments: `
      SELECT customer_segment_id AS segment_id, segment_name, segment_hierarchy AS hierarchy FROM general_schema.customer_segment
    `,
    newSegments: `
      INSERT INTO general_schema.customer_segment (segment_name, segment_hierarchy)
      VALUES ($1, $2)
      RETURNING customer_segment_id
    `,
    deleteSegment: `
      DELETE FROM general_schema.customer_segment WHERE customer_segment_id = $1
      RETURNING customer_segment_id
    `,
  },

  onboardingAvailability: {
    /**
     * Endpoints sin sesión usados durante el onboarding para detectar
     * conflictos antes de comprometer la transacción de creación. Cada
     * query devuelve filas si el valor ya está tomado.
     */
    userEmailExists: `
      SELECT 1 FROM general_schema.users WHERE email = $1
      UNION ALL
      SELECT 1 FROM hr_schema.employee WHERE email = $1
      LIMIT 1
    `,
    employeeDocExists: `
      SELECT 1 FROM hr_schema.employee WHERE doc_number = $1 LIMIT 1
    `,
    tenantIdentificationExists: `
      SELECT 1 FROM general_schema.tenant WHERE identification = $1 LIMIT 1
    `,
    tenantNameExists: `
      SELECT 1 FROM general_schema.tenant WHERE LOWER(tenant_name) = LOWER($1) LIMIT 1
    `,
  },

  specialCode: {
    listAll: `
      SELECT
        sc.special_code_id, sc.code, sc.description,
        sc.is_used, sc.tenant_id, sc.used_at, sc.expires_at,
        sc.created_by, sc.created_at, sc.updated_at,
        t.tenant_name AS used_by_tenant_name,
        creator.email AS created_by_email
      FROM general_schema.special_code sc
      LEFT JOIN general_schema.tenant t ON t.tenant_id = sc.tenant_id
      LEFT JOIN general_schema.users creator ON creator.user_id = sc.created_by
      ORDER BY sc.created_at DESC
    `,
    byCode: `
      SELECT special_code_id, code, description, is_used, tenant_id,
             used_at, expires_at, created_by, created_at, updated_at
      FROM general_schema.special_code
      WHERE code = $1
      LIMIT 1
    `,
    create: `
      INSERT INTO general_schema.special_code (code, description, created_by, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING special_code_id, code, description, is_used, tenant_id,
                used_at, expires_at, created_by, created_at, updated_at
    `,
    /**
     * Marca un código como usado de forma atómica. Solo afecta filas con
     * is_used = FALSE para impedir doble canje aunque dos onboardings
     * compitan al mismo tiempo. Devuelve cero filas si el código ya fue
     * consumido o no existe.
     */
    consume: `
      UPDATE general_schema.special_code
      SET is_used = TRUE,
          tenant_id = $2,
          used_at = NOW(),
          updated_at = NOW()
      WHERE code = $1
        AND is_used = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING special_code_id, code, tenant_id, used_at
    `,
    delete: `
      DELETE FROM general_schema.special_code
      WHERE special_code_id = $1 AND is_used = FALSE
      RETURNING special_code_id
    `,
  },
};

export const generalQueries = createQueries(generalQueryDefs);

export const bulkPayments = [
  'tenant_customer_id',
  'sale_id',
  'payment_method_id',
  'payment_amount',
  'payment_date',
  'currency_id',
  'verified',
];

export const bulkProducts = [
  'tenant_id',
  'sku',
  'variant_name',
  'product_id',
  'unit_price',
  'cost_price',
  'supplier_id',
  'giftable',
  'giftable_from',
  'includes_iva',
];

export const bulkAttributeAssignations = [
  'tenant_id',
  'product_variant_id',
  'attribute_value_id',
];

export const bulkProductVariantGroupAssignments = [
  'tenant_id',
  'product_variant_id',
  'tenant_product_group_id',
];

export const bulkProductVariantCompositions = [
  'tenant_id',
  'parent_product_variant_id',
  'child_product_variant_id',
  'quantity',
];
