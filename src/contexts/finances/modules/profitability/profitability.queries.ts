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
//
// bucket_start sale en hora local de negocio como texto ISO sin zona
// (finances.time.ts); expense_date es date y ya es dia local.

import { dateNoonUtc, rateAt, sumBoth } from '@/contexts/finances/finances.fx';
import { bucketLabel, localTs } from '@/contexts/finances/finances.time';

// Todos los montos salen en USD y VES (<campo>_usd / <campo>_ves), convertidos
// con la tasa vigente en la fecha de cada movimiento (FNZ-X-02). El costo de
// venta (cost_price_at_sale) esta en USD (catalogo) sin importar la moneda de
// la venta; la nomina se liquida en bolivares.

import {
  accruedSaleFilter,
  netCostAmount,
  netNoteAmount,
  netReturnAmount,
  netReturnCostAmount,
  netSaleAmount,
  noteCurrency,
  saleItemJoins,
} from '@/contexts/finances/finances.sales';

// Ventas, devoluciones y notas van sin IVA y con criterio devengado (ver
// finances.sales.ts: FNZ-RT-04 y FNZ-RT-05).

// Componentes de ventas, agrupados por (sucursal, bucket).
// net_sales = total_price sin IVA (ya neto de descuento); discounts y cogs
// explicitos. La venta cuenta en su sale_date aunque sea a credito o apartado.
export const salesComponents = `
  SELECT
    b.branch_id,
    ${bucketLabel('$2', localTs('s.sale_date'))} AS bucket_start,
    ${sumBoth('net_sales', netSaleAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')},
    ${sumBoth('discounts', 'COALESCE(si.discount_applied, 0)', 'COALESCE(s.currency_id, 1)', 'fx.rate')},
    ${sumBoth('cogs', netCostAmount, '2', 'fx.rate')}
  FROM pos_schema.sale s
  INNER JOIN general_schema.branch b
    ON b.branch_id = s.branch_id
  INNER JOIN pos_schema.sale_item si
    ON si.sale_id = s.sale_id
  ${saleItemJoins}
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 's.sale_date')} AS rate) fx
  WHERE b.tenant_id = $1
    AND ${accruedSaleFilter}
    AND s.sale_date >= $3
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
  GROUP BY b.branch_id, 2
`;

// Componentes de devoluciones, agrupados por (sucursal, bucket).
// El bucket y la tasa se toman de la fecha de la devolucion (return_date); el
// costo de lo devuelto se obtiene del sale_item original (cost_price_at_sale, USD).
export const returnsComponents = `
  SELECT
    b.branch_id,
    ${bucketLabel('$2', localTs('rt.return_date'))} AS bucket_start,
    ${sumBoth('returns', netReturnAmount, 'COALESCE(s.currency_id, 1)', 'fx.rate')},
    ${sumBoth('returns_cogs', netReturnCostAmount, '2', 'fx.rate')}
  FROM pos_schema.return_product rp
  INNER JOIN pos_schema.return_transaction rt
    ON rt.return_transaction_id = rp.return_transaction_id
  INNER JOIN pos_schema.sale_item si
    ON si.sale_item_id = rp.sale_item_id
  INNER JOIN pos_schema.sale s
    ON s.sale_id = si.sale_id
  INNER JOIN general_schema.branch b
    ON b.branch_id = s.branch_id
  ${saleItemJoins}
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'rt.return_date')} AS rate) fx
  WHERE b.tenant_id = $1
    AND rt.return_date >= $3
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
  GROUP BY b.branch_id, 2
`;

// Notas de credito / debito activas, agrupadas por (sucursal, bucket) de su
// fecha de emision. Credito resta y debito suma: ajustan las ventas netas sin
// tocar el costo.
export const notesComponents = `
  SELECT
    b.branch_id,
    ${bucketLabel('$2', localTs('cdn.created_at'))} AS bucket_start,
    ${sumBoth('notes', netNoteAmount, noteCurrency, 'fx.rate')}
  FROM pos_schema.credit_debit_note cdn
  INNER JOIN pos_schema.invoice inv
    ON inv.invoice_id = cdn.invoice_id
  INNER JOIN pos_schema.sale s
    ON s.sale_id = inv.sale_id
  INNER JOIN general_schema.branch b
    ON b.branch_id = s.branch_id
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'cdn.created_at')} AS rate) fx
  WHERE b.tenant_id = $1
    AND cdn.tenant_id = $1
    AND cdn.is_voided = FALSE
    AND cdn.created_at >= $3
    AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
  GROUP BY b.branch_id, 2
`;

// Gastos operativos, agrupados por (sucursal, bucket). Fuente canonica:
// accounting_schema.expense (tenant_id propio, total_amount, expense_date, currency_id).
// expense_date es date: tasa del mediodia local de ese dia.
export const expenseComponents = `
  SELECT
    e.branch_id,
    ${bucketLabel('$2', 'e.expense_date::timestamp')} AS bucket_start,
    ${sumBoth('amount', 'e.total_amount', 'COALESCE(e.currency_id, 1)', 'fx.rate')}
  FROM accounting_schema.expense e
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
  WHERE e.tenant_id = $1
    AND e.expense_date >= $3
    AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
  GROUP BY e.branch_id, 2
`;

// Desglose de gastos por categoria, agrupado por (sucursal, bucket, categoria).
// Complementa expenseComponents (que trae solo el total) para mostrar el detalle
// debajo de la grafica de rentabilidad. LEFT JOIN preserva gastos sin categoria
// asignada (category_name = NULL -> "Sin categoria" en el frontend).
export const expenseCategoryComponents = `
  SELECT
    e.branch_id,
    ${bucketLabel('$2', 'e.expense_date::timestamp')} AS bucket_start,
    ec.category_id                                       AS category_id,
    ec.name                                               AS category_name,
    ${sumBoth('amount', 'e.total_amount', 'COALESCE(e.currency_id, 1)', 'fx.rate')}
  FROM accounting_schema.expense e
  LEFT JOIN accounting_schema.expense_category ec
    ON ec.category_id = e.category_id
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
  WHERE e.tenant_id = $1
    AND e.expense_date >= $3
    AND ($4::uuid IS NULL OR e.branch_id = $4::uuid)
  GROUP BY e.branch_id, 2, ec.category_id, ec.name
`;

// Nomina pagada, agrupada por (sucursal, bucket). Costo para la empresa =
// total devengado de la planilla (total_earnings; si quedo en 0, como en
// planillas viejas, se usa el neto): las deducciones se retienen
// al trabajador pero igual son costo. Aportes patronales (IVSS, FAOV, INCES)
// aun no se calculan (ver seeds/catalog/hr/004), por eso no se suman.
// Solo planillas cerradas (status Completed), en la fecha en que se pagaron.
// La nomina se liquida en bolivares (currency_id 1).
export const payrollComponents = `
  SELECT
    ps.branch_id,
    ${bucketLabel('$2', localTs('ps.payment_date'))} AS bucket_start,
    ${sumBoth('amount', 'COALESCE(NULLIF(ps.total_earnings, 0), ps.net_total)', '1', 'fx.rate')}
  FROM hr_schema.paysheet ps
  INNER JOIN hr_schema.paysheet_status pst
    ON pst.status_id = ps.status_id
  CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'ps.payment_date')} AS rate) fx
  WHERE ps.tenant_id = $1
    AND pst.status_description = 'Completed'
    AND ps.payment_date IS NOT NULL
    AND ps.payment_date >= $3
    AND ($4::uuid IS NULL OR ps.branch_id = $4::uuid)
  GROUP BY ps.branch_id, 2
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
