export const reportingQueries = {
  // -------------------------------------------------------
  // 1. PROFITABILITY BY PRODUCT
  // -------------------------------------------------------
  // Uses sale_item.cost_price_at_sale (Phase 2) for accurate COGS per item

  profitabilityByProduct: `
    SELECT
      pv.product_variant_id,
      pv.sku,
      pv.variant_name,
      p.product_name,
      SUM(si.quantity) AS total_units_sold,
      SUM(si.total_price) AS total_revenue,
      SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity) AS total_cogs,
      SUM(si.total_price) - SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity) AS gross_profit,
      CASE
        WHEN SUM(si.total_price) > 0
        THEN ROUND(
          ((SUM(si.total_price) - SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity)) / SUM(si.total_price)) * 100,
          2
        )
        ELSE 0
      END AS gross_margin_pct,
      pv.weighted_avg_cost AS current_avg_cost,
      pv.unit_price AS current_sale_price
    FROM pos_schema.sale_item si
    INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
    INNER JOIN general_schema.product_variant pv
      ON pv.tenant_id = si.tenant_id AND pv.product_variant_id = si.product_variant_id
    LEFT JOIN general_schema.product p ON p.product_id = pv.product_id
    WHERE si.tenant_id = $1
      AND s.is_completed = TRUE
      AND s.sale_date >= $2
      AND s.sale_date <= $3
    GROUP BY pv.product_variant_id, pv.sku, pv.variant_name, p.product_name,
             pv.weighted_avg_cost, pv.unit_price, pv.tenant_id
    ORDER BY gross_profit DESC
  `,

  // -------------------------------------------------------
  // 2. PROFITABILITY BY SALE
  // -------------------------------------------------------

  profitabilityBySale: `
    SELECT
      s.sale_id,
      s.sale_date,
      s.subtotal_amount AS revenue,
      s.tax_amount,
      s.total_amount,
      s.sale_condition,
      COALESCE(cogs.total_cogs, 0) AS total_cogs,
      s.subtotal_amount - COALESCE(cogs.total_cogs, 0) AS gross_profit,
      CASE
        WHEN s.subtotal_amount > 0
        THEN ROUND(
          ((s.subtotal_amount - COALESCE(cogs.total_cogs, 0)) / s.subtotal_amount) * 100,
          2
        )
        ELSE 0
      END AS gross_margin_pct,
      u.email AS seller_email,
      COALESCE(e.first_name || ' ' || e.last_name, u.email) AS seller_name
    FROM pos_schema.sale s
    LEFT JOIN (
      SELECT
        si.sale_id,
        SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity) AS total_cogs
      FROM pos_schema.sale_item si
      GROUP BY si.sale_id
    ) cogs ON cogs.sale_id = s.sale_id
    LEFT JOIN general_schema.users u ON u.user_id = s.seller_user_id
    LEFT JOIN hr_schema.employee e ON e.user_id = s.seller_user_id
    WHERE s.branch_id IN (
      SELECT branch_id FROM general_schema.branch WHERE tenant_id = $1
    )
    AND s.is_completed = TRUE
    AND s.sale_date >= $2
    AND s.sale_date <= $3
    ORDER BY s.sale_date DESC
  `,

  // -------------------------------------------------------
  // 3. P&L — INCOME STATEMENT (Estado de Resultados)
  // -------------------------------------------------------
  // Reads confirmed journal entries grouped by account type/code

  incomeStatement: `
    WITH period_entries AS (
      SELECT
        jel.account_id,
        SUM(jel.debit_amount) AS total_debit,
        SUM(jel.credit_amount) AS total_credit
      FROM accounting_schema.journal_entry_line jel
      INNER JOIN accounting_schema.journal_entry je ON je.entry_id = jel.entry_id
      INNER JOIN accounting_schema.journal_entry_status jes ON jes.status_id = je.status_id
      WHERE je.tenant_id = $1
        AND je.entry_date >= $2
        AND je.entry_date <= $3
        AND jes.status_name = 'Confirmado'
      GROUP BY jel.account_id
    )
    SELECT
      coa.account_code,
      coa.account_name,
      at.type_name,
      at.nature,
      coa.parent_account_id,
      pcoa.account_code AS parent_code,
      pcoa.account_name AS parent_name,
      COALESCE(pe.total_debit, 0) AS total_debit,
      COALESCE(pe.total_credit, 0) AS total_credit,
      CASE
        WHEN at.nature = 'DEBIT'  THEN COALESCE(pe.total_debit, 0) - COALESCE(pe.total_credit, 0)
        WHEN at.nature = 'CREDIT' THEN COALESCE(pe.total_credit, 0) - COALESCE(pe.total_debit, 0)
        ELSE 0
      END AS balance
    FROM accounting_schema.chart_of_accounts coa
    INNER JOIN accounting_schema.account_type at ON at.account_type_id = coa.account_type_id
    LEFT JOIN accounting_schema.chart_of_accounts pcoa ON pcoa.account_id = coa.parent_account_id
    LEFT JOIN period_entries pe ON pe.account_id = coa.account_id
    WHERE coa.tenant_id = $1
      AND at.type_name IN ('Ingreso', 'Gasto', 'Costo')
    ORDER BY coa.account_code
  `,

  // -------------------------------------------------------
  // 4. EXPENSE SUMMARY (by category, fixed vs variable)
  // -------------------------------------------------------

  expenseSummaryByCategory: `
    SELECT
      ec.category_id,
      ec.name AS category_name,
      ec.account_code,
      ec.is_fixed,
      COUNT(e.expense_id) AS expense_count,
      COALESCE(SUM(e.amount), 0) AS subtotal,
      COALESCE(SUM(e.tax_amount), 0) AS total_tax,
      COALESCE(SUM(e.total_amount), 0) AS total_amount
    FROM accounting_schema.expense_category ec
    LEFT JOIN accounting_schema.expense e
      ON e.category_id = ec.category_id
      AND e.expense_date >= $2
      AND e.expense_date <= $3
    WHERE ec.tenant_id = $1
      AND ec.is_active = TRUE
    GROUP BY ec.category_id, ec.name, ec.account_code, ec.is_fixed
    ORDER BY total_amount DESC
  `,

  expenseSummaryFixedVsVariable: `
    SELECT
      ec.is_fixed,
      CASE WHEN ec.is_fixed THEN 'Fijo' ELSE 'Variable' END AS expense_type,
      COUNT(e.expense_id) AS expense_count,
      COALESCE(SUM(e.amount), 0) AS subtotal,
      COALESCE(SUM(e.tax_amount), 0) AS total_tax,
      COALESCE(SUM(e.total_amount), 0) AS total_amount
    FROM accounting_schema.expense_category ec
    LEFT JOIN accounting_schema.expense e
      ON e.category_id = ec.category_id
      AND e.expense_date >= $2
      AND e.expense_date <= $3
    WHERE ec.tenant_id = $1
      AND ec.is_active = TRUE
    GROUP BY ec.is_fixed
    ORDER BY ec.is_fixed DESC
  `,

  expenseMonthlyTrend: `
    SELECT
      DATE_TRUNC('month', e.expense_date) AS month,
      COALESCE(SUM(e.total_amount), 0) AS total_amount,
      COUNT(e.expense_id) AS expense_count
    FROM accounting_schema.expense e
    WHERE e.tenant_id = $1
      AND e.expense_date >= $2
      AND e.expense_date <= $3
    GROUP BY DATE_TRUNC('month', e.expense_date)
    ORDER BY month
  `,

  // -------------------------------------------------------
  // 5. SALES BY SELLER
  // -------------------------------------------------------

  salesBySeller: `
    SELECT
      s.seller_user_id,
      u.email AS seller_email,
      COALESCE(e.first_name || ' ' || e.last_name, u.email, 'Sin vendedor') AS seller_name,
      COUNT(s.sale_id) AS total_sales,
      SUM(s.subtotal_amount) AS total_revenue,
      SUM(s.tax_amount) AS total_tax,
      SUM(s.total_amount) AS total_amount,
      COALESCE(SUM(cogs.total_cogs), 0) AS total_cogs,
      SUM(s.subtotal_amount) - COALESCE(SUM(cogs.total_cogs), 0) AS gross_profit,
      CASE
        WHEN SUM(s.subtotal_amount) > 0
        THEN ROUND(
          ((SUM(s.subtotal_amount) - COALESCE(SUM(cogs.total_cogs), 0)) / SUM(s.subtotal_amount)) * 100,
          2
        )
        ELSE 0
      END AS gross_margin_pct,
      ROUND(SUM(s.total_amount) / NULLIF(COUNT(s.sale_id), 0), 2) AS avg_ticket
    FROM pos_schema.sale s
    LEFT JOIN (
      SELECT
        si.sale_id,
        SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity) AS total_cogs
      FROM pos_schema.sale_item si
      GROUP BY si.sale_id
    ) cogs ON cogs.sale_id = s.sale_id
    LEFT JOIN general_schema.users u ON u.user_id = s.seller_user_id
    LEFT JOIN hr_schema.employee e ON e.user_id = s.seller_user_id
    WHERE s.branch_id IN (
      SELECT branch_id FROM general_schema.branch WHERE tenant_id = $1
    )
    AND s.is_completed = TRUE
    AND s.sale_date >= $2
    AND s.sale_date <= $3
    GROUP BY s.seller_user_id, u.email, e.first_name, e.last_name
    ORDER BY total_revenue DESC
  `,

  // -------------------------------------------------------
  // 6. FINANCIAL KPIs / DASHBOARD
  // -------------------------------------------------------

  financialKpis: `
    WITH
    sales_data AS (
      SELECT
        COALESCE(SUM(s.subtotal_amount), 0) AS total_revenue,
        COALESCE(SUM(s.tax_amount), 0) AS total_tax_collected,
        COALESCE(SUM(s.total_amount), 0) AS total_sales_amount,
        COUNT(s.sale_id) AS total_sales_count
      FROM pos_schema.sale s
      WHERE s.branch_id IN (
        SELECT branch_id FROM general_schema.branch WHERE tenant_id = $1
      )
      AND s.is_completed = TRUE
      AND s.sale_date >= $2
      AND s.sale_date <= $3
    ),
    cogs_data AS (
      SELECT
        COALESCE(SUM(si.cost_price_at_sale * si.quantity), 0) AS total_cogs
      FROM pos_schema.sale_item si
      INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
      WHERE si.tenant_id = $1
        AND s.is_completed = TRUE
        AND s.sale_date >= $2
        AND s.sale_date <= $3
    ),
    expense_data AS (
      SELECT
        COALESCE(SUM(e.total_amount), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN ec.is_fixed THEN e.total_amount ELSE 0 END), 0) AS fixed_expenses,
        COALESCE(SUM(CASE WHEN NOT ec.is_fixed THEN e.total_amount ELSE 0 END), 0) AS variable_expenses
      FROM accounting_schema.expense e
      INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
      WHERE e.tenant_id = $1
        AND e.expense_date >= $2
        AND e.expense_date <= $3
    ),
    payroll_data AS (
      SELECT
        COALESCE(SUM(p.net_total), 0) AS total_payroll
      FROM hr_schema.paysheet p
      WHERE p.tenant_id = $1
        AND p.status_id = 2
        AND p.payment_date >= $2
        AND p.payment_date <= $3
    )
    SELECT
      sd.total_revenue,
      sd.total_tax_collected,
      sd.total_sales_amount,
      sd.total_sales_count,
      cd.total_cogs,
      sd.total_revenue - cd.total_cogs AS gross_profit,
      CASE
        WHEN sd.total_revenue > 0
        THEN ROUND(((sd.total_revenue - cd.total_cogs) / sd.total_revenue) * 100, 2)
        ELSE 0
      END AS gross_margin_pct,
      ed.total_expenses,
      ed.fixed_expenses,
      ed.variable_expenses,
      pd.total_payroll,
      ed.total_expenses + pd.total_payroll AS total_operating_expenses,
      sd.total_revenue - cd.total_cogs - ed.total_expenses - pd.total_payroll AS net_operating_income,
      CASE
        WHEN sd.total_revenue > 0
        THEN ROUND(((sd.total_revenue - cd.total_cogs - ed.total_expenses - pd.total_payroll) / sd.total_revenue) * 100, 2)
        ELSE 0
      END AS operating_margin_pct,
      CASE
        WHEN sd.total_sales_count > 0
        THEN ROUND(sd.total_sales_amount / sd.total_sales_count, 2)
        ELSE 0
      END AS avg_ticket
    FROM sales_data sd, cogs_data cd, expense_data ed, payroll_data pd
  `,

  // -------------------------------------------------------
  // 7. BALANCE GENERAL (Trial Balance / Balance de Comprobación)
  // -------------------------------------------------------

  trialBalance: `
    WITH period_entries AS (
      SELECT
        jel.account_id,
        SUM(jel.debit_amount) AS total_debit,
        SUM(jel.credit_amount) AS total_credit
      FROM accounting_schema.journal_entry_line jel
      INNER JOIN accounting_schema.journal_entry je ON je.entry_id = jel.entry_id
      INNER JOIN accounting_schema.journal_entry_status jes ON jes.status_id = je.status_id
      WHERE je.tenant_id = $1
        AND je.entry_date >= $2
        AND je.entry_date <= $3
        AND jes.status_name = 'Confirmado'
      GROUP BY jel.account_id
    )
    SELECT
      coa.account_code,
      coa.account_name,
      at.type_name,
      at.nature,
      coa.allows_transactions,
      COALESCE(pe.total_debit, 0) AS total_debit,
      COALESCE(pe.total_credit, 0) AS total_credit,
      CASE
        WHEN at.nature = 'DEBIT'  THEN COALESCE(pe.total_debit, 0) - COALESCE(pe.total_credit, 0)
        WHEN at.nature = 'CREDIT' THEN COALESCE(pe.total_credit, 0) - COALESCE(pe.total_debit, 0)
        ELSE 0
      END AS balance
    FROM accounting_schema.chart_of_accounts coa
    INNER JOIN accounting_schema.account_type at ON at.account_type_id = coa.account_type_id
    LEFT JOIN period_entries pe ON pe.account_id = coa.account_id
    WHERE coa.tenant_id = $1
      AND (pe.total_debit > 0 OR pe.total_credit > 0)
    ORDER BY coa.account_code
  `,
};
