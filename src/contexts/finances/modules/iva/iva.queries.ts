export const ivaQueries = {
  getSummary: `
    WITH

    -- R2.1: IVA Débito — cobrado en ventas facturadas en el periodo.
    -- El IVA se lee del encabezado de la factura (invoice.tax_amount), que se
    -- puebla en toda venta.
    debito AS (
      SELECT COALESCE(SUM(inv.tax_amount), 0) AS total
      FROM pos_schema.invoice inv
      JOIN pos_schema.sale s
        ON s.sale_id = inv.sale_id
      JOIN general_schema.branch b
        ON b.branch_id = s.branch_id AND b.tenant_id = $1
      WHERE inv.invoiced_at BETWEEN $2::timestamptz AND $3::timestamptz
    ),

    -- R2.2: IVA Crédito — compras con factura ya pagada
    credito AS (
      SELECT COALESCE(SUM(si.tax_amount), 0) AS total
      FROM purchase_schema.supplier_invoice si
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = si.purchase_order_id
      JOIN purchase_schema.supplier sup
        ON sup.supplier_id = po.supplier_id AND sup.added_by = $1
      WHERE si.paid = TRUE
        AND si.invoice_date BETWEEN $2::timestamptz AND $3::timestamptz
    ),

    -- R2.3: IVA CxP — compras con factura emitida pero pago pendiente
    cxp AS (
      SELECT COALESCE(SUM(si.tax_amount), 0) AS total
      FROM purchase_schema.supplier_invoice si
      JOIN purchase_schema.purchase_order po
        ON po.purchase_order_id = si.purchase_order_id
      JOIN purchase_schema.supplier sup
        ON sup.supplier_id = po.supplier_id AND sup.added_by = $1
      WHERE si.paid = FALSE
        AND si.invoice_date BETWEEN $2::timestamptz AND $3::timestamptz
    ),

    -- R2.5: IVA Notas de Crédito — IVA revertido por devoluciones
    notas_credito AS (
      SELECT COALESCE(SUM(rp.total_price * COALESCE(ii.tax_rate_percentage, 0) / 100.0), 0) AS total
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
      WHERE rt.return_date BETWEEN $2::timestamptz AND $3::timestamptz
    )

    SELECT
      d.total::numeric(18,2)                                   AS iva_debito,
      c.total::numeric(18,2)                                   AS iva_credito,
      cx.total::numeric(18,2)                                  AS iva_cxp,
      (c.total + cx.total)::numeric(18,2)                     AS iva_recuperable,
      n.total::numeric(18,2)                                   AS iva_notas_credito,
      (d.total - n.total)::numeric(18,2)                      AS iva_debito_ajustado,
      (d.total - n.total - c.total - cx.total)::numeric(18,2) AS iva_neto
    FROM debito d, credito c, cxp cx, notas_credito n
  `,
};
