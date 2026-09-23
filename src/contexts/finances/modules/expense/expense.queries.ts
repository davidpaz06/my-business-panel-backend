export const expenseQueries = {
  // -------------------------------------------------------
  // EXPENSE CATEGORIES
  // -------------------------------------------------------

  getCategoriesByTenant: `
    SELECT
      ec.category_id,
      ec.tenant_id,
      ec.name,
      ec.account_code,
      ec.parent_category_id,
      ec.is_fixed,
      ec.is_active,
      ec.created_at,
      ec.updated_at
    FROM accounting_schema.expense_category ec
    WHERE ec.tenant_id = $1
    ORDER BY ec.account_code
  `,

  searchCategoriesByTenant: `
    SELECT
      ec.category_id,
      ec.tenant_id,
      ec.name,
      ec.account_code,
      ec.parent_category_id,
      ec.is_fixed,
      ec.is_active,
      ec.created_at,
      ec.updated_at
    FROM accounting_schema.expense_category ec
    WHERE ec.tenant_id = $1
      AND ec.is_active = TRUE
      AND ($2::text IS NULL OR ec.name ILIKE '%' || $2 || '%')
    ORDER BY ec.account_code
    LIMIT 50
  `,

  getCategoryById: `
    SELECT *
    FROM accounting_schema.expense_category
    WHERE category_id = $1 AND tenant_id = $2
    LIMIT 1
  `,

  createCategory: `
    INSERT INTO accounting_schema.expense_category
      (tenant_id, name, account_code, parent_category_id, is_fixed)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING category_id
  `,

  updateCategory: `
    UPDATE accounting_schema.expense_category
    SET
      name = COALESCE($3, name),
      account_code = COALESCE($4, account_code),
      is_fixed = COALESCE($5, is_fixed),
      is_active = COALESCE($6, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE category_id = $1 AND tenant_id = $2
    RETURNING category_id
  `,

  provisionTenantExpenseCategories: `
    INSERT INTO accounting_schema.expense_category (tenant_id, name, account_code, is_fixed)
    SELECT $1, t.name, t.account_code, t.is_fixed
    FROM accounting_schema.expense_category_template t
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting_schema.expense_category ec
      WHERE ec.tenant_id = $1 AND ec.name = t.name
    )
    RETURNING category_id
  `,

  // -------------------------------------------------------
  // EXPENSES
  // -------------------------------------------------------

  getExpensesByTenant: `
    SELECT
      e.expense_id,
      e.tenant_id,
      e.branch_id,
      e.category_id,
      ec.name AS category_name,
      ec.account_code,
      e.description,
      e.amount,
      e.tax_amount,
      e.total_amount,
      e.currency_id,
      e.expense_date,
      e.payment_method,
      e.reference_number,
      e.notes,
      e.created_by,
      e.created_at,
      e.updated_at
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1
    ORDER BY e.expense_date DESC, e.created_at DESC
  `,

  getExpensesByBranch: `
    SELECT
      e.expense_id,
      e.tenant_id,
      e.branch_id,
      e.category_id,
      ec.name AS category_name,
      ec.account_code,
      e.description,
      e.amount,
      e.tax_amount,
      e.total_amount,
      e.currency_id,
      e.expense_date,
      e.payment_method,
      e.reference_number,
      e.notes,
      e.created_by,
      e.created_at,
      e.updated_at
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1 AND e.branch_id = $2
    ORDER BY e.expense_date DESC, e.created_at DESC
  `,

  getExpenseById: `
    SELECT
      e.expense_id,
      e.tenant_id,
      e.branch_id,
      e.category_id,
      ec.name AS category_name,
      ec.account_code,
      e.description,
      e.amount,
      e.tax_amount,
      e.total_amount,
      e.currency_id,
      e.expense_date,
      e.payment_method,
      e.reference_number,
      e.notes,
      e.created_by,
      e.created_at,
      e.updated_at
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.expense_id = $1 AND e.tenant_id = $2
    LIMIT 1
  `,

  createExpense: `
    INSERT INTO accounting_schema.expense
      (tenant_id, branch_id, category_id, description, amount, tax_amount, total_amount,
       currency_id, expense_date, payment_method, reference_number, notes, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING expense_id
  `,

  // Historial paginado, filtrable por sucursal y rango de fechas.
  // $1 = tenant_id, $2 = branch_id (uuid|null), $3 = start (date|null),
  // $4 = end (date|null), $5 = limit, $6 = offset
  getExpensesPaginated: `
    SELECT
      e.expense_id,
      e.tenant_id,
      e.branch_id,
      b.branch_name,
      e.category_id,
      ec.name AS category_name,
      ec.account_code,
      ec.is_fixed,
      e.description,
      e.amount,
      e.tax_amount,
      e.total_amount,
      e.currency_id,
      e.expense_date,
      e.payment_method,
      e.reference_number,
      e.notes,
      e.created_by,
      u.email AS created_by_email,
      e.created_at,
      e.updated_at
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    INNER JOIN general_schema.branch b ON b.branch_id = e.branch_id
    LEFT JOIN general_schema.users u ON u.user_id = e.created_by
    WHERE e.tenant_id = $1
      AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
      AND ($3::date IS NULL OR e.expense_date >= $3::date)
      AND ($4::date IS NULL OR e.expense_date <= $4::date)
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT $5 OFFSET $6
  `,

  countExpensesPaginated: `
    SELECT COUNT(*)::int AS total
    FROM accounting_schema.expense e
    WHERE e.tenant_id = $1
      AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
      AND ($3::date IS NULL OR e.expense_date >= $3::date)
      AND ($4::date IS NULL OR e.expense_date <= $4::date)
  `,

  getExpensesByDateRange: `
    SELECT
      e.expense_id,
      e.tenant_id,
      e.branch_id,
      e.category_id,
      ec.name AS category_name,
      ec.account_code,
      e.description,
      e.amount,
      e.tax_amount,
      e.total_amount,
      e.currency_id,
      e.expense_date,
      e.payment_method,
      e.reference_number,
      e.notes,
      e.created_by,
      e.created_at,
      e.updated_at
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1 AND e.expense_date BETWEEN $2 AND $3
    ORDER BY e.expense_date DESC
  `,

  // -------------------------------------------------------
  // ANALYTICS
  // -------------------------------------------------------

  analyticsFixedVsVariable: `
    SELECT
      ec.is_fixed,
      CASE WHEN ec.is_fixed THEN 'Fijo' ELSE 'Variable' END AS expense_type,
      COALESCE(SUM(e.total_amount), 0)::text AS total_amount
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1
      AND e.expense_date BETWEEN $2::date AND $3::date
    GROUP BY ec.is_fixed
  `,

  analyticsFixedBreakdown: `
    SELECT
      ec.category_id,
      ec.name AS category_name,
      ec.account_code,
      COALESCE(SUM(e.total_amount), 0)::text AS total_amount
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1
      AND ec.is_fixed = TRUE
      AND e.expense_date BETWEEN $2::date AND $3::date
    GROUP BY ec.category_id, ec.name, ec.account_code
    ORDER BY SUM(e.total_amount) DESC
  `,

  analyticsVariableBreakdown: `
    SELECT
      ec.category_id,
      ec.name AS category_name,
      ec.account_code,
      COALESCE(SUM(e.total_amount), 0)::text AS total_amount
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    WHERE e.tenant_id = $1
      AND ec.is_fixed = FALSE
      AND e.expense_date BETWEEN $2::date AND $3::date
    GROUP BY ec.category_id, ec.name, ec.account_code
    ORDER BY SUM(e.total_amount) DESC
  `,

  analyticsSalesVsExpenses: `
    WITH daily_sales AS (
      SELECT
        DATE(s.sale_date) AS period,
        COALESCE(SUM(si.total_price), 0) AS total_sales
      FROM pos_schema.sale s
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      INNER JOIN pos_schema.sale_item si ON si.sale_id = s.sale_id
      WHERE b.tenant_id = $1
        AND s.is_completed = TRUE
        AND s.sale_date::date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      GROUP BY DATE(s.sale_date)
    ),
    daily_expenses AS (
      SELECT
        DATE(e.expense_date) AS period,
        COALESCE(SUM(e.total_amount), 0) AS total_expenses
      FROM accounting_schema.expense e
      WHERE e.tenant_id = $1
        AND e.expense_date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
      GROUP BY DATE(e.expense_date)
    )
    SELECT
      COALESCE(s.period, ex.period)::text AS period,
      COALESCE(s.total_sales, 0)::text AS total_sales,
      COALESCE(ex.total_expenses, 0)::text AS total_expenses
    FROM daily_sales s
    FULL OUTER JOIN daily_expenses ex ON s.period = ex.period
    ORDER BY period
  `,

  // -------------------------------------------------------
  // FISCAL PERIODS
  // -------------------------------------------------------

  getFiscalPeriodsByTenant: `
    SELECT * FROM accounting_schema.fiscal_period
    WHERE tenant_id = $1
    ORDER BY start_date DESC
  `,

  getFiscalPeriodById: `
    SELECT * FROM accounting_schema.fiscal_period
    WHERE period_id = $1 AND tenant_id = $2
    LIMIT 1
  `,

  createFiscalPeriod: `
    INSERT INTO accounting_schema.fiscal_period
      (tenant_id, name, start_date, end_date)
    VALUES ($1, $2, $3, $4)
    RETURNING period_id
  `,

  closeFiscalPeriod: `
    UPDATE accounting_schema.fiscal_period
    SET is_closed = TRUE, closed_at = CURRENT_TIMESTAMP
    WHERE period_id = $1 AND tenant_id = $2 AND is_closed = FALSE
    RETURNING period_id
  `,

  // -------------------------------------------------------
  // ANALYTICS
  // -------------------------------------------------------

  getFixedVsVariableSummary: `
    WITH accounting_totals AS (
      SELECT
        ec.is_fixed,
        COALESCE(SUM(e.total_amount), 0) AS subtotal
      FROM accounting_schema.expense_category ec
      LEFT JOIN accounting_schema.expense e
        ON  e.category_id = ec.category_id
        AND e.tenant_id   = $1
        AND e.expense_date >= $2::date
        AND e.expense_date <= $3::date
      WHERE ec.tenant_id = $1
        AND ec.is_active  = TRUE
      GROUP BY ec.is_fixed
    ),
    pos_totals AS (
      SELECT
        FALSE                               AS is_fixed,
        COALESCE(SUM(pe.expense_amount), 0) AS subtotal
      FROM pos_schema.expense pe
      INNER JOIN general_schema.branch b ON b.branch_id = pe.branch_id
      WHERE b.tenant_id       = $1
        AND pe.status         = 'approved'
        AND pe.created_at::date >= $2::date
        AND pe.created_at::date <= $3::date
    )
    SELECT
      is_fixed,
      CASE WHEN is_fixed THEN 'Fijo' ELSE 'Variable' END AS expense_type,
      SUM(subtotal)::text AS total_amount
    FROM (
      SELECT * FROM accounting_totals
      UNION ALL
      SELECT * FROM pos_totals
    ) combined
    GROUP BY is_fixed
    ORDER BY is_fixed DESC
  `,

  getFixedCategoryBreakdown: `
    SELECT
      ec.category_id::text,
      ec.name           AS category_name,
      ec.account_code,
      COALESCE(SUM(e.total_amount), 0)::text AS total_amount
    FROM accounting_schema.expense_category ec
    LEFT JOIN accounting_schema.expense e
      ON  e.category_id = ec.category_id
      AND e.tenant_id   = $1
      AND e.expense_date >= $2::date
      AND e.expense_date <= $3::date
    WHERE ec.tenant_id = $1
      AND ec.is_active  = TRUE
      AND ec.is_fixed   = TRUE
    GROUP BY ec.category_id, ec.name, ec.account_code
    ORDER BY SUM(e.total_amount) DESC NULLS LAST
  `,

  getVariableCategoryBreakdown: `
    WITH accounting_var AS (
      SELECT
        ec.category_id::text AS category_id,
        ec.name              AS category_name,
        ec.account_code,
        COALESCE(SUM(e.total_amount), 0) AS subtotal
      FROM accounting_schema.expense_category ec
      LEFT JOIN accounting_schema.expense e
        ON  e.category_id = ec.category_id
        AND e.tenant_id   = $1
        AND e.expense_date >= $2::date
        AND e.expense_date <= $3::date
      WHERE ec.tenant_id = $1
        AND ec.is_active  = TRUE
        AND ec.is_fixed   = FALSE
      GROUP BY ec.category_id, ec.name, ec.account_code
    ),
    pos_var AS (
      SELECT
        et.expense_type_id::text  AS category_id,
        et.expense_type_name      AS category_name,
        'POS'                     AS account_code,
        COALESCE(SUM(pe.expense_amount), 0) AS subtotal
      FROM pos_schema.expense pe
      INNER JOIN pos_schema.expense_type et ON et.expense_type_id = pe.expense_type_id
      INNER JOIN general_schema.branch   b  ON b.branch_id        = pe.branch_id
      WHERE b.tenant_id       = $1
        AND pe.status         = 'approved'
        AND pe.created_at::date >= $2::date
        AND pe.created_at::date <= $3::date
      GROUP BY et.expense_type_id, et.expense_type_name
    )
    SELECT
      category_id,
      category_name,
      account_code,
      SUM(subtotal)::text AS total_amount
    FROM (
      SELECT * FROM accounting_var
      UNION ALL
      SELECT * FROM pos_var
    ) combined
    GROUP BY category_id, category_name, account_code
    ORDER BY SUM(subtotal) DESC NULLS LAST
  `,

  getSalesVsExpenses: `
    -- Tasa efectiva del tenant (base + su diferencial). Antes esto buscaba
    -- currency_code = 'CRC' -- moneda que dejo de existir en la migracion a
    -- Venezuela -- por lo que latest_rates quedaba vacio y las ventas en USD
    -- se sumaban como si 1 USD = 1 Bs. contra gastos en Bs.
    latest_rates AS (
      SELECT effective_rate AS rate
      FROM general_schema.get_effective_exchange_rate($1::uuid)
    ),
    ves_currency AS (
      SELECT currency_id FROM general_schema.currency WHERE currency_code = 'VES' LIMIT 1
    ),
    sales_agg AS (
      SELECT
        DATE_TRUNC('{{GRANULARITY}}', s.sale_date)::text AS period,
        COALESCE(SUM(
          CASE
            WHEN s.currency_id = (SELECT currency_id FROM ves_currency)
              THEN s.total_amount
            ELSE s.total_amount * COALESCE((SELECT lr.rate FROM latest_rates lr), 1)
          END
        ), 0) AS total_sales
      FROM pos_schema.sale s
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      WHERE b.tenant_id       = $1
        AND s.is_completed    = TRUE
        AND s.is_refunded     = FALSE
        AND s.sale_date::date >= $2::date
        AND s.sale_date::date <= $3::date
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
      GROUP BY DATE_TRUNC('{{GRANULARITY}}', s.sale_date)
    ),
    expense_agg AS (
      SELECT
        DATE_TRUNC('{{GRANULARITY}}', e.expense_date::timestamptz)::text AS period,
        COALESCE(SUM(e.total_amount), 0) AS total_expenses
      FROM accounting_schema.expense e
      WHERE e.tenant_id      = $1
        AND e.expense_date  >= $2::date
        AND e.expense_date  <= $3::date
        AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
      GROUP BY DATE_TRUNC('{{GRANULARITY}}', e.expense_date::timestamptz)
    )
    SELECT
      COALESCE(s.period, ea.period)        AS period,
      COALESCE(s.total_sales,    0)::text  AS total_sales,
      COALESCE(ea.total_expenses, 0)::text AS total_expenses
    FROM sales_agg s
    FULL OUTER JOIN expense_agg ea ON ea.period = s.period
    ORDER BY period
  `,
};
