// Retencion de IVA en compras (FNZ-IV-06, migracion accounting/047). Modelo
// parametrizable: el tenant marca si es agente de retencion y cada proveedor
// lleva el porcentaje del IVA que se le retiene; nada de eso se asume.

export const ivaWithholdingQueries = {
  // Configuracion: bandera del tenant y proveedores con su porcentaje.
  getAgentFlag: `
    SELECT is_iva_withholding_agent
    FROM general_schema.tenant
    WHERE tenant_id = $1
  `,

  setAgentFlag: `
    UPDATE general_schema.tenant
    SET is_iva_withholding_agent = $2, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = $1
    RETURNING is_iva_withholding_agent
  `,

  listSuppliers: `
    SELECT supplier_id, supplier_name, iva_retention_percentage::float8 AS iva_retention_percentage
    FROM purchase_schema.supplier
    WHERE added_by = $1
    ORDER BY supplier_name
  `,

  setSupplierPercentage: `
    UPDATE purchase_schema.supplier
    SET iva_retention_percentage = $3, updated_at = CURRENT_TIMESTAMP
    WHERE supplier_id = $2 AND added_by = $1
    RETURNING supplier_id, supplier_name, iva_retention_percentage::float8 AS iva_retention_percentage
  `,

  // Facturas de proveedores con retencion pendiente de emitir: el tenant es
  // agente, el proveedor tiene porcentaje > 0, la factura tiene IVA y no tiene
  // comprobante vigente.
  listCandidates: `
    SELECT
      si.supplier_invoice_id,
      si.invoice_number,
      si.invoice_date,
      sup.supplier_id,
      sup.supplier_name,
      si.subtotal_amount::float8 AS taxable_base,
      si.tax_amount::float8 AS iva_amount,
      sup.iva_retention_percentage::float8 AS retention_percentage,
      ROUND(si.tax_amount * sup.iva_retention_percentage / 100, 3)::float8 AS retained_amount
    FROM purchase_schema.supplier_invoice si
    JOIN purchase_schema.purchase_order po ON po.purchase_order_id = si.purchase_order_id
    JOIN purchase_schema.supplier sup ON sup.supplier_id = po.supplier_id
    JOIN general_schema.tenant t ON t.tenant_id = sup.added_by
    WHERE sup.added_by = $1
      AND t.is_iva_withholding_agent = TRUE
      AND sup.iva_retention_percentage > 0
      AND si.tax_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM accounting_schema.iva_withholding w
        WHERE w.supplier_invoice_id = si.supplier_invoice_id AND w.is_voided = FALSE
      )
    ORDER BY si.invoice_date DESC
  `,

  // Una factura de proveedor del tenant, con lo necesario para el comprobante.
  getInvoiceForWithholding: `
    SELECT
      si.supplier_invoice_id,
      si.invoice_number,
      si.subtotal_amount::float8 AS taxable_base,
      si.tax_amount::float8 AS iva_amount,
      sup.supplier_id,
      sup.iva_retention_percentage::float8 AS retention_percentage,
      t.is_iva_withholding_agent
    FROM purchase_schema.supplier_invoice si
    JOIN purchase_schema.purchase_order po ON po.purchase_order_id = si.purchase_order_id
    JOIN purchase_schema.supplier sup ON sup.supplier_id = po.supplier_id
    JOIN general_schema.tenant t ON t.tenant_id = sup.added_by
    WHERE si.supplier_invoice_id = $2 AND sup.added_by = $1
    LIMIT 1
  `,

  lockTenantNumbering: `
    SELECT pg_advisory_xact_lock(hashtext('iva_withholding:' || $1::text))
  `,

  nextVoucherNumber: `
    SELECT COALESCE(MAX(voucher_number), 0) + 1 AS next_number
    FROM accounting_schema.iva_withholding
    WHERE tenant_id = $1
  `,

  currentRate: `
    SELECT general_schema.get_exchange_rate_at($1::uuid, (now() AT TIME ZONE 'UTC')) AS rate
  `,

  insertWithholding: `
    INSERT INTO accounting_schema.iva_withholding
      (tenant_id, voucher_number, supplier_invoice_id, supplier_id, invoice_number,
       taxable_base, iva_amount, retention_percentage, retained_amount,
       currency_id, exchange_rate, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2, $10, $11)
    RETURNING withholding_id, voucher_number, issued_at
  `,

  // Comprobantes emitidos en el periodo ($2/$3 = instantes ISO, como en el
  // resumen de IVA). Monto retenido en USD y en VES con la tasa guardada.
  listWithholdings: `
    SELECT
      w.withholding_id,
      w.voucher_number,
      w.issued_at,
      w.supplier_id,
      sup.supplier_name,
      w.invoice_number,
      w.taxable_base::float8 AS taxable_base,
      w.iva_amount::float8 AS iva_amount,
      w.retention_percentage::float8 AS retention_percentage,
      w.retained_amount::float8 AS retained_amount_usd,
      CASE WHEN w.exchange_rate IS NULL THEN NULL
           ELSE ROUND(w.retained_amount * w.exchange_rate, 2)::float8 END AS retained_amount_ves,
      w.is_voided
    FROM accounting_schema.iva_withholding w
    JOIN purchase_schema.supplier sup ON sup.supplier_id = w.supplier_id
    WHERE w.tenant_id = $1
      AND w.issued_at BETWEEN ($2::timestamptz AT TIME ZONE 'UTC') AND ($3::timestamptz AT TIME ZONE 'UTC')
    ORDER BY w.voucher_number DESC
  `,

  getWithholding: `
    SELECT withholding_id, is_voided
    FROM accounting_schema.iva_withholding
    WHERE withholding_id = $2 AND tenant_id = $1
  `,

  voidWithholding: `
    UPDATE accounting_schema.iva_withholding
    SET is_voided = TRUE, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE withholding_id = $2 AND tenant_id = $1 AND is_voided = FALSE
    RETURNING withholding_id
  `,
};
