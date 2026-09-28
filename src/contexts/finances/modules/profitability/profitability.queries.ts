// Consultas crudas para la Vista de Rentabilidad.
// El backend solo agrega componentes monetarios por sucursal + bucket de tiempo;
// las formulas de margen/utilidad se calculan en el frontend.
//
// Parametros comunes (sales / returns / expenses):
//   $1 = tenant_id (uuid)        -> aislamiento multi-tenant (la venta no tiene tenant_id,
//                                   se obtiene via general_schema.branch)
//   $2 = bucket_unit (text)      -> 'hour' | 'day' | 'week' | 'month' para date_trunc
//   $3 = range_start (timestamp) -> inicio del rango (now - intervalo)
//   $4 = branch_id (uuid|null)   -> filtro opcional por sucursal; NULL = todas

// Componentes de ventas, agrupados por (sucursal, bucket, moneda).
// net_sales = total_price (ya neto de descuento); discounts y cogs explicitos.
export const salesComponents = `
  SELECT
    b.branch_id,
    date_trunc($2, s.sale_date)                          AS bucket_start,
    COALESCE(s.currency_id, 1)                           AS currency_id,
    SUM(si.total_price)                                  AS net_sales,
    SUM(COALESCE(si.discount_applied, 0))                AS discounts,
    SUM(COALESCE(si.cost_price_at_sale, 0) * si.quantity) AS cogs
  FROM pos_schema.sale s
  INNER JOIN general_schema.branch b
    ON b.branch_id = s.branch_id
  INNER JOIN pos_schema.sale_item si
    ON si.sale_id = s.sale_id
  WHERE b.tenant_id = $1
    AND s.is_completed = TRUE
    AND s.sale_date >= $3
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
  GROUP BY b.branch_id, bucket_start, COALESCE(s.currency_id, 1)
`;

// Componentes de devoluciones, agrupados por (sucursal, bucket, moneda).
// El bucket se calcula con la fecha de la devolucion (return_date); el costo de lo
// devuelto se obtiene del sale_item original (cost_price_at_sale).
export const returnsComponents = `
  SELECT
    b.branch_id,
    date_trunc($2, rt.return_date)                       AS bucket_start,
    COALESCE(s.currency_id, 1)                           AS currency_id,
    SUM(rp.total_price)                                  AS returns,
    SUM(COALESCE(si.cost_price_at_sale, 0) * rp.quantity) AS returns_cogs
  FROM pos_schema.return_product rp
  INNER JOIN pos_schema.return_transaction rt
    ON rt.return_transaction_id = rp.return_transaction_id
  INNER JOIN pos_schema.sale_item si
    ON si.sale_item_id = rp.sale_item_id
  INNER JOIN pos_schema.sale s
    ON s.sale_id = si.sale_id
  INNER JOIN general_schema.branch b
    ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND rt.return_date >= $3
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
  GROUP BY b.branch_id, bucket_start, COALESCE(s.currency_id, 1)
`;

// Gastos operativos, agrupados por (sucursal, bucket, moneda). Fuente canonica:
// accounting_schema.expense (tenant_id propio, total_amount, expense_date, currency_id).
export const expenseComponents = `
  SELECT
    e.branch_id,
    date_trunc($2, e.expense_date)                       AS bucket_start,
    COALESCE(e.currency_id, 1)                           AS currency_id,
    SUM(e.total_amount)                                  AS amount
  FROM accounting_schema.expense e
  WHERE e.tenant_id = $1
    AND e.expense_date >= $3
    AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
  GROUP BY e.branch_id, bucket_start, COALESCE(e.currency_id, 1)
`;

// Desglose de gastos por categoria, agrupado por (sucursal, bucket, moneda, categoria).
// Complementa expenseComponents (que trae solo el total) para mostrar el detalle
// debajo de la grafica de rentabilidad. LEFT JOIN preserva gastos sin categoria
// asignada (category_name = NULL -> "Sin categoria" en el frontend).
export const expenseCategoryComponents = `
  SELECT
    e.branch_id,
    date_trunc($2, e.expense_date)                       AS bucket_start,
    COALESCE(e.currency_id, 1)                           AS currency_id,
    ec.category_id                                       AS category_id,
    ec.name                                               AS category_name,
    SUM(e.total_amount)                                  AS amount
  FROM accounting_schema.expense e
  LEFT JOIN accounting_schema.expense_category ec
    ON ec.category_id = e.category_id
  WHERE e.tenant_id = $1
    AND e.expense_date >= $3
    AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
  GROUP BY e.branch_id, bucket_start, COALESCE(e.currency_id, 1), ec.category_id, ec.name
`;

// Sucursales del tenant (para generar los N graficos aunque una sede no tenga ventas).
// $2 = branch_id (uuid|null) -> si se filtra por sucursal, solo se devuelve esa.
export const tenantBranches = `
  SELECT branch_id, branch_name
  FROM general_schema.branch
  WHERE tenant_id = $1
    AND ($2::uuid IS NULL OR branch_id = $2::uuid)
  ORDER BY branch_name
`;
