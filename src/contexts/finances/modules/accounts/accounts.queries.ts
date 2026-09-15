export const apOverviewSelect = `
  SELECT
    pap.purchase_account_payable_id,
    pap.purchase_order_id,
    pap.account_payable_status,
    aps.status_name                                                         AS account_payable_status_name,
    s.supplier_name,
    ap.due_date,
    ap.subtotal,
    COALESCE(pap.tax_amount, 0)                                             AS tax_amount,
    (ap.subtotal + COALESCE(pap.tax_amount, 0))                             AS total_amount,
    ap.amount_paid,
    GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS balance_due,
    ap.is_paid,
    COALESCE(payments.payment_count, 0)                                     AS payment_count,
    payments.last_payment_date,
    pap.created_at,
    b.tenant_id,
    t.tenant_name
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
  LEFT JOIN general_schema.account_payable_status aps
    ON aps.status_id = pap.account_payable_status
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int       AS payment_count,
      MAX(pop.payment_date) AS last_payment_date
    FROM purchase_schema.purchase_order_payment pop
    WHERE pop.purchase_account_payable_id = pap.purchase_account_payable_id
  ) payments ON TRUE
`;

export const arGroupByClause = `
  GROUP BY
    sar.sale_account_receivable_id, sar.sale_id, sar.account_receivable_status,
    ars.status_name, ar.account_receivable_id, ar.tenant_id, ar.tenant_customer_id,
    tc.first_name, tc.last_name, tc.document_number,
    dsi.invoice_id,
    ar.due_date, ar.subtotal, sar.tax_amount, ar.amount_paid, ar.is_paid,
    sar.created_at
`;

export const arOverviewSelect = `
  SELECT
    sar.sale_account_receivable_id,
    sar.sale_id,
    sar.account_receivable_status,
    ars.status_name                                                           AS account_receivable_status_name,
    ar.tenant_id,
    (tc.first_name || ' ' || tc.last_name)                                   AS customer_name,
    tc.document_number                                                        AS customer_document,
    dsi.invoice_id AS digital_sale_invoice_id,
    ar.due_date,
    ar.subtotal,
    COALESCE(sar.tax_amount, 0)                                               AS tax_amount,
    (ar.subtotal + COALESCE(sar.tax_amount, 0))                               AS total_amount,
    ar.amount_paid,
    GREATEST((ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid, 0) AS balance_due,
    ar.is_paid,
    COUNT(sc.sale_collection_id)::INTEGER                                     AS collection_count,
    MAX(sc.payment_date)                                                      AS last_collection_date,
    sar.created_at
  FROM pos_schema.sale_account_receivable sar
  JOIN general_schema.account_receivable ar
    ON ar.account_receivable_id = sar.account_receivable_id
  JOIN pos_schema.sale sale_b
    ON sale_b.sale_id = sar.sale_id
  LEFT JOIN general_schema.account_receivable_status ars
    ON ars.status_id = sar.account_receivable_status
  LEFT JOIN general_schema.tenant_customer tc
    ON tc.tenant_customer_id = ar.tenant_customer_id
  LEFT JOIN pos_schema.sale_collection sc
    ON sc.sale_account_receivable_id = sar.sale_account_receivable_id
  LEFT JOIN pos_schema.invoice dsi
    ON dsi.sale_id = sar.sale_id
`;

export const accountsOverviewQueries = {
  ap: {
    getByTenant: `
      ${apOverviewSelect}
      WHERE b.tenant_id = $1
        AND ap.is_paid = false
      ORDER BY ap.due_date DESC, pap.created_at DESC
    `,

    getGlobal: `
      ${apOverviewSelect}
      WHERE ap.is_paid = false
      ORDER BY ap.due_date DESC, pap.created_at DESC
    `,
  },

  ar: {
    getByTenant: `
      ${arOverviewSelect}
      WHERE ar.tenant_id = $1
        AND ar.is_paid = false
      GROUP BY
        sar.sale_account_receivable_id, sar.sale_id, sar.account_receivable_status,
        ars.status_name, ar.account_receivable_id, ar.tenant_id, ar.tenant_customer_id,
        tc.first_name, tc.last_name, tc.document_number,
        dsi.invoice_id,
        ar.due_date, ar.subtotal, sar.tax_amount, ar.amount_paid, ar.is_paid,
        sar.created_at
      ORDER BY ar.due_date DESC, sar.created_at DESC
    `,

    getGlobal: `
      ${arOverviewSelect}
      WHERE ar.is_paid = false
      GROUP BY
        sar.sale_account_receivable_id, sar.sale_id, sar.account_receivable_status,
        ars.status_name, ar.account_receivable_id, ar.tenant_id, ar.tenant_customer_id,
        tc.first_name, tc.last_name, tc.document_number,
        dsi.invoice_id,
        ar.due_date, ar.subtotal, sar.tax_amount, ar.amount_paid, ar.is_paid,
        sar.created_at
      ORDER BY ar.due_date DESC, sar.created_at DESC
    `,
  },

  payableDetail: {
    getPayments: `
      SELECT
        pop.purchase_order_payment_id,
        pop.purchase_account_payable_id,
        pop.payment_method_id,
        pm.name        AS payment_method_name,
        pop.amount_paid,
        pop.payment_reference,
        pop.notes,
        pop.payment_date,
        pop.created_at
      FROM purchase_schema.purchase_order_payment pop
      LEFT JOIN general_schema.payment_method pm
        ON pm.payment_method_id = pop.payment_method_id
      WHERE pop.purchase_account_payable_id = $1
      ORDER BY pop.payment_date DESC, pop.created_at DESC
    `,

    getAccess: `
      SELECT pap.purchase_account_payable_id, b.tenant_id
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
  },

  receivableDetail: {
    getCollections: `
      SELECT
        sc.sale_collection_id,
        sc.sale_account_receivable_id,
        sc.payment_method_id,
        pm.name         AS payment_method_name,
        sc.amount_paid,
        sc.original_amount,
        sc.exchange_rate,
        sc.currency_id,
        sc.payment_reference,
        sc.notes,
        sc.payment_date,
        sc.created_at
      FROM pos_schema.sale_collection sc
      LEFT JOIN general_schema.payment_method pm
        ON pm.payment_method_id = sc.payment_method_id
      WHERE sc.sale_account_receivable_id = $1
      ORDER BY sc.payment_date DESC, sc.created_at DESC
    `,

    getAccess: `
      SELECT sar.sale_account_receivable_id, ar.tenant_id
      FROM pos_schema.sale_account_receivable sar
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      WHERE sar.sale_account_receivable_id = $1
      LIMIT 1
    `,
  },

  alertConfig: {
    getPayableConfig: `
      SELECT warning_days_before_due, urgent_days_before_due
      FROM purchase_schema.purchase_order_payment_alert_config
      WHERE tenant_id = $1
      LIMIT 1
    `,

    getReceivableConfig: `
      SELECT warning_days_before_due, urgent_days_before_due
      FROM pos_schema.sale_collection_alert_config
      WHERE tenant_id = $1
      LIMIT 1
    `,
  },
};
