// Fragmentos SQL compartidos para llevar ventas, devoluciones y notas a neto
// de IVA y aplicar el criterio devengado. Los usan Rentabilidad y "Ventas vs
// gastos" para que ambas pantallas muestren la misma cifra de ventas netas
// (FNZ-RT-04, FNZ-RT-05, FNZ-GA-03).
//
// Alias que esperan las consultas que los usan: s = pos_schema.sale,
// si = pos_schema.sale_item, rp = pos_schema.return_product,
// cdn = pos_schema.credit_debit_note, inv = pos_schema.invoice y, tras
// saleItemJoins, ii = pos_schema.invoice_item y pv = product_variant.
//
// Criterio de IVA. El IVA de venta es debito fiscal y el IVA de compra es
// credito fiscal recuperable: ninguno es ingreso ni costo.
//  - Venta: sale_item.total_price trae el IVA embebido solo cuando el producto
//    vende con includes_iva; el IVA de la linea sale de invoice_item.tax_amount
//    (invoice_item_amounts). Los demas items ya van sin IVA.
//  - Costo: product_variant.cost_price / weighted_avg_cost incluyen el IVA de
//    compra (mig 041), asi que cost_price_at_sale se divide entre (1 + tasa de
//    la linea de factura). Sin linea de factura (ventas anteriores a
//    invoice_item_amounts) o con tasa 0 no se ajusta nada: es la opcion
//    conservadora, nunca resta costo de mas.
//
// Todas las expresiones van entre parentesis: sumBoth las inserta dentro de
// un CASE / division y la precedencia no debe cambiar.

export const lineIvaRate = `COALESCE(ii.tax_rate_percentage, 0)`;

export const saleItemJoins = `
  LEFT JOIN pos_schema.invoice_item ii
    ON ii.sale_item_id = si.sale_item_id
  LEFT JOIN general_schema.product_variant pv
    ON pv.tenant_id = si.tenant_id
   AND pv.product_variant_id = si.product_variant_id
`;

/** Venta de la linea sin IVA (ya neta de descuento), en la moneda de la venta. */
export const netSaleAmount = `(si.total_price - CASE WHEN COALESCE(pv.includes_iva, FALSE) THEN COALESCE(ii.tax_amount, 0) ELSE 0 END)`;

/** Costo de la linea vendida sin IVA recuperable, en USD. */
export const netCostAmount = `(COALESCE(si.cost_price_at_sale, 0) * si.quantity / (1 + ${lineIvaRate} / 100.0))`;

/** Monto devuelto sin IVA, en la moneda de la venta original. */
export const netReturnAmount = `(rp.total_price - CASE WHEN COALESCE(pv.includes_iva, FALSE) THEN rp.total_price * ${lineIvaRate} / (100.0 + ${lineIvaRate}) ELSE 0 END)`;

/** Costo de lo devuelto sin IVA recuperable, en USD. */
export const netReturnCostAmount = `(COALESCE(si.cost_price_at_sale, 0) * rp.quantity / (1 + ${lineIvaRate} / 100.0))`;

/**
 * Nota de credito (negativa) o debito (positiva) sin IVA: el monto de la nota
 * incluye IVA en la misma proporcion que su factura (subtotal / total).
 */
export const netNoteAmount = `(CASE WHEN cdn.note_type = 'credit' THEN -1 ELSE 1 END * cdn.amount * inv.subtotal_amount / NULLIF(inv.total_amount, 0))`;

/** Moneda de una nota: la propia, la de la factura o la de la venta. */
export const noteCurrency = `COALESCE(cdn.currency_id, inv.currency_id, s.currency_id, 1)`;

/**
 * Criterio devengado (FNZ-RT-05): la venta cuenta en su sale_date aunque sea a
 * credito o apartado y siga sin saldarse (is_completed = FALSE con CxC
 * asociada); no espera a que se cobre.
 */
export const accruedSaleFilter = `(
      s.is_completed = TRUE
      OR EXISTS (
        SELECT 1 FROM pos_schema.sale_account_receivable sar
        WHERE sar.sale_id = s.sale_id
      )
    )`;
