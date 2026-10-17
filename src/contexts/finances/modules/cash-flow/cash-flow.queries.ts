// Consultas crudas para la Vista de Flujo de Caja.
// Consolida movimientos reales de efectivo desde pos, purchase, hr y accounting.
//
// Parametros comunes de movimientos historicos:
//   $1 = tenant_id   (uuid)
//   $2 = start_date  (date YYYY-MM-DD, dia local de negocio, inclusive)
//   $3 = end_date    (date YYYY-MM-DD, dia local de negocio, inclusive)
//   $4 = branch_id   (uuid|null) -> filtro opcional por sucursal; NULL = todas
//
// movement_at es el instante UTC del movimiento: con el se toma la tasa de esa
// fecha y cada total sale en USD y en VES (total_usd / total_ves, FNZ-X-02).
// movement_date sale en hora local de negocio (ver finances.time.ts): las
// columnas timestamp (guardadas en UTC) se convierten y las columnas date se
// usan tal cual. El rango incluye el dia final completo.

import { dateNoonUtc, rateAt, sumBoth } from '@/contexts/finances/finances.fx';
import {
  BUSINESS_TZ,
  bucketLabel,
  dateInDays,
  localTs,
  timestampInLocalDays,
} from '@/contexts/finances/finances.time';

const inRange = (column: string) => timestampInLocalDays(column, '$2', '$3');
const dateInRange = (column: string) => dateInDays(column, '$2', '$3');

const movementsUnion = `
  -- 1. Cobros directos POS -> entrada / ventas
  SELECT
    ${localTs('cp.payment_date')}         AS movement_date,
    cp.payment_date AS movement_at,
    cp.payment_amount                     AS amount,
    COALESCE(cp.currency_id, 1)           AS currency_id,
    'entrada'::text                       AS direction,
    'ventas'::text                        AS movement_type,
    b.branch_id                           AS branch_id
  FROM pos_schema.customer_payment cp
  JOIN pos_schema.sale s ON s.sale_id = cp.sale_id
  JOIN general_schema.branch b ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND s.is_completed = TRUE
    -- Pagar con puntos no mueve efectivo.
    AND COALESCE(cp.is_points_redemption, FALSE) = FALSE
    -- Ventas a credito / apartado: su abono inicial tambien se registra en
    -- sale_collection (rama 2); contarlo aqui lo duplicaba, y ademas aparecia
    -- retroactivamente cuando la venta se completaba al saldar la CxC.
    AND NOT EXISTS (
      SELECT 1 FROM pos_schema.sale_account_receivable sar_x
      WHERE sar_x.sale_id = s.sale_id
    )
    AND ${inRange('cp.payment_date')}
    AND ($4::uuid IS NULL OR b.branch_id = $4::uuid)

  UNION ALL

  -- 1b. Vuelto entregado -> resta de entrada / ventas. customer_payment guarda
  -- lo que entrego el cliente; el vuelto (invoice.change_amount, en la moneda
  -- de la venta) vuelve a salir de la caja.
  SELECT
    ${localTs('s.sale_date')}            AS movement_date,
    s.sale_date AS movement_at,
    -inv.change_amount                    AS amount,
    COALESCE(s.currency_id, 1)            AS currency_id,
    'entrada'::text                       AS direction,
    'ventas'::text                        AS movement_type,
    b.branch_id                           AS branch_id
  FROM pos_schema.invoice inv
  JOIN pos_schema.sale s ON s.sale_id = inv.sale_id
  JOIN general_schema.branch b ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND s.is_completed = TRUE
    AND inv.change_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM pos_schema.sale_account_receivable sar_x
      WHERE sar_x.sale_id = s.sale_id
    )
    AND ${inRange('s.sale_date')}
    AND ($4::uuid IS NULL OR b.branch_id = $4::uuid)

  UNION ALL

  -- 2. Cobros de cuentas por cobrar -> entrada / cuentas_cobradas
  SELECT
    ${localTs('sc.payment_date')}         AS movement_date,
    sc.payment_date AS movement_at,
    sc.amount_paid                        AS amount,
    COALESCE(s.currency_id, 1)            AS currency_id,
    'entrada'::text                       AS direction,
    'cuentas_cobradas'::text              AS movement_type,
    s.branch_id                           AS branch_id
  FROM pos_schema.sale_collection sc
  JOIN pos_schema.sale_account_receivable sar
    ON sar.sale_account_receivable_id = sc.sale_account_receivable_id
  JOIN general_schema.account_receivable ar
    ON ar.account_receivable_id = sar.account_receivable_id
  JOIN pos_schema.sale s
    ON s.sale_id = sar.sale_id
  WHERE ar.tenant_id = $1
    AND ${inRange('sc.payment_date')}
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)

  UNION ALL

  -- 3. Pagos a proveedores -> salida / pagos_proveedores
  SELECT
    ${localTs('pop.payment_date')}        AS movement_date,
    pop.payment_date AS movement_at,
    pop.amount_paid                       AS amount,
    COALESCE(pop.currency_id, 1)          AS currency_id,
    'salida'::text                        AS direction,
    'pagos_proveedores'::text             AS movement_type,
    b.branch_id                           AS branch_id
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
    AND ${inRange('pop.payment_date')}
    AND ($4::uuid IS NULL OR b.branch_id = $4::uuid)

  UNION ALL

  -- 4. Nomina pagada -> salida / nomina. El estado real vive en la planilla
  -- (paysheet.status_id; paysheet_detail.status nunca se actualiza) y la fecha
  -- de pago es paysheet.payment_date, que se fija al cerrar la planilla.
  SELECT
    ${localTs('ps.payment_date')}        AS movement_date,
    ps.payment_date AS movement_at,
    ps.net_total                          AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'nomina'::text                        AS movement_type,
    ps.branch_id                          AS branch_id
  FROM hr_schema.paysheet ps
  JOIN hr_schema.paysheet_status pst ON pst.status_id = ps.status_id
  WHERE ps.tenant_id = $1
    AND pst.status_description = 'Completed'
    AND ps.payment_date IS NOT NULL
    AND ${inRange('ps.payment_date')}
    AND ($4::uuid IS NULL OR ps.branch_id = $4::uuid)

  UNION ALL

  -- 5. Gastos contables -> salida / gastos_operativos (expense_date es date)
  SELECT
    e.expense_date::timestamp             AS movement_date,
    ${dateNoonUtc('e.expense_date')} AS movement_at,
    e.total_amount                        AS amount,
    COALESCE(e.currency_id, 1)            AS currency_id,
    'salida'::text                        AS direction,
    'gastos_operativos'::text             AS movement_type,
    e.branch_id                           AS branch_id
  FROM accounting_schema.expense e
  WHERE e.tenant_id = $1
    AND ${dateInRange('e.expense_date')}
    AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)

  UNION ALL

  -- 6. Devoluciones -> salida / devoluciones
  SELECT
    ${localTs('rt.return_date')}          AS movement_date,
    rt.return_date AS movement_at,
    rt.total_refund_amount                AS amount,
    COALESCE(s.currency_id, 1)            AS currency_id,
    'salida'::text                        AS direction,
    'devoluciones'::text                  AS movement_type,
    b.branch_id                           AS branch_id
  FROM pos_schema.return_transaction rt
  JOIN pos_schema.invoice inv
    ON inv.invoice_id = rt.invoice_id
  JOIN pos_schema.sale s
    ON s.sale_id = inv.sale_id
  JOIN general_schema.branch b ON b.branch_id = s.branch_id
  WHERE b.tenant_id = $1
    AND ${inRange('rt.return_date')}
    AND ($4::uuid IS NULL OR b.branch_id = $4::uuid)
`;

// Totales del periodo por (direction, movement_type, sucursal), en USD y VES
// con la tasa de la fecha de cada movimiento.
// Params: $1=tenant_id, $2=start_date, $3=end_date, $4=branch_id (uuid|null)
export const cashFlowSummaryQuery = `
  SELECT
    m.direction,
    m.movement_type,
    m.branch_id,
    ${sumBoth('total', 'm.amount', 'm.currency_id', 'fx.rate')}
  FROM (${movementsUnion}) m
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'm.movement_at')} AS rate) fx
  GROUP BY m.direction, m.movement_type, m.branch_id
`;

// Movimientos agrupados por bucket de tiempo (local) y sucursal.
// bucket_start sale como texto ISO local sin zona (ver bucketLabel).
// Params: $1=tenant_id, $2=start_date, $3=end_date, $4=branch_id (uuid|null),
//         $5=bucket_unit (text: 'day'|'week'|'month')
export const cashFlowBucketsQuery = `
  SELECT
    ${bucketLabel('$5', 'm.movement_date')} AS bucket_start,
    m.direction,
    m.branch_id,
    ${sumBoth('total', 'm.amount', 'm.currency_id', 'fx.rate')}
  FROM (${movementsUnion}) m
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'm.movement_at')} AS rate) fx
  GROUP BY 1, m.direction, m.branch_id
  ORDER BY 1
`;

// Efectivo disponible acumulado: igual que summary pero con rango historico amplio.
// El servicio pasa '1900-01-01' como $2 y la fecha local de hoy como $3.
// Params: $1=tenant_id, $2=start_date, $3=end_date, $4=branch_id (uuid|null)
export const cashFlowAvailableQuery = `
  SELECT
    m.direction,
    ${sumBoth('total', 'm.amount', 'm.currency_id', 'fx.rate')}
  FROM (${movementsUnion}) m
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'm.movement_at')} AS rate) fx
  GROUP BY m.direction
`;

// Proyecciones: CxC pendientes, CxP pendientes y planillas de nomina sin pagar.
// Incluye lo vencido y lo que vence hoy (is_overdue, dia local de negocio):
// son justamente los pagos mas urgentes de caja. projection_date sale como
// texto YYYY-MM-DD (todas las fuentes son fechas) para que la zona horaria no
// la corra un dia.
// Params: $1=tenant_id
const businessToday = `(now() AT TIME ZONE '${BUSINESS_TZ}')::date`;
const paysheetDueDate = `COALESCE((${localTs('ps.payment_date')})::date, ps.period_end)`;

export const cashFlowProjectionsQuery = `
  SELECT
    ar.due_date::text                     AS projection_date,
    ar.due_date < ${businessToday}        AS is_overdue,
    -- ar.balance_remaining (GENERATED subtotal - amount_paid) no incluye el
    -- impuesto, que vive aparte en sale_account_receivable.tax_amount --
    -- subestimaba la proyeccion de cobro en el monto del IVA de cada venta
    -- a credito pendiente. Recalculado igual que el listado de Cuentas por
    -- Cobrar (accounts-receivable.queries.ts) y check_account_receivable_completion().
    GREATEST((ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid, 0) AS amount,
    COALESCE(sale_p.currency_id, 1)       AS currency_id,
    'entrada'::text                       AS direction,
    'cuentas_por_cobrar'::text            AS movement_type,
    COALESCE(
      tc.first_name || ' ' || tc.last_name,
      'Cliente no registrado'
    )                                     AS description
  FROM general_schema.account_receivable ar
  JOIN pos_schema.sale_account_receivable sar
    ON sar.account_receivable_id = ar.account_receivable_id
  JOIN pos_schema.sale sale_p
    ON sale_p.sale_id = sar.sale_id
  LEFT JOIN general_schema.tenant_customer tc
    ON tc.tenant_customer_id = ar.tenant_customer_id
  WHERE ar.tenant_id = $1
    AND ar.is_paid = FALSE
    AND (ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid > 0

  UNION ALL

  SELECT
    ap.due_date::text                     AS projection_date,
    ap.due_date < ${businessToday}        AS is_overdue,
    -- Mismo bug, lado cuentas por pagar: el IVA vive en
    -- purchase_account_payable.tax_amount, no en account_payable.subtotal.
    GREATEST((ap.subtotal + COALESCE(pap.tax_amount, 0)) - ap.amount_paid, 0) AS amount,
    2                                     AS currency_id,
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

  UNION ALL

  -- Nomina: planillas abiertas (status Pending). El estado y la fecha de pago
  -- viven en hr_schema.paysheet (paysheet_detail.status no se actualiza
  -- nunca); sin fecha de pago se proyecta al cierre del periodo.
  SELECT
    ${paysheetDueDate}::text              AS projection_date,
    ${paysheetDueDate} < ${businessToday} AS is_overdue,
    ps.net_total                          AS amount,
    1                                     AS currency_id,
    'salida'::text                        AS direction,
    'nomina'::text                        AS movement_type,
    'Nomina programada'::text             AS description
  FROM hr_schema.paysheet ps
  JOIN hr_schema.paysheet_status pst ON pst.status_id = ps.status_id
  WHERE ps.tenant_id = $1
    AND pst.status_description = 'Pending'
    AND ps.net_total > 0

  ORDER BY projection_date ASC
`;
