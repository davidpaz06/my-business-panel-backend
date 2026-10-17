import { dateNoonUtc, rateAt, sumBoth } from '@/contexts/finances/finances.fx';

// Cada componente del IVA se devuelve en USD y VES (total_usd / total_ves),
// convertido con la tasa vigente en la fecha de cada documento (FNZ-X-02): la
// declaracion ante el SENIAT es en bolivares y cada documento vale lo que
// valia el dia que se emitio. El frontend calcula los derivados.
//
// Params: $1 = tenant_id, $2 / $3 = inicio y fin del periodo (instantes ISO).
// Las columnas timestamp se guardan en hora UTC: el instante se pasa a UTC
// antes de comparar, independiente de la zona de la sesion.
const fromTs = `($2::timestamptz AT TIME ZONE 'UTC')`;
const toTs = `($3::timestamptz AT TIME ZONE 'UTC')`;
const inPeriod = (column: string) => `${column} BETWEEN ${fromTs} AND ${toTs}`;
// Columnas date (expense_date): dia local del inicio y del fin del periodo.
const dateInPeriod = (column: string) =>
  `${column} BETWEEN ($2::timestamptz AT TIME ZONE 'America/Caracas')::date
                 AND ($3::timestamptz AT TIME ZONE 'America/Caracas')::date`;

export const ivaQueries = {
  getSummary: `
    WITH

    -- IVA efectivo de cada factura del tenant (FNZ-X-02 / FNZ-IV-02).
    -- El encabezado (invoice.tax_amount) viene de la venta y NO incluye el IVA
    -- embebido de items con includes_iva; las lineas (invoice_item.tax_amount,
    -- calculadas por invoice_item_amounts) si. Facturas anteriores a ese
    -- calculo tienen las lineas en 0: se toma el mayor de ambos.
    factura AS (
      SELECT
        inv.invoice_id,
        inv.invoiced_at,
        inv.total_amount,
        COALESCE(inv.currency_id, s.currency_id, 1) AS currency_id,
        GREATEST(inv.tax_amount, COALESCE(lineas.tax, 0)) AS tax
      FROM pos_schema.invoice inv
      JOIN pos_schema.sale s
        ON s.sale_id = inv.sale_id
      JOIN general_schema.branch b
        ON b.branch_id = s.branch_id AND b.tenant_id = $1
      LEFT JOIN LATERAL (
        SELECT SUM(ii.tax_amount) AS tax
        FROM pos_schema.invoice_item ii
        WHERE ii.invoice_id = inv.invoice_id
      ) lineas ON TRUE
    ),

    -- R2.1: IVA Debito — cobrado en ventas facturadas en el periodo.
    debito AS (
      SELECT ${sumBoth('total', 'f.tax', 'f.currency_id', 'fx.rate')}
      FROM factura f
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'f.invoiced_at')} AS rate) fx
      WHERE ${inPeriod('f.invoiced_at')}
    ),

    -- Notas de debito activas del periodo: aumentan el debito fiscal. La nota
    -- ajusta el total de la factura; su IVA es la misma proporcion que el IVA
    -- de la factura sobre su total (FNZ-IV-03).
    notas_debito AS (
      SELECT ${sumBoth('total', 'cdn.amount * f.tax / NULLIF(f.total_amount, 0)', 'COALESCE(cdn.currency_id, f.currency_id)', 'fx.rate')}
      FROM pos_schema.credit_debit_note cdn
      JOIN factura f ON f.invoice_id = cdn.invoice_id
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'cdn.created_at')} AS rate) fx
      WHERE cdn.tenant_id = $1
        AND cdn.note_type = 'debit'
        AND cdn.is_voided = FALSE
        AND ${inPeriod('cdn.created_at')}
    ),

    -- R2.5: IVA revertido en el periodo: devoluciones + notas de credito
    -- activas (FNZ-IV-03). Devoluciones: si el producto vende con IVA incluido
    -- el IVA es total * tasa / (100 + tasa); si no, total * tasa / 100.
    notas_credito AS (
      SELECT ${sumBoth('total', 'x.tax', 'x.currency_id', 'fx.rate')}
      FROM (
        SELECT
          rt.return_date AS at,
          COALESCE(s.currency_id, 1) AS currency_id,
          CASE
            WHEN pv.includes_iva
              THEN rp.total_price * COALESCE(ii.tax_rate_percentage, 0)
                   / (100.0 + COALESCE(ii.tax_rate_percentage, 0))
            ELSE rp.total_price * COALESCE(ii.tax_rate_percentage, 0) / 100.0
          END AS tax
        FROM pos_schema.return_product rp
        JOIN pos_schema.return_transaction rt
          ON rt.return_transaction_id = rp.return_transaction_id
        JOIN pos_schema.invoice inv
          ON inv.invoice_id = rt.invoice_id
        JOIN pos_schema.sale s
          ON s.sale_id = inv.sale_id
        JOIN general_schema.branch b
          ON b.branch_id = s.branch_id AND b.tenant_id = $1
        LEFT JOIN pos_schema.invoice_item ii
          ON ii.sale_item_id = rp.sale_item_id
        LEFT JOIN pos_schema.sale_item si
          ON si.sale_item_id = rp.sale_item_id
        LEFT JOIN general_schema.product_variant pv
          ON pv.tenant_id = si.tenant_id
         AND pv.product_variant_id = si.product_variant_id
        WHERE ${inPeriod('rt.return_date')}

        UNION ALL

        SELECT
          cdn.created_at AS at,
          COALESCE(cdn.currency_id, f.currency_id) AS currency_id,
          cdn.amount * f.tax / NULLIF(f.total_amount, 0) AS tax
        FROM pos_schema.credit_debit_note cdn
        JOIN factura f ON f.invoice_id = cdn.invoice_id
        WHERE cdn.tenant_id = $1
          AND cdn.note_type = 'credit'
          AND cdn.is_voided = FALSE
          AND ${inPeriod('cdn.created_at')}
      ) x
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'x.at')} AS rate) fx
    ),

    -- R2.2: IVA Credito — compras con factura ya pagada (USD).
    credito AS (
      SELECT ${sumBoth('total', 'si.tax_amount', '2', 'fx.rate')}
      FROM purchase_schema.supplier_invoice si
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = si.purchase_order_id
      JOIN purchase_schema.supplier sup
        ON sup.supplier_id = po.supplier_id AND sup.added_by = $1
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'si.invoice_date')} AS rate) fx
      WHERE si.paid = TRUE
        AND ${inPeriod('si.invoice_date')}
    ),

    -- R2.3: IVA CxP — compras con factura emitida pero pago pendiente (USD).
    cxp AS (
      SELECT ${sumBoth('total', 'si.tax_amount', '2', 'fx.rate')}
      FROM purchase_schema.supplier_invoice si
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = si.purchase_order_id
      JOIN purchase_schema.supplier sup
        ON sup.supplier_id = po.supplier_id AND sup.added_by = $1
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'si.invoice_date')} AS rate) fx
      WHERE si.paid = FALSE
        AND ${inPeriod('si.invoice_date')}
    ),

    -- IVA de gastos registrados (FNZ-IV-05): credito fiscal, igual que lo
    -- registra el asiento contable del gasto (IVA Credito Fiscal).
    gastos AS (
      SELECT ${sumBoth('total', 'e.tax_amount', 'e.currency_id', 'fx.rate')}
      FROM accounting_schema.expense e
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', dateNoonUtc('e.expense_date'))} AS rate) fx
      WHERE e.tenant_id = $1
        AND e.tax_amount > 0
        AND ${dateInPeriod('e.expense_date')}
    ),

    -- IVA retenido a proveedores en el periodo (FNZ-IV-06): comprobantes
    -- vigentes, con la tasa guardada al emitir. Es una obligacion aparte de la
    -- declaracion propia (se entera al SENIAT), por eso no entra al neto.
    retenciones AS (
      SELECT ${sumBoth('total', 'w.retained_amount', 'w.currency_id', 'fx.rate')}
      FROM accounting_schema.iva_withholding w
      CROSS JOIN LATERAL (SELECT ${rateAt('$1', 'w.issued_at')} AS rate) fx
      WHERE w.tenant_id = $1
        AND w.is_voided = FALSE
        AND ${inPeriod('w.issued_at')}
    )

    SELECT 'debito'::text        AS component, total_usd::numeric(18,2) AS total_usd, total_ves::numeric(18,2) AS total_ves FROM debito
    UNION ALL
    SELECT 'notas_debito'::text  AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM notas_debito
    UNION ALL
    SELECT 'notas_credito'::text AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM notas_credito
    UNION ALL
    SELECT 'credito'::text       AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM credito
    UNION ALL
    SELECT 'cxp'::text           AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM cxp
    UNION ALL
    SELECT 'gastos'::text        AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM gastos
    UNION ALL
    SELECT 'retenciones'::text   AS component, total_usd::numeric(18,2), total_ves::numeric(18,2) FROM retenciones
  `,
};
