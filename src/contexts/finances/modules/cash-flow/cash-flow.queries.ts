// Consultas crudas para la Vista de Flujo de Caja.
// Consolida movimientos reales de efectivo desde pos, purchase, hr y accounting.
//
// Parametros comunes de movimientos historicos:
//   $1 = tenant_id   (uuid)
//   $2 = start_date  (timestamp)
//   $3 = end_date    (timestamp)

const movementsUnion = `
  -- 1. Cobros directos POS -> entrada / ventas
  SELECT
    cp.payment_date                       AS movement_date,
    cp.payment_amount                     AS amount,
    COALESCE(cp.currency_id, 1)           AS currency_id,
    'entrada'::text                       AS direction,
    'ventas'::text                        AS movement_type
  FROM pos_schema.customer_payment cp
  JOIN pos_schema.sale s ON s.sale_id = cp.sale_id
  JOIN general_schema.branch b ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND s.is_completed = TRUE
    AND cp.payment_date BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 2. Cobros de cuentas por cobrar -> entrada / cuentas_cobradas
  SELECT
    sc.payment_date                       AS movement_date,
    sc.amount_paid                        AS amount,
    1                                     AS currency_id,
    'entrada'::text                       AS direction,
    'cuentas_cobradas'::text              AS movement_type
  FROM pos_schema.sale_collection sc
  JOIN pos_schema.sale_account_receivable sar
    ON sar.sale_account_receivable_id = sc.sale_account_receivable_id
  JOIN general_schema.account_receivable ar
    ON ar.account_receivable_id = sar.account_receivable_id
  WHERE ar.tenant_id = $1
    AND sc.payment_date BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 3. Pagos a proveedores -> salida / pagos_proveedores
  SELECT
    pop.payment_date                      AS movement_date,
    pop.amount_paid                       AS amount,
    COALESCE(pop.currency_id, 1)          AS currency_id,
    'salida'::text                        AS direction,
    'pagos_proveedores'::text             AS movement_type
  FROM purchase_schema.purchase_order_payment pop
  JOIN purchase_schema.purchase_account_payable pap
    ON pap.purchase_account_payable_id = pop.purchase_account_payable_id
  JOIN purchase_schema.purchase_order po
    ON po.purchase_order_id = pap.purchase_order_id
  JOIN inventory_schema.warehouse w
    ON w.warehouse_id = po.warehouse_id
  JOIN general_schema.branch b
    ON b.branch_id = w.branch_id
  WHERE b.tenant_id = $1
    AND pop.payment_date BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 4. Nomina ejecutada -> salida / nomina
  SELECT
    pd.pay_date::timestamp                AS movement_date,
    pd.net_salary                         AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'nomina'::text                        AS movement_type
  FROM hr_schema.paysheet_detail pd
  JOIN hr_schema.paysheet ps ON ps.paysheet_id = pd.paysheet_id
  WHERE ps.tenant_id = $1
    AND pd.status != 'Pending'
    AND pd.pay_date::timestamp BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 5. Gastos contables -> salida / gastos_operativos
  SELECT
    e.expense_date::timestamp             AS movement_date,
    e.total_amount                        AS amount,
    COALESCE(e.currency_id, 1)            AS currency_id,
    'salida'::text                        AS direction,
    'gastos_operativos'::text             AS movement_type
  FROM accounting_schema.expense e
  WHERE e.tenant_id = $1
    AND e.expense_date::timestamp BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 6. Gastos POS aprobados -> salida / gastos_operativos
  SELECT
    e.created_at                          AS movement_date,
    e.expense_amount                      AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'gastos_operativos'::text             AS movement_type
  FROM pos_schema.expense e
  JOIN general_schema.branch b ON b.branch_id = e.branch_id
  WHERE b.tenant_id = $1
    AND e.status = 'approved'
    AND e.created_at BETWEEN $2::timestamp AND $3::timestamp

  UNION ALL

  -- 7. Devoluciones -> salida / devoluciones
  SELECT
    rt.return_date                        AS movement_date,
    rt.total_refund_amount                AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'devoluciones'::text                  AS movement_type
  FROM pos_schema.return_transaction rt
  JOIN pos_schema.invoice inv
    ON inv.invoice_id = rt.invoice_id
  JOIN pos_schema.sale s
    ON s.sale_id = inv.sale_id
  JOIN general_schema.branch b ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND rt.return_date BETWEEN $2::timestamp AND $3::timestamp
`;

// Totales del periodo por (direction, currency_id, movement_type).
// Params: $1=tenant_id, $2=start_date, $3=end_date
export const cashFlowSummaryQuery = `
  SELECT
    direction,
    currency_id,
    movement_type,
    SUM(amount)                           AS total_amount
  FROM (${movementsUnion}) m
  GROUP BY direction, currency_id, movement_type
`;

// Movimientos agrupados por bucket de tiempo.
// Params: $1=tenant_id, $2=start_date, $3=end_date, $4=bucket_unit (text: 'day'|'week'|'month')
export const cashFlowBucketsQuery = `
  SELECT
    date_trunc($4, movement_date)         AS bucket_start,
    direction,
    currency_id,
    SUM(amount)                           AS total_amount
  FROM (${movementsUnion}) m
  GROUP BY bucket_start, direction, currency_id
  ORDER BY bucket_start
`;

// Efectivo disponible acumulado: igual que summary pero con rango historico amplio.
// El servicio pasa '1900-01-01' como $2 y NOW() como $3.
// Params: $1=tenant_id, $2=start_date, $3=end_date
export const cashFlowAvailableQuery = `
  SELECT
    direction,
    currency_id,
    SUM(amount)                           AS total_amount
  FROM (${movementsUnion}) m
  GROUP BY direction, currency_id
`;

// Proyecciones futuras: CxC pendientes, CxP pendientes, nomina pendiente.
// Params: $1=tenant_id
export const cashFlowProjectionsQuery = `
  SELECT
    ar.due_date::timestamp                AS projection_date,
    -- ar.balance_remaining (GENERATED subtotal - amount_paid) no incluye el
    -- impuesto, que vive aparte en sale_account_receivable.tax_amount --
    -- subestimaba la proyeccion de cobro en el monto del IVA de cada venta
    -- a credito pendiente. Recalculado igual que el listado de Cuentas por
    -- Cobrar (accounts-receivable.queries.ts) y check_account_receivable_completion().
    GREATEST((ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid, 0) AS amount,
    1                                     AS currency_id,
    'entrada'::text                       AS direction,
    'cuentas_por_cobrar'::text            AS movement_type,
    COALESCE(
      tc.first_name || ' ' || tc.last_name,
      'Cliente no registrado'
    )                                     AS description
  FROM general_schema.account_receivable ar
  JOIN pos_schema.sale_account_receivable sar
    ON sar.account_receivable_id = ar.account_receivable_id
  LEFT JOIN general_schema.tenant_customer tc
    ON tc.tenant_customer_id = ar.tenant_customer_id
  WHERE ar.tenant_id = $1
    AND ar.is_paid = FALSE
    AND (ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid > 0
    AND ar.due_date > CURRENT_DATE

  UNION ALL

  SELECT
    ap.due_date::timestamp                AS projection_date,
    -- Mismo bug, lado cuentas por pagar: el IVA vive en
    -- purchase_account_payable.tax_amount, no en account_payable.subtotal.
    GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'cuentas_por_pagar'::text             AS movement_type,
    COALESCE(s.supplier_name, 'Proveedor desconocido') AS description
  FROM general_schema.account_payable ap
  JOIN purchase_schema.purchase_account_payable pap
    ON pap.account_payable_id = ap.account_payable_id
  JOIN purchase_schema.purchase_order po
    ON po.purchase_order_id = pap.purchase_order_id
  JOIN inventory_schema.warehouse w
    ON w.warehouse_id = po.warehouse_id
  JOIN general_schema.branch b
    ON b.branch_id = w.branch_id
  LEFT JOIN purchase_schema.supplier s
    ON s.supplier_id = po.supplier_id
  WHERE b.tenant_id = $1
    AND ap.is_paid = FALSE
    AND (ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid > 0
    AND ap.due_date > CURRENT_DATE

  UNION ALL

  SELECT
    pd.pay_date::timestamp                AS projection_date,
    pd.net_salary                         AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'nomina'::text                        AS movement_type,
    'Nomina programada'::text             AS description
  FROM hr_schema.paysheet_detail pd
  JOIN hr_schema.paysheet ps ON ps.paysheet_id = pd.paysheet_id
  WHERE ps.tenant_id = $1
    AND pd.status = 'Pending'
    AND pd.pay_date > CURRENT_DATE

  ORDER BY projection_date ASC
`;
