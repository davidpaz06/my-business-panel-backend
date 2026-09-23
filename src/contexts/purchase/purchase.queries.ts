import { createQueries } from '@crane-technologies/database';

const purchaseOrderListSelect = `
  SELECT
    po.purchase_order_id,
    po.purchase_order_date,
    po.expected_delivery_date,
    po.purchase_order_status_id,
    pos.status_name AS purchase_order_status_name,
    s.supplier_id,
    s.supplier_name,
    po.warehouse_id,
    w.warehouse_name,
    b.branch_id,
    b.branch_name,
    b.tenant_id,
    t.tenant_name,
    pap.purchase_account_payable_id,
    pap.account_payable_status,
    aps.status_name AS account_payable_status_name,
    ap.account_payable_id,
    ap.due_date,
    ap.subtotal,
    COALESCE(pap.tax_amount, 0) AS tax_amount,
    (ap.subtotal + COALESCE(pap.tax_amount, 0)) AS total_amount,
    ap.amount_paid,
    GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS balance_due,
    ap.is_paid,
    inv.invoice_number,
    inv.payment_condition,
    po.created_at,
    po.updated_at
  FROM purchase_schema.purchase_order po
  INNER JOIN inventory_schema.warehouse w
    ON w.warehouse_id = po.warehouse_id
  INNER JOIN general_schema.branch b
    ON b.branch_id = w.branch_id
  INNER JOIN general_schema.tenant t
    ON t.tenant_id = b.tenant_id
  LEFT JOIN purchase_schema.supplier s
    ON s.supplier_id = po.supplier_id
  LEFT JOIN purchase_schema.purchase_order_status pos
    ON pos.status_id = po.purchase_order_status_id
  LEFT JOIN purchase_schema.purchase_account_payable pap
    ON pap.purchase_order_id = po.purchase_order_id
  LEFT JOIN general_schema.account_payable ap
    ON ap.account_payable_id = pap.account_payable_id
  LEFT JOIN general_schema.account_payable_status aps
    ON aps.status_id = pap.account_payable_status
  LEFT JOIN LATERAL (
    SELECT
      si.invoice_number,
      si.payment_condition
    FROM purchase_schema.supplier_invoice si
    WHERE si.purchase_order_id = po.purchase_order_id
    ORDER BY si.created_at DESC
    LIMIT 1
  ) inv ON TRUE
`;

const accountPayableListSelect = `
  SELECT
    pap.purchase_account_payable_id,
    pap.purchase_order_id,
    pap.account_payable_status,
    aps.status_name AS account_payable_status_name,
    po.purchase_order_status_id,
    pos.status_name AS purchase_order_status_name,
    s.supplier_id,
    s.supplier_name,
    w.warehouse_id,
    w.warehouse_name,
    b.branch_id,
    b.branch_name,
    b.tenant_id,
    t.tenant_name,
    ap.account_payable_id,
    ap.due_date,
    ap.subtotal,
    COALESCE(pap.tax_amount, 0) AS tax_amount,
    (ap.subtotal + COALESCE(pap.tax_amount, 0)) AS total_amount,
    ap.amount_paid,
    GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS balance_due,
    ap.is_paid,
    inv.invoice_number,
    inv.payment_condition,
    COALESCE(payments.payment_count, 0) AS payment_count,
    payments.last_payment_date,
    pap.created_at,
    pap.updated_at
  FROM purchase_schema.purchase_account_payable pap
  INNER JOIN general_schema.account_payable ap
    ON ap.account_payable_id = pap.account_payable_id
  INNER JOIN purchase_schema.purchase_order po
    ON po.purchase_order_id = pap.purchase_order_id
  INNER JOIN inventory_schema.warehouse w
    ON w.warehouse_id = po.warehouse_id
  INNER JOIN general_schema.branch b
    ON b.branch_id = w.branch_id
  INNER JOIN general_schema.tenant t
    ON t.tenant_id = b.tenant_id
  LEFT JOIN purchase_schema.supplier s
    ON s.supplier_id = po.supplier_id
  LEFT JOIN purchase_schema.purchase_order_status pos
    ON pos.status_id = po.purchase_order_status_id
  LEFT JOIN general_schema.account_payable_status aps
    ON aps.status_id = pap.account_payable_status
  LEFT JOIN LATERAL (
    SELECT
      si.invoice_number,
      si.payment_condition
    FROM purchase_schema.supplier_invoice si
    WHERE si.purchase_order_id = po.purchase_order_id
    ORDER BY si.created_at DESC
    LIMIT 1
  ) inv ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS payment_count,
      MAX(pop.payment_date) AS last_payment_date
    FROM purchase_schema.purchase_order_payment pop
    WHERE pop.purchase_account_payable_id = pap.purchase_account_payable_id
  ) payments ON TRUE
`;

export const purchaseQueryDefs = {
  purchase: {
    createPurchaseOrder: `
      SELECT purchase_schema.create_purchase_order(
        $1, $2, $3, $4, $5, $6
      ) AS purchase_order_id
    `,

    getCreateContext: `
      SELECT
        s.supplier_id,
        s.added_by AS supplier_tenant_id,
        w.warehouse_id,
        b.tenant_id AS warehouse_tenant_id
      FROM purchase_schema.supplier s
      CROSS JOIN inventory_schema.warehouse w
      INNER JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE s.supplier_id = $1
        AND w.warehouse_id = $2
      LIMIT 1
    `,

    getAccessById: `
      SELECT
        po.purchase_order_id,
        po.purchase_order_status_id,
        b.tenant_id
      FROM purchase_schema.purchase_order po
      INNER JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      INNER JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE po.purchase_order_id = $1
      LIMIT 1
    `,

    updateStatus: `
      UPDATE purchase_schema.purchase_order
      SET purchase_order_status_id = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE purchase_order_id = $2
      RETURNING purchase_order_id, purchase_order_status_id, updated_at
    `,

    updateOrderStatus: `
      UPDATE purchase_schema.purchase_order
      SET purchase_order_status_id = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE purchase_order_id = $2
      RETURNING purchase_order_id, purchase_order_status_id, updated_at
    `,

    getAllByTenant: `
      ${purchaseOrderListSelect}
      WHERE b.tenant_id = $1
      ORDER BY po.purchase_order_date DESC, po.created_at DESC
    `,

    getAllGlobal: `
      ${purchaseOrderListSelect}
      ORDER BY po.purchase_order_date DESC, po.created_at DESC
    `,

    getItemsForInventory: `
      SELECT
        poi.product_variant_id,
        poi.quantity_ordered,
        poi.unit_price AS unit_cost,
        poi.tenant_id,
        po.warehouse_id,
        po.purchase_order_id
      FROM purchase_schema.purchase_order_item poi
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = poi.purchase_order_id
      WHERE poi.purchase_order_id = $1
    `,

    getOrderAmountsForJournal: `
      SELECT
        ap.subtotal AS subtotal_amount,
        COALESCE(pap.tax_amount, 0) AS tax_amount,
        (ap.subtotal + COALESCE(pap.tax_amount, 0)) AS total_amount,
        b.tenant_id
      FROM purchase_schema.purchase_order po
      INNER JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      INNER JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      LEFT JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_order_id = po.purchase_order_id
      LEFT JOIN general_schema.account_payable ap
        ON ap.account_payable_id = pap.account_payable_id
      WHERE po.purchase_order_id = $1
      LIMIT 1
    `,

    getById: `
      SELECT
        po.purchase_order_id,
        po.purchase_order_date,
        po.expected_delivery_date,
        po.purchase_order_status_id,
        pos.status_name AS purchase_order_status_name,
        s.supplier_id,
        s.supplier_name,
        po.warehouse_id,
        w.warehouse_name,
        b.branch_id,
        b.branch_name,
        b.tenant_id,
        t.tenant_name,
        pap.purchase_account_payable_id,
        pap.account_payable_status,
        aps.status_name AS account_payable_status_name,
        ap.account_payable_id,
        ap.due_date,
        ap.subtotal,
        COALESCE(pap.tax_amount, 0) AS tax_amount,
        (ap.subtotal + COALESCE(pap.tax_amount, 0)) AS total_amount,
        ap.amount_paid,
        GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS balance_due,
        ap.is_paid,

        COALESCE((
          SELECT json_agg(item_row ORDER BY item_row.created_at)
          FROM (
            SELECT
              poi.purchase_order_item_id,
              poi.product_variant_id,
              pv.sku,
              pv.variant_name,
              poi.quantity_ordered,
              poi.unit_price,
              ROUND((poi.quantity_ordered * poi.unit_price)::numeric, 3) AS line_total,
              -- Sales analytics: aggregates pulled from completed sale_items
              -- for the same tenant + variant since the order was created.
              -- Lifetime totals
              COALESCE(sales_lifetime.total_quantity_sold, 0) AS sales_quantity_lifetime,
              COALESCE(sales_lifetime.total_revenue, 0) AS sales_revenue_lifetime,
              -- Trailing 30 days (proxy for current rotation)
              COALESCE(sales_30d.total_quantity_sold, 0) AS sales_quantity_30d,
              COALESCE(sales_30d.total_revenue, 0) AS sales_revenue_30d,
              -- Since this PO was placed (so the user can see how much of
              -- what they bought has actually moved out)
              COALESCE(sales_since_po.total_quantity_sold, 0) AS sales_quantity_since_po,
              COALESCE(sales_since_po.total_revenue, 0) AS sales_revenue_since_po,
              sales_lifetime.last_sold_at,
              poi.created_at,
              poi.updated_at
            FROM purchase_schema.purchase_order_item poi
            JOIN general_schema.product_variant pv
              ON pv.tenant_id = poi.tenant_id
             AND pv.product_variant_id = poi.product_variant_id
            LEFT JOIN LATERAL (
              SELECT
                COALESCE(SUM(si.quantity), 0) AS total_quantity_sold,
                COALESCE(SUM(si.total_price), 0) AS total_revenue,
                MAX(s.sale_date) AS last_sold_at
              FROM pos_schema.sale_item si
              JOIN pos_schema.sale s ON s.sale_id = si.sale_id
              WHERE si.tenant_id = poi.tenant_id
                AND si.product_variant_id = poi.product_variant_id
                AND s.is_completed = TRUE
            ) sales_lifetime ON TRUE
            LEFT JOIN LATERAL (
              SELECT
                COALESCE(SUM(si.quantity), 0) AS total_quantity_sold,
                COALESCE(SUM(si.total_price), 0) AS total_revenue
              FROM pos_schema.sale_item si
              JOIN pos_schema.sale s ON s.sale_id = si.sale_id
              WHERE si.tenant_id = poi.tenant_id
                AND si.product_variant_id = poi.product_variant_id
                AND s.is_completed = TRUE
                AND s.sale_date >= NOW() - INTERVAL '30 days'
            ) sales_30d ON TRUE
            LEFT JOIN LATERAL (
              SELECT
                COALESCE(SUM(si.quantity), 0) AS total_quantity_sold,
                COALESCE(SUM(si.total_price), 0) AS total_revenue
              FROM pos_schema.sale_item si
              JOIN pos_schema.sale s ON s.sale_id = si.sale_id
              WHERE si.tenant_id = poi.tenant_id
                AND si.product_variant_id = poi.product_variant_id
                AND s.is_completed = TRUE
                AND s.sale_date >= po.purchase_order_date
            ) sales_since_po ON TRUE
            WHERE poi.purchase_order_id = po.purchase_order_id
          ) item_row
        ), '[]'::json) AS items,

        COALESCE((
          SELECT json_agg(invoice_row ORDER BY invoice_row.created_at DESC)
          FROM (
            SELECT
              si.supplier_invoice_id,
              si.invoice_number,
              si.invoice_date,
              si.payment_condition,
              si.due_date,
              si.subtotal_amount,
              si.tax_rate,
              si.tax_amount,
              si.total_amount,
              si.paid,
              si.created_at,
              si.updated_at
            FROM purchase_schema.supplier_invoice si
            WHERE si.purchase_order_id = po.purchase_order_id
          ) invoice_row
        ), '[]'::json) AS invoices,

        COALESCE((
          SELECT json_agg(payment_row ORDER BY payment_row.payment_date DESC, payment_row.created_at DESC)
          FROM (
            SELECT
              pop.purchase_order_payment_id,
              pop.purchase_account_payable_id,
              pop.payment_method_id,
              pm.name AS payment_method_name,
              pop.amount_paid,
              pop.payment_reference,
              pop.notes,
              pop.payment_date,
              pop.created_at,
              pop.updated_at
            FROM purchase_schema.purchase_order_payment pop
            LEFT JOIN general_schema.payment_method pm
              ON pm.payment_method_id = pop.payment_method_id
            WHERE pop.purchase_account_payable_id = pap.purchase_account_payable_id
          ) payment_row
        ), '[]'::json) AS payments,

        COALESCE((
          SELECT json_agg(receipt_row ORDER BY receipt_row.received_date DESC)
          FROM (
            SELECT
              gr.goods_receipt_id,
              gr.received_date,
              gr.subtotal_amount,
              gr.tax_amount,
              gr.total_amount,
              COALESCE(items.items_received, 0) AS items_received,
              gr.created_at,
              gr.updated_at
            FROM purchase_schema.goods_receipt gr
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS items_received
              FROM purchase_schema.goods_receipt_item gri
              WHERE gri.goods_receipt_id = gr.goods_receipt_id
            ) items ON TRUE
            WHERE gr.purchase_order_id = po.purchase_order_id
          ) receipt_row
        ), '[]'::json) AS goods_receipts,

        po.created_at,
        po.updated_at
      FROM purchase_schema.purchase_order po
      INNER JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      INNER JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      INNER JOIN general_schema.tenant t
        ON t.tenant_id = b.tenant_id
      LEFT JOIN purchase_schema.supplier s
        ON s.supplier_id = po.supplier_id
      LEFT JOIN purchase_schema.purchase_order_status pos
        ON pos.status_id = po.purchase_order_status_id
      LEFT JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_order_id = po.purchase_order_id
      LEFT JOIN general_schema.account_payable ap
        ON ap.account_payable_id = pap.account_payable_id
      LEFT JOIN general_schema.account_payable_status aps
        ON aps.status_id = pap.account_payable_status
      WHERE po.purchase_order_id = $1
      LIMIT 1
    `,

    threeWayMatching: `
      SELECT purchase_schema.execute_three_way_matching($1::uuid, $2::uuid)
    `,

    getMatchingByOrderId: `
      SELECT
        twm.matching_id,
        twm.purchase_order_id,
        twm.goods_receipt_id,
        twm.supplier_invoice_id,
        twm.amounts_matched,
        twm.quantities_matched,
        twm.is_matched,
        twm.matched_at,

        json_build_object(
          'order', json_build_object(
            'subtotal', ap.subtotal,
            'tax', pap.tax_amount,
            'total', (ap.subtotal + COALESCE(pap.tax_amount, 0))
          ),
          'invoice', json_build_object(
            'subtotal', si.subtotal_amount,
            'tax', si.tax_amount,
            'total', si.total_amount
          ),
          'receipt', json_build_object(
            'subtotal', gr.subtotal_amount,
            'tax', gr.tax_amount,
            'total', gr.total_amount
          ),
          'differences', json_build_object(
            'order_vs_invoice_total', ABS((ap.subtotal + COALESCE(pap.tax_amount, 0)) - si.total_amount),
            'order_vs_receipt_total', ABS((ap.subtotal + COALESCE(pap.tax_amount, 0)) - gr.total_amount),
            'invoice_vs_receipt_total', ABS(si.total_amount - gr.total_amount)
          )
        ) AS amount_comparison,

        json_build_object(
          'order_qty', COALESCE(poi.total_qty, 0),
          'invoice_qty', COALESCE(sii.total_qty, 0),
          'receipt_qty', COALESCE(gri.total_qty, 0),
          'differences', json_build_object(
            'order_vs_invoice', ABS(COALESCE(poi.total_qty, 0) - COALESCE(sii.total_qty, 0)),
            'order_vs_receipt', ABS(COALESCE(poi.total_qty, 0) - COALESCE(gri.total_qty, 0)),
            'invoice_vs_receipt', ABS(COALESCE(sii.total_qty, 0) - COALESCE(gri.total_qty, 0))
          )
        ) AS quantity_comparison
      FROM purchase_schema.three_way_matching twm
      INNER JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = twm.purchase_order_id
      LEFT JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_order_id = po.purchase_order_id
      LEFT JOIN general_schema.account_payable ap
        ON ap.account_payable_id = pap.account_payable_id
      LEFT JOIN purchase_schema.supplier_invoice si
        ON si.supplier_invoice_id = twm.supplier_invoice_id
      LEFT JOIN purchase_schema.goods_receipt gr
        ON gr.goods_receipt_id = twm.goods_receipt_id
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_ordered)::int AS total_qty
        FROM purchase_schema.purchase_order_item
        WHERE purchase_order_id = po.purchase_order_id
      ) poi ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_billed)::int AS total_qty
        FROM purchase_schema.supplier_invoice_item
        WHERE supplier_invoice_id = twm.supplier_invoice_id
      ) sii ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_received)::int AS total_qty
        FROM purchase_schema.goods_receipt_item
        WHERE goods_receipt_id = twm.goods_receipt_id
      ) gri ON TRUE
      WHERE twm.purchase_order_id = $1
      ORDER BY twm.created_at DESC
      LIMIT 1
    `,
  },

  suppliers: {
    create: `
      INSERT INTO purchase_schema.supplier (
        supplier_name,
        supplier_contact_info,
        supplier_address,
        supplier_notes,
        added_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,

    createBranchLink: `
      INSERT INTO purchase_schema.supplier_branch (supplier_id, branch_id)
      VALUES ($1, $2)
      ON CONFLICT (supplier_id, branch_id) DO NOTHING
    `,

    getTenantPrimaryBranch: `
      SELECT branch_id
      FROM general_schema.branch
      WHERE tenant_id = $1
      ORDER BY is_main_branch DESC, created_at ASC
      LIMIT 1
    `,

    getAll: `
      SELECT *
      FROM purchase_schema.supplier
      ORDER BY supplier_name ASC, created_at DESC
    `,

    getAllByTenant: `
      SELECT *
      FROM purchase_schema.supplier
      WHERE added_by = $1
      ORDER BY supplier_name ASC, created_at DESC
    `,

    getById: `
      SELECT *
      FROM purchase_schema.supplier
      WHERE supplier_id = $1
      LIMIT 1
    `,

    getByIdAndTenant: `
      SELECT *
      FROM purchase_schema.supplier
      WHERE supplier_id = $1
        AND added_by = $2
      LIMIT 1
    `,

    update: `
      UPDATE purchase_schema.supplier
      SET supplier_name = $1,
          supplier_contact_info = $2,
          supplier_address = $3,
          supplier_notes = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE supplier_id = $5
        AND added_by = $6
      RETURNING *
    `,

    delete: `
      DELETE FROM purchase_schema.supplier
      WHERE supplier_id = $1
        AND added_by = $2
      RETURNING *
    `,

    countOrders: `
      SELECT COUNT(*)::int AS total
      FROM purchase_schema.purchase_order
      WHERE supplier_id = $1
    `,
  },

  payments: {
    insertPayment: `
      INSERT INTO purchase_schema.purchase_order_payment
        (purchase_account_payable_id, amount_paid, payment_method_id, currency_id, payment_reference)
      VALUES
        ($1, $2, $3, COALESCE($4, 1), $5)
      RETURNING purchase_order_payment_id
    `,

    getPaymentAmountForJournal: `
      SELECT
        pop.amount_paid,
        b.tenant_id,
        po.purchase_order_id
      FROM purchase_schema.purchase_order_payment pop
      JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_account_payable_id = pop.purchase_account_payable_id
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = pap.purchase_order_id
      JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE pop.purchase_order_payment_id = $1
      LIMIT 1
    `,

    getPayableAccess: `
      SELECT
        pap.purchase_account_payable_id,
        pap.purchase_order_id,
        b.tenant_id
      FROM purchase_schema.purchase_account_payable pap
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = pap.purchase_order_id
      JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE pap.purchase_account_payable_id = $1
      LIMIT 1
    `,

    updatePayment: `
      UPDATE purchase_schema.purchase_order_payment
      SET amount_paid = $1,
          payment_method_id = $2,
          currency_id = $3,
          payment_reference = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE purchase_order_payment_id = $5
      RETURNING *
    `,

    getPaymentAccess: `
      SELECT
        pop.purchase_order_payment_id,
        b.tenant_id,
        pap.purchase_order_id,
        pap.purchase_account_payable_id
      FROM purchase_schema.purchase_order_payment pop
      JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_account_payable_id = pop.purchase_account_payable_id
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = pap.purchase_order_id
      JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE pop.purchase_order_payment_id = $1
      LIMIT 1
    `,
  },

  ap: {
    getAllByTenant: `
      ${accountPayableListSelect}
      WHERE b.tenant_id = $1
      ORDER BY ap.due_date ASC, pap.created_at DESC
    `,

    getAllGlobal: `
      ${accountPayableListSelect}
      ORDER BY ap.due_date ASC, pap.created_at DESC
    `,

    getUpdatedPayableById: `
      SELECT
        pap.purchase_account_payable_id,
        pap.purchase_order_id,
        pap.account_payable_status,
        aps.status_name AS account_payable_status_name,
        ap.account_payable_id,
        ap.due_date,
        ap.subtotal,
        COALESCE(pap.tax_amount, 0) AS tax_amount,
        (ap.subtotal + COALESCE(pap.tax_amount, 0)) AS total_amount,
        ap.amount_paid,
        GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS balance_due,
        ap.is_paid,
        pap.updated_at
      FROM purchase_schema.purchase_account_payable pap
      JOIN general_schema.account_payable ap
        ON ap.account_payable_id = pap.account_payable_id
      LEFT JOIN general_schema.account_payable_status aps
        ON aps.status_id = pap.account_payable_status
      WHERE pap.purchase_account_payable_id = $1
      LIMIT 1
    `,
  },

  alerts: {
    getPendingByTenant: `
      SELECT *
      FROM purchase_schema.get_pending_payment_alerts($1)
    `,

    getAccessById: `
      SELECT
        spa.payment_alert_id,
        b.tenant_id
      FROM purchase_schema.purchase_order_payment_alert spa
      JOIN purchase_schema.purchase_account_payable pap
        ON pap.purchase_account_payable_id = spa.purchase_account_payable_id
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = pap.purchase_order_id
      JOIN inventory_schema.warehouse w
        ON w.warehouse_id = po.warehouse_id
      JOIN general_schema.branch b
        ON b.branch_id = w.branch_id
      WHERE spa.payment_alert_id = $1
      LIMIT 1
    `,

    getConfigByTenant: `
      SELECT *
      FROM purchase_schema.purchase_order_payment_alert_config
      WHERE tenant_id = $1
      LIMIT 1
    `,

    upsertConfig: `
      SELECT purchase_schema.initialize_payment_alert_config(
        $1, $2, $3, $4, $5
      ) AS payment_alert_config_id
    `,

    generate: `
      SELECT purchase_schema.generate_payment_alerts()
    `,

    getStatsByTenant: `
      SELECT *
      FROM purchase_schema.get_payment_alert_stats($1)
    `,

    resolve: `
      SELECT purchase_schema.resolve_payment_alert($1::uuid)
    `,

    getTypes: `
      SELECT
        payment_alert_type_id,
        payment_alert_type_name,
        description
      FROM purchase_schema.purchase_order_payment_alert_type
      ORDER BY payment_alert_type_id ASC
    `,
  },

  catalog: {
    getOrderStatuses: `
      SELECT
        status_id,
        status_name,
        description
      FROM purchase_schema.purchase_order_status
      ORDER BY status_id ASC
    `,

    getPayableStatuses: `
      SELECT
        status_id,
        status_name,
        description
      FROM general_schema.account_payable_status
      ORDER BY status_id ASC
    `,

    getPaymentMethods: `
      SELECT
        payment_method_id,
        name,
        description
      FROM general_schema.payment_method
      WHERE name <> 'loyalty_points'
      ORDER BY payment_method_id ASC
    `,

    getCurrencies: `
      SELECT
        currency_id,
        currency_code,
        currency_name,
        symbol
      FROM general_schema.currency
      ORDER BY currency_id ASC
    `,

    // Tasa efectiva del tenant (base global + su diferencial), fuente unica
    // de verdad -- ver general_schema.get_effective_exchange_rate. Antes
    // leia exchange_rate directo, ignoraba el diferencial y hardcodeaba
    // to_currency_id = 1.
    getLatestExchangeRate: `
      SELECT base_rate, delta, effective_rate, base_at, delta_at
      FROM general_schema.get_effective_exchange_rate($1::uuid)
    `,
  },
};

export const purchaseQueries = createQueries(purchaseQueryDefs);
