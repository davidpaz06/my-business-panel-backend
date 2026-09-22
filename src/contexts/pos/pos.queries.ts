import { createQueries } from '@crane-technologies/database';

export const posQueryDefs = {
  sales: {
    createSale: `
      INSERT INTO pos_schema.sale ( branch_id, tenant_customer_id, sale_condition, sale_date, currency_id, subtotal_amount, tax_amount, total_amount, is_completed, seller_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING sale_id
    `,
    linkSaleToActiveSession: `
      INSERT INTO pos_schema.cash_register_sale (
        cash_register_session_id,
        sale_id,
        transaction_time
      )
      SELECT
        crs.cash_register_session_id,
        $2,
        COALESCE($3::timestamp, NOW())
      FROM pos_schema.cash_register_session crs
      INNER JOIN pos_schema.cash_register cr
        ON cr.cash_register_id = crs.cash_register_id
      WHERE cr.branch_id = $1
        AND crs.is_active = true
        AND ($4::uuid IS NULL OR cr.cash_register_id = $4)
      ORDER BY crs.opened_at DESC
      LIMIT 1
      ON CONFLICT (sale_id) DO NOTHING
      RETURNING cash_register_sale_id
    `,
    getSalesByBranch: `
      SELECT s.sale_id, s.sale_date, s.total_amount, s.subtotal_amount, s.tax_amount, s.is_completed, b.branch_id, b.branch_name, c.currency_code, c.symbol FROM pos_schema.sale s
      INNER JOIN general_schema.branch b USING(branch_id)
      INNER JOIN general_schema.currency c USING(currency_id)
      WHERE s.branch_id = $1
    `,
    getSaleInfo: `
      SELECT * FROM pos_schema.sale s
      INNER JOIN general_schema.branch b USING(branch_id)
      INNER JOIN general_schema.currency c USING(currency_id)
      INNER JOIN general_schema.tenant_customer t USING(tenant_customer_id)
    `, //Pongan aqui cualquier info que requieran de la venta
    getConditions: `
      SELECT * FROM pos_schema.sale_condition
    `,
  },

  saleItems: {
    getItems: `
      SELECT
        pv.variant_name AS product_name,
        pv.sku,
        si.sale_item_id,
        si.quantity,
        si.unit_price,
        si.total_price,
        si.sale_price_type,
        si.original_price,
        si.discount_applied,
        p.promotion_name
      FROM pos_schema.sale_item si
      INNER JOIN general_schema.product_variant pv
        ON pv.tenant_id = si.tenant_id AND pv.product_variant_id = si.product_variant_id
      LEFT JOIN pos_schema.promotion p ON p.promotion_id = si.promotion_id
      WHERE si.sale_id = $1
    `,
    getItemById: 'SELECT * FROM pos_schema.sale_item WHERE sale_item_id = $1',
    delete:
      'DELETE FROM pos_schema.sale_item WHERE sale_item_id = $1 RETURNING sale_item_id',
  },

  invoice: {
    create: `
      INSERT INTO pos_schema.invoice
        (tenant_customer_id, currency_id, subtotal_amount, tax_amount, total_amount,
         due_date, cash_register_session_id, points_accumulated, ad_message,
         amount_paid, change_amount, invoiced_at, updated_at, sale_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `,
    // Crea las lineas de la factura desde los sale_item de la venta.
    // Espejo del trigger create_invoice (functions/pos/pos_functions.sql):
    // resuelve la tasa via product_variant.product_id -> product.tax_rate_id -> tax_rate.rate_percentage.
    // $1 = invoice_id, $2 = sale_id
    createItemsFromSale: `
      INSERT INTO pos_schema.invoice_item (
        invoice_id, sale_item_id, tenant_id, product_variant_id,
        tax_rate_id, description, quantity, unit_price, subtotal,
        tax_rate_percentage, tax_amount, total_price
      )
      SELECT
        $1,
        si.sale_item_id,
        si.tenant_id,
        si.product_variant_id,
        p.tax_rate_id,
        COALESCE(pv.variant_name, p.product_name, 'Product'),
        si.quantity,
        si.unit_price,
        si.total_price,
        COALESCE(tr.rate_percentage, 0),
        ROUND(si.total_price * COALESCE(tr.rate_percentage, 0) / 100, 2),
        si.total_price + ROUND(si.total_price * COALESCE(tr.rate_percentage, 0) / 100, 2)
      FROM pos_schema.sale_item si
      JOIN general_schema.product_variant pv
        ON si.tenant_id = pv.tenant_id AND si.product_variant_id = pv.product_variant_id
      LEFT JOIN general_schema.product p ON pv.product_id = p.product_id
      LEFT JOIN general_schema.tax_rate tr ON p.tax_rate_id = tr.tax_rate_id
      WHERE si.sale_id = $2
    `,
    getBills: `
      SELECT t.tenant_name, tc.first_name, tc.last_name, tc.document_number, tc.email, i.subtotal_amount, i.total_amount, i.invoiced_at FROM pos_schema.invoice i
      INNER JOIN general_schema.tenant_customer tc USING(tenant_customer_id)
      INNER JOIN general_schema.currency c USING(currency_id)
      INNER JOIN general_schema.tenant t ON t.tenant_id = tc.tenant_id
      WHERE t.tenant_id = $1
    `,
    getCustomerInvoices: `
      SELECT t.tenant_name, tc.first_name, tc.last_name, tc.document_number, tc.email, i.subtotal_amount, i.total_amount, i.invoiced_at FROM pos_schema.invoice i
      INNER JOIN general_schema.tenant_customer tc USING(tenant_customer_id)
      INNER JOIN general_schema.currency c USING(currency_id)
      INNER JOIN general_schema.tenant t ON t.tenant_id = tc.tenant_id
      WHERE t.tenant_id = $1 AND tc.document_number = $2
    `,
    getInvoiceById: `
      SELECT t.tenant_name, tc.first_name, tc.last_name, tc.document_number, tc.email, i.subtotal_amount, i.total_amount, i.invoiced_at FROM pos_schema.invoice i
      INNER JOIN general_schema.tenant_customer tc USING(tenant_customer_id)
      INNER JOIN general_schema.currency c USING(currency_id)
      INNER JOIN general_schema.tenant t ON t.tenant_id = tc.tenant_id
      WHERE i.sale_id = $1
    `,
    getInvoiceBySaleId: `
      SELECT
        i.invoice_id,
        i.subtotal_amount,
        i.tax_amount,
        i.total_amount,
        i.amount_paid,
        i.change_amount,
        i.points_accumulated,
        COALESCE((
          SELECT SUM(cp.points_redeemed)
          FROM pos_schema.customer_payment cp
          WHERE cp.sale_id = i.sale_id AND cp.is_points_redemption = TRUE
        ), 0) AS points_redeemed,
        i.ad_message,
        i.due_date,
        i.invoiced_at,
        tc.first_name,
        tc.last_name,
        tc.document_number,
        tc.email,
        tc.econ_activity AS customer_econ_activity,
        tc.phone AS customer_phone,
        tc.birthdate AS customer_birthdate,
        tc.address AS customer_address,
        cust_it.type_name AS customer_identification_type_name,
        cust_it.ident_code AS customer_identification_type_code,
        t.tenant_name,
        t.identification AS tenant_identification,
        t.econ_activity AS tenant_econ_activity,
        t.sign AS tenant_sign,
        t.contact_email AS tenant_contact_email,
        t.contact_phone AS tenant_contact_phone,
        tnt_it.type_name AS tenant_identification_type_name,
        tnt_it.ident_code AS tenant_identification_type_code,
        b.branch_name,
        b.branch_address,
        s.sale_condition,
        sc.condition_desc AS sale_condition_desc,
        s.sale_date,
        s.seller_user_id,
        seller.email AS seller_email,
        c.currency_code,
        c.symbol AS currency_symbol,
        COALESCE((
          SELECT SUM(si.discount_applied)
          FROM pos_schema.sale_item si
          WHERE si.sale_id = s.sale_id
        ), 0) AS total_discount,
        COALESCE((
          SELECT json_agg(item ORDER BY item_created_at)
          FROM (
            SELECT
              json_build_object(
                'invoice_item_id', dii.invoice_item_id,
                'description', dii.description,
                'sku', pv.sku,
                'variant_name', pv.variant_name,
                'quantity', dii.quantity,
                'unit_price', dii.unit_price,
                'subtotal', dii.subtotal,
                'tax_rate_percentage', dii.tax_rate_percentage,
                'tax_amount', dii.tax_amount,
                'total_price', dii.total_price
              ) AS item,
              dii.created_at AS item_created_at
            FROM pos_schema.invoice_item dii
            LEFT JOIN general_schema.product_variant pv
              ON pv.tenant_id = dii.tenant_id
             AND pv.product_variant_id = dii.product_variant_id
            WHERE dii.invoice_id = i.invoice_id
          ) sub
        ), '[]'::json) AS items,
        COALESCE((
          SELECT json_agg(payment ORDER BY payment_date)
          FROM (
            SELECT
              json_build_object(
                'customer_payment_id', cp.customer_payment_id,
                'payment_method_id', cp.payment_method_id,
                'payment_method_name', pm.name,
                'is_points_redemption', cp.is_points_redemption,
                'points_redeemed', cp.points_redeemed,
                'payment_amount', cp.payment_amount,
                'currency_id', cp.currency_id,
                'currency_code', pcur.currency_code,
                'currency_symbol', pcur.symbol,
                'payment_date', cp.payment_date
              ) AS payment,
              cp.payment_date
            FROM pos_schema.customer_payment cp
            LEFT JOIN general_schema.payment_method pm ON pm.payment_method_id = cp.payment_method_id
            LEFT JOIN general_schema.currency pcur ON pcur.currency_id = cp.currency_id
            WHERE cp.sale_id = s.sale_id
          ) sub
        ), '[]'::json) AS payments
      FROM pos_schema.invoice i
      INNER JOIN pos_schema.sale s ON s.sale_id = i.sale_id
      LEFT JOIN pos_schema.sale_condition sc ON sc.condition_code = s.sale_condition
      LEFT JOIN general_schema.branch b ON b.branch_id = s.branch_id
      LEFT JOIN general_schema.tenant t ON t.tenant_id = b.tenant_id
      LEFT JOIN general_schema.identification_type tnt_it ON tnt_it.identification_type_id = t.identification_type_id
      LEFT JOIN general_schema.tenant_customer tc ON tc.tenant_customer_id = i.tenant_customer_id
      LEFT JOIN general_schema.identification_type cust_it ON cust_it.identification_type_id = tc.identification_type_id
      LEFT JOIN general_schema.currency c ON c.currency_id = i.currency_id
      LEFT JOIN general_schema.users seller ON seller.user_id = s.seller_user_id
      WHERE i.sale_id = $1
      LIMIT 1
    `,
    deleteInvoice:
      'DELETE FROM pos_schema.invoice WHERE invoice_id = $1 RETURNING invoice_id',
    updateAmount: `
    UPDATE pos_schema.invoice SET total_amount = total_amount - $1 WHERE invoice_id = $2
    `,
  },

  returns: {
    newTransaction: `
      INSERT INTO pos_schema.return_transaction (invoice_id, tenant_customer_id, total_refund_amount, refund_method, return_status_id, description, return_date)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))
      RETURNING return_transaction_id, return_date
    `,
    find: `
      SELECT
          rt.return_transaction_id,
          rt.invoice_id,
          rt.tenant_customer_id,
          rt.total_refund_amount,
          rt.refund_method,
          rt.return_status_id,
          rt.description,
          rt.return_date,
          rs.status_name,
          pm.name AS payment_method_name,
          tc.first_name AS customer_first_name,
          tc.last_name  AS customer_last_name,
          tc.document_number AS customer_document
      FROM pos_schema.return_transaction rt
      LEFT JOIN pos_schema.return_status rs ON rs.return_status_id = rt.return_status_id
      LEFT JOIN general_schema.payment_method pm ON pm.payment_method_id = rt.refund_method
      LEFT JOIN general_schema.tenant_customer tc ON tc.tenant_customer_id = rt.tenant_customer_id
      WHERE
          ($1::uuid IS NULL OR rt.invoice_id = $1)
          AND ($2::uuid IS NULL OR rt.tenant_customer_id = $2)
          AND ($3::int IS NULL OR rt.return_status_id = $3)
          AND ($4::int IS NULL OR rt.refund_method = $4)
          AND ($5::timestamp IS NULL OR rt.return_date >= $5)
          AND ($6::timestamp IS NULL OR rt.return_date <= $6)
      ORDER BY rt.return_date DESC`,

    // Full detail of a single return transaction including its products
    getById: `
      SELECT
          rt.return_transaction_id,
          rt.invoice_id,
          rt.tenant_customer_id,
          rt.total_refund_amount,
          rt.refund_method,
          rt.return_status_id,
          rt.description,
          rt.return_date,
          rt.updated_at,
          rs.status_name,
          pm.name AS payment_method_name,
          tc.first_name AS customer_first_name,
          tc.last_name  AS customer_last_name,
          tc.document_number AS customer_document
      FROM pos_schema.return_transaction rt
      LEFT JOIN pos_schema.return_status rs ON rs.return_status_id = rt.return_status_id
      LEFT JOIN general_schema.payment_method pm ON pm.payment_method_id = rt.refund_method
      LEFT JOIN general_schema.tenant_customer tc ON tc.tenant_customer_id = rt.tenant_customer_id
      WHERE rt.return_transaction_id = $1
      LIMIT 1
    `,

    getProducts: `
      SELECT
          rp.return_product_id,
          rp.sale_item_id,
          rp.quantity,
          rp.unit_price,
          rp.total_price,
          pv.variant_name,
          pv.sku
      FROM pos_schema.return_product rp
      LEFT JOIN pos_schema.sale_item si ON si.sale_item_id = rp.sale_item_id
      LEFT JOIN general_schema.product_variant pv
        ON pv.product_variant_id = si.product_variant_id AND pv.tenant_id = si.tenant_id
      WHERE rp.return_transaction_id = $1
      ORDER BY rp.created_at
    `,

    // Get full sale + invoice context for the refund page
    getSaleContext: `
      SELECT
        s.sale_id,
        s.tenant_customer_id,
        s.sale_date,
        s.subtotal_amount,
        s.tax_amount,
        s.total_amount,
        s.is_completed,
        b.branch_id,
        b.branch_name,
        b.tenant_id,
        c.currency_code,
        c.symbol AS currency_symbol,
        tc.first_name,
        tc.last_name,
        tc.document_number,
        tc.email AS customer_email,
        inv.invoice_id,
        inv.invoiced_at AS digital_invoiced_at,
        inv.subtotal_amount AS digital_subtotal,
        inv.tax_amount AS digital_tax,
        inv.total_amount AS digital_total
      FROM pos_schema.sale s
      LEFT JOIN general_schema.branch b ON b.branch_id = s.branch_id
      LEFT JOIN general_schema.currency c ON c.currency_id = s.currency_id
      LEFT JOIN general_schema.tenant_customer tc ON tc.tenant_customer_id = s.tenant_customer_id
      LEFT JOIN pos_schema.invoice inv ON inv.sale_id = s.sale_id
      WHERE s.sale_id = $1
      LIMIT 1
    `,

    // Get sale items joined with the invoice items (for partial refund UI)
    getSaleItemsForRefund: `
      SELECT
        si.sale_item_id,
        si.product_variant_id,
        si.quantity AS available_quantity,
        si.unit_price,
        si.total_price,
        pv.sku,
        pv.variant_name,
        dii.invoice_item_id,
        dii.tax_amount AS digital_tax_amount,
        dii.total_price AS digital_line_total
      FROM pos_schema.sale_item si
      INNER JOIN general_schema.product_variant pv
        ON pv.tenant_id = si.tenant_id
        AND pv.product_variant_id = si.product_variant_id
      LEFT JOIN pos_schema.invoice_item dii
        ON dii.sale_item_id = si.sale_item_id
      WHERE si.sale_id = $1
      ORDER BY si.created_at
    `,

    markSaleRefunded: `
      UPDATE pos_schema.sale
      SET is_refunded = true, updated_at = NOW()
      WHERE sale_id = $1
      RETURNING sale_id, is_refunded
    `,

    // Full refund: delete the invoice record
    deleteInvoiceBySaleId: `
      DELETE FROM pos_schema.invoice
      WHERE sale_id = $1
      RETURNING invoice_id
    `,
  },

  cashRegister: {
    all: `
    SELECT cr.*, b.branch_name FROM pos_schema.cash_register cr
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    `,
    allPaginated: `
    SELECT cr.*, b.branch_name FROM pos_schema.cash_register cr
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    WHERE ($1::uuid IS NULL OR cr.branch_id = $1)
      AND ($2::boolean IS NULL OR cr.is_active = $2)
    ORDER BY b.branch_name, cr.register_name
    LIMIT $3 OFFSET $4
    `,
    countPaginated: `
    SELECT COUNT(*)::int AS total FROM pos_schema.cash_register cr
    WHERE ($1::uuid IS NULL OR cr.branch_id = $1)
      AND ($2::boolean IS NULL OR cr.is_active = $2)
    `,
    byId: `
    SELECT cr.*, b.branch_name FROM pos_schema.cash_register cr
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    WHERE cr.cash_register_id = $1 LIMIT 1
    `,
    byBranch: `
    SELECT cr.*, b.branch_name FROM pos_schema.cash_register cr
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    WHERE cr.branch_id = $1
    `,
    /**
     * Returns the plain-text key for a cash register. Used by the service to
     * validate non-admin open/close attempts. Returns NULL if the register has
     * no key configured (in which case any user may open/close).
     */
    getKey: `
    SELECT cash_register_key FROM pos_schema.cash_register WHERE cash_register_id = $1 LIMIT 1
    `,
    create: `
    INSERT INTO pos_schema.cash_register (branch_id, register_name, is_active, cash_register_key, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *
    `,
    delete: `
    DELETE FROM pos_schema.cash_register WHERE cash_register_id = $1 RETURNING *
    `,
    update: `
    UPDATE pos_schema.cash_register
       SET branch_id = COALESCE($2, branch_id),
           register_name = COALESCE($3, register_name),
           is_active = COALESCE($4, is_active),
           cash_register_key = COALESCE($5, cash_register_key),
           updated_at = NOW()
     WHERE cash_register_id = $1 RETURNING *
    `,
    /**
     * Returns the cash_register_id that owns a given session. Used to look up
     * the configured key when validating a close attempt.
     */
    getRegisterIdForSession: `
    SELECT cash_register_id FROM pos_schema.cash_register_session WHERE cash_register_session_id = $1 LIMIT 1
    `,
    startSession: `
    INSERT INTO pos_schema.cash_register_session (cash_register_id, opened_at, opening_amount, user_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *
    `,
    getSessionById: `
    SELECT
      crs.*,
      cr.register_name,
      b.branch_name,
      e.first_name AS user_first_name,
      e.last_name AS user_last_name
    FROM pos_schema.cash_register_session crs
    INNER JOIN pos_schema.cash_register cr ON cr.cash_register_id = crs.cash_register_id
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    LEFT JOIN hr_schema.employee e ON e.user_id = crs.user_id
    WHERE crs.cash_register_session_id = $1
    LIMIT 1
    `,
    getSessionsByCashRegister: `
    SELECT * FROM pos_schema.cash_register_session WHERE cash_register_id = $1 ORDER BY opened_at DESC
    `,
    findSessions: `
      SELECT
        crs.cash_register_session_id,
        crs.cash_register_id,
        crs.user_id,
        crs.opened_at,
        crs.closed_at,
        crs.opening_amount,
        crs.closing_amount,
        crs.is_active,
        crs.created_at,
        crs.updated_at,
        crs.cash_sales_amount,
        crs.debit_sales_amount,
        crs.credit_sales_amount,
        crs.transfer_sales_amount,
        crs.points_sales_amount,
        crs.user_cash_amount,
        crs.user_debit_amount,
        crs.user_credit_amount,
        crs.user_transfer_amount,
        crs.total_sales_amount,
        crs.mismatch,
        crs.mismatch_amount,
        crs.mismatch_type,
        cr.register_name,
        cr.branch_id,
        b.branch_name,
        b.tenant_id,
        e.first_name AS user_first_name,
        e.last_name AS user_last_name
      FROM pos_schema.cash_register_session crs
      INNER JOIN pos_schema.cash_register cr ON cr.cash_register_id = crs.cash_register_id
      INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
      LEFT JOIN hr_schema.employee e ON e.user_id = crs.user_id
      WHERE b.tenant_id = $1
        AND ($2::uuid IS NULL OR cr.branch_id = $2)
        AND ($3::boolean IS NULL OR crs.is_active = $3)
      ORDER BY crs.opened_at DESC
    `,
    closeSession: `
      SELECT * FROM pos_schema.close_cash_register_session(
        $1::uuid, 
        $2::numeric,
        $3::numeric,
        $4::numeric,
        $5::numeric,
        $6::numeric
      )
    `,
    getSessionGroupSales: `
      SELECT tenant_product_group_id, group_name, total_amount
      FROM pos_schema.session_group_sales
      WHERE cash_register_session_id = $1
      ORDER BY total_amount DESC
    `,
    getSessionPaymentMethodSales: `
      SELECT spms.payment_method_id, pm.name AS payment_method_name, spms.total_amount
      FROM pos_schema.session_payment_method_sales spms
      INNER JOIN general_schema.payment_method pm ON pm.payment_method_id = spms.payment_method_id
      WHERE spms.cash_register_session_id = $1
      ORDER BY spms.total_amount DESC
    `,
    registerTransaction: `
    INSERT INTO cash_register_sale_transaction (cash_register_session_id, amount, transaction_time, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *
    `,
  },

  promotions: {
    getPromos: `
      SELECT
        p.promotion_id,
        p.tenant_id,
        p.promotion_name,
        p.promotion_code,
        p.promotion_description,
        p.promotion_type_id,
        p.is_universal,
        COALESCE((
          SELECT json_agg(pcs.customer_segment_id ORDER BY pcs.customer_segment_id)
          FROM pos_schema.promotion_customer_segment pcs
          WHERE pcs.promotion_id = p.promotion_id
        ), '[]'::json) AS customer_segment_ids,
        COALESCE((
          SELECT json_agg(cs.segment_name ORDER BY cs.segment_name)
          FROM pos_schema.promotion_customer_segment pcs
          JOIN general_schema.customer_segment cs USING(customer_segment_id)
          WHERE pcs.promotion_id = p.promotion_id
        ), '[]'::json) AS segment_names,
        p.promotion_start_date,
        p.promotion_end_date,
        pt.type_name,
        p.is_active,
        p.is_default,
        p.is_stackable,
        p.created_at,
        p.updated_at
      FROM pos_schema.promotion p
      INNER JOIN pos_schema.promotion_type pt USING(promotion_type_id)
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC
    `,
    getPromoInfo: `
      SELECT
        p.promotion_id,
        p.tenant_id,
        p.promotion_name,
        p.promotion_code,
        p.promotion_description,
        p.promotion_type_id,
        p.is_universal,
        COALESCE((
          SELECT json_agg(pcs.customer_segment_id ORDER BY pcs.customer_segment_id)
          FROM pos_schema.promotion_customer_segment pcs
          WHERE pcs.promotion_id = p.promotion_id
        ), '[]'::json) AS customer_segment_ids,
        COALESCE((
          SELECT json_agg(cs.segment_name ORDER BY cs.segment_name)
          FROM pos_schema.promotion_customer_segment pcs
          JOIN general_schema.customer_segment cs USING(customer_segment_id)
          WHERE pcs.promotion_id = p.promotion_id
        ), '[]'::json) AS segment_names,
        p.promotion_start_date,
        p.promotion_end_date,
        pt.type_name,
        p.is_active,
        p.is_default,
        p.is_stackable,
        p.created_at,
        p.updated_at
      FROM pos_schema.promotion p
      INNER JOIN pos_schema.promotion_type pt USING(promotion_type_id)
      WHERE p.promotion_id = $1 LIMIT 1
    `,
    getPromotionRules: `
      SELECT *
      FROM pos_schema.promotion_rule
      WHERE promotion_id = $1
      ORDER BY tier_level NULLS FIRST, created_at
    `,
    insertPromo: `
      INSERT INTO pos_schema.promotion (tenant_id, promotion_name, promotion_code, promotion_description, promotion_type_id, is_universal, promotion_start_date, promotion_end_date, is_active, is_default, is_stackable)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), $7, $8, $9, COALESCE($10, false), COALESCE($11, true))
      RETURNING promotion_id
    `,
    insertPromoSegment: `
      INSERT INTO pos_schema.promotion_customer_segment (promotion_id, customer_segment_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `,
    deletePromoSegments: `
      DELETE FROM pos_schema.promotion_customer_segment WHERE promotion_id = $1
    `,
    deletePromoRules: `
      DELETE FROM pos_schema.promotion_rule WHERE promotion_id = $1
    `,
    deletePromo:
      'DELETE FROM pos_schema.promotion WHERE promotion_id = $1 RETURNING promotion_id',
    updatePromo: `
      UPDATE pos_schema.promotion
      SET tenant_id = COALESCE($2, tenant_id),
          promotion_name = COALESCE($3, promotion_name),
          promotion_code = COALESCE($4, promotion_code),
          promotion_description = COALESCE($5, promotion_description),
          promotion_type_id = COALESCE($6, promotion_type_id),
          is_universal = COALESCE($7, is_universal),
          promotion_start_date = COALESCE($8, promotion_start_date),
          promotion_end_date = COALESCE($9, promotion_end_date),
          is_active = COALESCE($10, is_active),
          is_default = COALESCE($11, is_default),
          is_stackable = COALESCE($12, is_stackable),
          updated_at = NOW()
      WHERE promotion_id = $1
      RETURNING promotion_id, tenant_id
    `,
    /**
     * Active default promotions for a tenant on the current date. Pre-loads rules
     * and targets so the frontend can pre-apply them when creating a sale.
     */
    getActiveDefaults: `
      SELECT
        p.promotion_id,
        p.tenant_id,
        p.promotion_name,
        p.promotion_code,
        p.promotion_description,
        p.promotion_type_id,
        pt.type_name,
        p.is_universal,
        COALESCE((
          SELECT json_agg(pcs.customer_segment_id ORDER BY pcs.customer_segment_id)
          FROM pos_schema.promotion_customer_segment pcs
          WHERE pcs.promotion_id = p.promotion_id
        ), '[]'::json) AS customer_segment_ids,
        p.promotion_start_date,
        p.promotion_end_date,
        p.is_active,
        p.is_default,
        p.is_stackable,
        COALESCE((
          SELECT json_agg(pr.* ORDER BY pr.tier_level NULLS FIRST, pr.created_at)
          FROM pos_schema.promotion_rule pr
          WHERE pr.promotion_id = p.promotion_id
        ), '[]'::json) AS rules,
        COALESCE((
          SELECT json_agg(json_build_object(
            'promotion_target_id', pgt.promotion_target_id,
            'target_type', pgt.target_type,
            'target_product_variant_id', pgt.target_product_variant_id,
            'target_group_id', pgt.target_group_id
          ))
          FROM pos_schema.promotion_target pgt
          WHERE pgt.promotion_id = p.promotion_id
        ), '[]'::json) AS targets
      FROM pos_schema.promotion p
      INNER JOIN pos_schema.promotion_type pt USING(promotion_type_id)
      WHERE p.tenant_id = $1
        AND p.is_active = TRUE
        AND p.is_default = TRUE
        AND CURRENT_DATE BETWEEN p.promotion_start_date AND p.promotion_end_date
      ORDER BY p.created_at DESC
    `,
    getAnalytics: `
      WITH filtered_items AS (
        SELECT
          si.promotion_id,
          si.sale_id,
          si.discount_applied,
          si.total_price,
          s.currency_id
        FROM pos_schema.sale_item si
        INNER JOIN pos_schema.sale s ON s.sale_id = si.sale_id
        WHERE s.is_completed = TRUE
          AND s.sale_date >= CURRENT_TIMESTAMP - $2::interval
          AND ($4::uuid IS NULL OR s.branch_id = $4::uuid)
          AND si.promotion_id IS NOT NULL
      )
      SELECT
        p.promotion_id,
        p.promotion_name,
        p.promotion_code,
        p.is_active,
        pt.type_name AS promotion_type,
        COALESCE(fi.currency_id, 1) AS currency_id,
        COUNT(DISTINCT fi.sale_id)::text AS sale_count,
        COALESCE(SUM(fi.discount_applied), 0)::text AS total_discount,
        COALESCE(SUM(fi.total_price), 0)::text AS total_revenue
      FROM pos_schema.promotion p
      INNER JOIN pos_schema.promotion_type pt ON pt.promotion_type_id = p.promotion_type_id
      LEFT JOIN filtered_items fi ON fi.promotion_id = p.promotion_id
      WHERE p.tenant_id = $1
        AND ($3::boolean IS NULL OR p.is_active = $3)
      GROUP BY
        p.promotion_id, p.promotion_name, p.promotion_code, p.is_active, pt.type_name,
        COALESCE(fi.currency_id, 1)
      ORDER BY SUM(fi.discount_applied) DESC NULLS LAST
    `,
  },

  promotionTypes: {
    getPromoTypes: `
      SELECT * FROM pos_schema.promotion_type
    `,
  },

  promotionTarget: {
    byPromotion: `
      SELECT pt.promotion_target_id, pt.promotion_id, pt.tenant_id, pt.target_type,
             pt.target_product_variant_id, pt.target_group_id,
             pv.sku AS variant_sku, pv.variant_name,
             g.group_name, g.tenant_product_group_type_id,
             gt.type_name
      FROM pos_schema.promotion_target pt
      LEFT JOIN general_schema.product_variant pv
        ON pv.tenant_id = pt.tenant_id AND pv.product_variant_id = pt.target_product_variant_id
      LEFT JOIN general_schema.tenant_product_group g
        ON g.tenant_id = pt.tenant_id AND g.tenant_product_group_id = pt.target_group_id
      LEFT JOIN general_schema.tenant_product_group_type gt
        ON gt.tenant_id = g.tenant_id AND gt.tenant_product_group_type_id = g.tenant_product_group_type_id
      WHERE pt.promotion_id = $1
    `,
    deleteForPromotion: `
      DELETE FROM pos_schema.promotion_target WHERE promotion_id = $1
    `,
    insertVariantTarget: `
      INSERT INTO pos_schema.promotion_target
        (promotion_id, tenant_id, target_type, target_product_variant_id, target_group_id)
      VALUES ($1, $2, 'VARIANT', $3, NULL)
      RETURNING *
    `,
    insertGroupTarget: `
      INSERT INTO pos_schema.promotion_target
        (promotion_id, tenant_id, target_type, target_product_variant_id, target_group_id)
      VALUES ($1, $2, 'GROUP', NULL, $3)
      RETURNING *
    `,
    /**
     * Returns promotions applicable to a given variant: matches direct VARIANT
     * targets and GROUP targets where the variant is assigned to the target
     * group or any of its descendants. Filtered by active status and date.
     */
    getApplicableToVariant: `
      WITH RECURSIVE
      variant_groups AS (
        SELECT a.tenant_product_group_id
        FROM general_schema.product_variant_group_assignment a
        WHERE a.tenant_id = $1 AND a.product_variant_id = $2
      ),
      ancestor_groups(node) AS (
        SELECT g.tenant_product_group_id
        FROM general_schema.tenant_product_group g
        WHERE g.tenant_id = $1
          AND g.tenant_product_group_id IN (SELECT tenant_product_group_id FROM variant_groups)
        UNION
        SELECT pg.parent_group_id
        FROM general_schema.tenant_product_group pg
        JOIN ancestor_groups ag ON ag.node = pg.tenant_product_group_id
        WHERE pg.tenant_id = $1 AND pg.parent_group_id IS NOT NULL
      )
      SELECT DISTINCT p.promotion_id, p.promotion_name, p.promotion_code,
             p.promotion_type_id, p.customer_segment_id,
             p.promotion_start_date, p.promotion_end_date, p.is_active,
             p.is_default, p.is_stackable,
             pt.target_type, pt.target_product_variant_id, pt.target_group_id
      FROM pos_schema.promotion p
      JOIN pos_schema.promotion_target pt ON pt.promotion_id = p.promotion_id
      WHERE p.tenant_id = $1
        AND p.is_active = TRUE
        AND CURRENT_DATE BETWEEN p.promotion_start_date AND p.promotion_end_date
        AND (
          (pt.target_type = 'VARIANT' AND pt.target_product_variant_id = $2)
          OR (pt.target_type = 'GROUP' AND pt.target_group_id IN (SELECT node FROM ancestor_groups))
        )
    `,
  },

  loyaltyScore: {
    getActiveProgramForTenant: `
      SELECT loyalty_program_id, points_earned_per_currency_unit, minimum_purchase_for_points
      FROM pos_schema.loyalty_program
      WHERE tenant_id = $1 AND is_active = true
      LIMIT 1
    `,
    upsertEarned: `
      INSERT INTO pos_schema.tenant_customer_score (tenant_id, tenant_customer_id, score, lifetime_score, score_redeemed, last_earned_at)
      VALUES ($1, $2, $3, $3, 0, NOW())
      ON CONFLICT (tenant_customer_id, tenant_id) DO UPDATE
        SET score = tenant_customer_score.score + $3,
            lifetime_score = tenant_customer_score.lifetime_score + $3,
            last_earned_at = NOW(),
            updated_at = NOW()
    `,
    deductRedeemed: `
      UPDATE pos_schema.tenant_customer_score
      SET score = score - $3,
          score_redeemed = score_redeemed + $3,
          last_redeemed_at = NOW(),
          updated_at = NOW()
      WHERE tenant_id = $1 AND tenant_customer_id = $2 AND score >= $3
    `,
    getScore: `
      SELECT score, lifetime_score, score_redeemed
      FROM pos_schema.tenant_customer_score
      WHERE tenant_id = $1 AND tenant_customer_id = $2
      LIMIT 1
    `,
  },

  loyaltyProgram: {
    create: `
      INSERT INTO pos_schema.loyalty_program (tenant_id, points_earned_per_currency_unit, points_redeemed_per_currency_unit, minimum_purchase_for_points, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `,
    all: `
      SELECT * FROM pos_schema.loyalty_program WHERE tenant_id = $1
    `,
    delete: `
      DELETE FROM pos_schema.loyalty_program WHERE loyalty_program_id = $1 RETURNING loyalty_program_id
    `,
    byId: `
      SELECT * FROM pos_schema.loyalty_program WHERE loyalty_program_id = $1 LIMIT 1
    `,
    update: `
      UPDATE pos_schema.loyalty_program
      SET
        points_earned_per_currency_unit = COALESCE($2, points_earned_per_currency_unit),
        points_redeemed_per_currency_unit = COALESCE($3, points_redeemed_per_currency_unit),
        minimum_purchase_for_points = COALESCE($4, minimum_purchase_for_points),
        is_active = COALESCE($5, is_active),
        updated_at = NOW()
      WHERE loyalty_program_id = $1
      RETURNING loyalty_program_id
    `,
  },

  creditDebitNote: {
    // Contexto de la factura + saldo pendiente (si tiene AR) para validar
    // que un credito no exceda lo que aun se debe.
    getInvoiceContext: `
      SELECT
        i.invoice_id,
        i.total_amount,
        i.tenant_customer_id,
        s.sale_id,
        s.branch_id,
        b.tenant_id,
        sar.sale_account_receivable_id,
        ar.account_receivable_id,
        ar.subtotal,
        COALESCE(sar.tax_amount, 0) AS ar_tax_amount,
        ar.amount_paid
      FROM pos_schema.invoice i
      JOIN pos_schema.sale s ON s.sale_id = i.sale_id
      JOIN general_schema.branch b ON b.branch_id = s.branch_id
      LEFT JOIN pos_schema.sale_account_receivable sar ON sar.sale_id = s.sale_id
      LEFT JOIN general_schema.account_receivable ar ON ar.account_receivable_id = sar.account_receivable_id
      WHERE i.invoice_id = $1
      LIMIT 1
    `,
    // Notas activas (no anuladas) de una factura, para calcular el saldo
    // neto ya ajustado antes de aceptar una nueva.
    sumActiveByInvoice: `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE note_type = 'credit'), 0) AS total_credit,
        COALESCE(SUM(amount) FILTER (WHERE note_type = 'debit'), 0) AS total_debit
      FROM pos_schema.credit_debit_note
      WHERE invoice_id = $1 AND is_voided = FALSE
    `,
    create: `
      INSERT INTO pos_schema.credit_debit_note
        (tenant_id, invoice_id, note_type, reason_kind, description, amount, currency_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING note_id, note_number, tenant_id, invoice_id, note_type, reason_kind,
        description, amount, currency_id, is_voided, created_at
    `,
    listByInvoice: `
      SELECT note_id, note_number, invoice_id, note_type, reason_kind, description,
        amount, currency_id, is_voided, voided_at, created_by, created_at
      FROM pos_schema.credit_debit_note
      WHERE invoice_id = $1
      ORDER BY created_at DESC
    `,
    listByTenant: `
      SELECT
        cdn.note_id, cdn.note_number, cdn.invoice_id, cdn.note_type, cdn.reason_kind,
        cdn.description, cdn.amount, cdn.currency_id, cdn.is_voided, cdn.voided_at,
        cdn.created_at,
        s.sale_id,
        (tc.first_name || ' ' || tc.last_name) AS customer_name
      FROM pos_schema.credit_debit_note cdn
      JOIN pos_schema.invoice i ON i.invoice_id = cdn.invoice_id
      JOIN pos_schema.sale s ON s.sale_id = i.sale_id
      LEFT JOIN general_schema.tenant_customer tc ON tc.tenant_customer_id = i.tenant_customer_id
      WHERE cdn.tenant_id = $1
      ORDER BY cdn.created_at DESC
    `,
    getById: `
      SELECT note_id, tenant_id, invoice_id, note_type, amount, is_voided
      FROM pos_schema.credit_debit_note
      WHERE note_id = $1
      LIMIT 1
    `,
    void: `
      UPDATE pos_schema.credit_debit_note
      SET is_voided = TRUE, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE note_id = $1 AND is_voided = FALSE
      RETURNING note_id, note_number, tenant_id, invoice_id, note_type, reason_kind,
        description, amount, currency_id, is_voided, voided_at, created_by, created_at
    `,
  },
};

export const posQueries = createQueries(posQueryDefs);

export const bulkItems = [
  'sale_id',
  'tenant_id',
  'product_id',
  'quantity',
  'unit_price',
  'total_price',
];

export const bulkReturns = [
  'return_transaction_id',
  'quantity',
  'unit_price',
  'total_price',
  'sale_item_id',
];
