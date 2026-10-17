import {
  dateNoonUtc,
  rateAt,
  sumBoth,
  toUsd,
  toVes,
} from '@/contexts/finances/finances.fx';
import {
  localTs,
  timestampInLocalDays,
} from '@/contexts/finances/finances.time';
import {
  accruedSaleFilter,
  netNoteAmount,
  netReturnAmount,
  netSaleAmount,
  noteCurrency,
  saleItemJoins,
} from '@/contexts/finances/finances.sales';

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

  // Los analiticos devuelven cada monto en USD y VES (<campo>_usd /
  // <campo>_ves), convertido con la tasa vigente en la fecha del gasto o de la
  // venta (FNZ-X-02). expense_date es date: tasa del mediodia local de ese dia.
  analyticsFixedVsVariable: `
    SELECT
      ec.is_fixed,
      CASE WHEN ec.is_fixed THEN 'Fijo' ELSE 'Variable' END AS expense_type,
      ${sumBoth('total', 'e.total_amount', 'e.currency_id', 'fx.rate')}
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
    WHERE e.tenant_id = $1
      AND e.expense_date BETWEEN $2::date AND $3::date
      AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
    GROUP BY ec.is_fixed
  `,

  analyticsFixedBreakdown: `
    SELECT
      ec.category_id,
      ec.name AS category_name,
      ec.account_code,
      ${sumBoth('total', 'e.total_amount', 'e.currency_id', 'fx.rate')}
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
    WHERE e.tenant_id = $1
      AND ec.is_fixed = TRUE
      AND e.expense_date BETWEEN $2::date AND $3::date
      AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
    GROUP BY ec.category_id, ec.name, ec.account_code
    ORDER BY 4 DESC
  `,

  analyticsVariableBreakdown: `
    SELECT
      ec.category_id,
      ec.name AS category_name,
      ec.account_code,
      ${sumBoth('total', 'e.total_amount', 'e.currency_id', 'fx.rate')}
    FROM accounting_schema.expense e
    INNER JOIN accounting_schema.expense_category ec ON ec.category_id = e.category_id
    CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
    WHERE e.tenant_id = $1
      AND ec.is_fixed = FALSE
      AND e.expense_date BETWEEN $2::date AND $3::date
      AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
    GROUP BY ec.category_id, ec.name, ec.account_code
    ORDER BY 4 DESC
  `,

  // Una fila por periodo (dia local): ventas netas y gastos en USD y VES, cada
  // movimiento convertido con la tasa de su fecha. Las ventas van sin IVA, con
  // criterio devengado y netas de devoluciones y notas de credito/debito, igual
  // que Rentabilidad (finances.sales.ts; FNZ-GA-03). Los gastos se suman con su
  // total (el IVA de un gasto es credito fiscal, pero se paga igual).
  analyticsSalesVsExpenses: `
    SELECT
      period,
      COALESCE(SUM(sales_usd), 0)::text    AS total_sales_usd,
      COALESCE(SUM(sales_ves), 0)::text    AS total_sales_ves,
      COALESCE(SUM(expenses_usd), 0)::text AS total_expenses_usd,
      COALESCE(SUM(expenses_ves), 0)::text AS total_expenses_ves
    FROM (
      SELECT
        (${localTs('s.sale_date')})::date::text AS period,
        ${toUsd(netSaleAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')} AS sales_usd,
        ${toVes(netSaleAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')} AS sales_ves,
        0::numeric AS expenses_usd,
        0::numeric AS expenses_ves
      FROM pos_schema.sale s
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      INNER JOIN pos_schema.sale_item si ON si.sale_id = s.sale_id
      ${saleItemJoins}
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 's.sale_date')} AS rate) fx
      WHERE b.tenant_id = $1
        AND ${accruedSaleFilter}
        AND ${timestampInLocalDays('s.sale_date', '$2', '$3')}
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)

      UNION ALL

      -- Devoluciones: restan ventas en la fecha de la devolucion.
      SELECT
        (${localTs('rt.return_date')})::date::text AS period,
        -${toUsd(netReturnAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')} AS sales_usd,
        -${toVes(netReturnAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')} AS sales_ves,
        0::numeric AS expenses_usd,
        0::numeric AS expenses_ves
      FROM pos_schema.return_product rp
      INNER JOIN pos_schema.return_transaction rt
        ON rt.return_transaction_id = rp.return_transaction_id
      INNER JOIN pos_schema.sale_item si ON si.sale_item_id = rp.sale_item_id
      INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      ${saleItemJoins}
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'rt.return_date')} AS rate) fx
      WHERE b.tenant_id = $1
        AND ${timestampInLocalDays('rt.return_date', '$2', '$3')}
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)

      UNION ALL

      -- Notas de credito (restan) y debito (suman), activas.
      SELECT
        (${localTs('cdn.created_at')})::date::text AS period,
        ${toUsd(netNoteAmount, noteCurrency, 'fx.rate')} AS sales_usd,
        ${toVes(netNoteAmount, noteCurrency, 'fx.rate')} AS sales_ves,
        0::numeric AS expenses_usd,
        0::numeric AS expenses_ves
      FROM pos_schema.credit_debit_note cdn
      INNER JOIN pos_schema.invoice inv ON inv.invoice_id = cdn.invoice_id
      INNER JOIN pos_schema.sale s ON s.sale_id = inv.sale_id
      INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'cdn.created_at')} AS rate) fx
      WHERE b.tenant_id = $1
        AND cdn.tenant_id = $1
        AND cdn.is_voided = FALSE
        AND ${timestampInLocalDays('cdn.created_at', '$2', '$3')}
        AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)

      UNION ALL

      SELECT
        DATE(e.expense_date)::text AS period,
        0::numeric AS sales_usd,
        0::numeric AS sales_ves,
        ${toUsd('e.total_amount', 'e.currency_id', 'fx.rate')} AS expenses_usd,
        ${toVes('e.total_amount', 'e.currency_id', 'fx.rate')} AS expenses_ves
      FROM accounting_schema.expense e
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
      WHERE e.tenant_id = $1
        AND e.expense_date BETWEEN $2::date AND $3::date
        AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
    ) combined
    GROUP BY period
    ORDER BY period
  `,

  // Nomina del rango: planillas cerradas (Completed) cuya fecha de pago cae en
  // los dias locales [$2, $3], con filtro opcional de sucursal ($4). Devuelve
  // el costo (total devengado; el neto si el devengado quedo en 0) y el neto
  // pagado, en USD y VES con la tasa del dia de pago. La nomina se liquida en
  // bolivares (currency_id 1).
  analyticsPayroll: `
    SELECT
      COUNT(*)::int AS paysheet_count,
      ${sumBoth('gross_total', 'COALESCE(NULLIF(ps.total_earnings, 0), ps.net_total)', '1', 'fx.rate')},
      ${sumBoth('net_total', 'ps.net_total', '1', 'fx.rate')}
    FROM hr_schema.paysheet ps
    INNER JOIN hr_schema.paysheet_status pst
      ON pst.status_id = ps.status_id
    CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'ps.payment_date')} AS rate) fx
    WHERE ps.tenant_id = $1
      AND pst.status_description = 'Completed'
      AND ps.payment_date IS NOT NULL
      AND ${timestampInLocalDays('ps.payment_date', '$2', '$3')}
      AND ($4::uuid IS NULL OR ps.branch_id = $4::uuid)
  `,

  // -------------------------------------------------------
  // FISCAL PERIODS
  // -------------------------------------------------------

  getFiscalPeriodsByTenant: `
    SELECT * FROM accounting_schema.fiscal_period
    WHERE tenant_id = $1
    ORDER BY start_date DESC
  `,

  // Periodo fiscal cerrado que contiene una fecha (FNZ-GA-09).
  getClosedPeriodForDate: `
    SELECT period_id, name
    FROM accounting_schema.fiscal_period
    WHERE tenant_id = $1
      AND is_closed = TRUE
      AND $2::date BETWEEN start_date AND end_date
    LIMIT 1
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
};
