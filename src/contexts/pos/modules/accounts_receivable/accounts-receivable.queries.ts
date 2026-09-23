const accountReceivableListSelect = `
  SELECT
    sar.sale_account_receivable_id,
    sar.sale_id,
    sar.account_receivable_status,
    ars.status_name AS account_receivable_status_name,
    ar.account_receivable_id,
    ar.tenant_id,
    ar.tenant_customer_id,
    (tc.first_name || ' ' || tc.last_name) AS customer_name,
    tc.document_number AS customer_document,
    ar.due_date,
    ar.subtotal,
    COALESCE(sar.tax_amount, 0) AS tax_amount,
    (ar.subtotal + COALESCE(sar.tax_amount, 0)) AS total_amount,
    ar.amount_paid,
    GREATEST((ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid, 0) AS balance_due,
    ar.is_paid,
    COUNT(sc.sale_collection_id)::INTEGER AS collection_count,
    MAX(sc.payment_date) AS last_collection_date,
    sar.created_at,
    sar.updated_at
  FROM pos_schema.sale_account_receivable sar
  JOIN general_schema.account_receivable ar
    ON ar.account_receivable_id = sar.account_receivable_id
  LEFT JOIN general_schema.account_receivable_status ars
    ON ars.status_id = sar.account_receivable_status
  LEFT JOIN general_schema.tenant_customer tc
    ON tc.tenant_customer_id = ar.tenant_customer_id
  LEFT JOIN pos_schema.sale_collection sc
    ON sc.sale_account_receivable_id = sar.sale_account_receivable_id
`;

export const accountsReceivableQueries = {
  ar: {
    getAllByTenant: `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM (
        ${accountReceivableListSelect}
        WHERE ar.tenant_id = $1
        GROUP BY
          sar.sale_account_receivable_id, sar.sale_id, sar.account_receivable_status,
          ars.status_name, ar.account_receivable_id, ar.tenant_id, ar.tenant_customer_id,
          tc.first_name, tc.last_name, tc.document_number,
          ar.due_date, ar.subtotal, sar.tax_amount, ar.amount_paid, ar.is_paid,
          sar.created_at, sar.updated_at
      ) receivables
      ORDER BY created_at DESC, due_date DESC
      LIMIT $2 OFFSET $3
    `,

    getAllGlobal: `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM (
        ${accountReceivableListSelect}
        GROUP BY
          sar.sale_account_receivable_id, sar.sale_id, sar.account_receivable_status,
          ars.status_name, ar.account_receivable_id, ar.tenant_id, ar.tenant_customer_id,
          tc.first_name, tc.last_name, tc.document_number,
          ar.due_date, ar.subtotal, sar.tax_amount, ar.amount_paid, ar.is_paid,
          sar.created_at, sar.updated_at
      ) receivables
      ORDER BY created_at DESC, due_date DESC
      LIMIT $1 OFFSET $2
    `,

    getUpdatedReceivableById: `
      SELECT
        sar.sale_account_receivable_id,
        sar.sale_id,
        sar.account_receivable_status,
        ars.status_name AS account_receivable_status_name,
        ar.account_receivable_id,
        ar.due_date,
        ar.subtotal,
        COALESCE(sar.tax_amount, 0) AS tax_amount,
        (ar.subtotal + COALESCE(sar.tax_amount, 0)) AS total_amount,
        ar.amount_paid,
        GREATEST((ar.subtotal + COALESCE(sar.tax_amount, 0)) - ar.amount_paid, 0) AS balance_due,
        ar.is_paid,
        sar.updated_at
      FROM pos_schema.sale_account_receivable sar
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      LEFT JOIN general_schema.account_receivable_status ars
        ON ars.status_id = sar.account_receivable_status
      WHERE sar.sale_account_receivable_id = $1
      LIMIT 1
    `,
  },

  collections: {
    insertCollection: `
      INSERT INTO pos_schema.sale_collection
        (sale_account_receivable_id, amount_paid, payment_method_id, currency_id,
         original_amount, exchange_rate, payment_reference)
      VALUES
        ($1::UUID,
         $2::NUMERIC,
         $3::INTEGER,
         COALESCE($4::INTEGER, 1),
         COALESCE($5::NUMERIC, $2::NUMERIC),
         COALESCE($6::NUMERIC, 1),
         $7::TEXT)
      RETURNING sale_collection_id
    `,

    backfillMissingInitialCollection: `
      INSERT INTO pos_schema.sale_collection
        (sale_account_receivable_id, amount_paid, payment_method_id, currency_id,
         original_amount, exchange_rate, notes, payment_date)
      SELECT
        sar.sale_account_receivable_id,
        ar.amount_paid - COALESCE((
          SELECT SUM(sc.amount_paid)
          FROM pos_schema.sale_collection sc
          WHERE sc.sale_account_receivable_id = sar.sale_account_receivable_id
        ), 0) AS missing_amount,
        1,
        1,
        ar.amount_paid - COALESCE((
          SELECT SUM(sc.amount_paid)
          FROM pos_schema.sale_collection sc
          WHERE sc.sale_account_receivable_id = sar.sale_account_receivable_id
        ), 0),
        1,
        'Abono inicial migrado (registrado al crear la venta)',
        sar.created_at
      FROM pos_schema.sale_account_receivable sar
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      WHERE sar.sale_account_receivable_id = $1
        AND (ar.amount_paid - COALESCE((
              SELECT SUM(sc.amount_paid)
              FROM pos_schema.sale_collection sc
              WHERE sc.sale_account_receivable_id = sar.sale_account_receivable_id
            ), 0)) > 0.01
    `,

    recalcReceivableTotals: `
      WITH paid AS (
        SELECT COALESCE(SUM(sc.amount_paid), 0) AS total_paid
        FROM pos_schema.sale_collection sc
        WHERE sc.sale_account_receivable_id = $1
      ),
      target AS (
        SELECT
          sar.account_receivable_id,
          (ar.subtotal + COALESCE(sar.tax_amount, 0)) AS amount_due
        FROM pos_schema.sale_account_receivable sar
        JOIN general_schema.account_receivable ar
          ON ar.account_receivable_id = sar.account_receivable_id
        WHERE sar.sale_account_receivable_id = $1
      ),
      upd_ar AS (
        UPDATE general_schema.account_receivable ar
        SET amount_paid = paid.total_paid,
            is_paid     = (paid.total_paid >= target.amount_due - 0.01),
            updated_at  = CURRENT_TIMESTAMP
        FROM paid, target
        WHERE ar.account_receivable_id = target.account_receivable_id
        RETURNING ar.account_receivable_id, ar.is_paid
      )
      UPDATE pos_schema.sale_account_receivable sar
      SET account_receivable_status = CASE
            WHEN upd_ar.is_paid THEN 3
            WHEN (SELECT total_paid FROM paid) > 0 THEN 2
            ELSE 1
          END,
          updated_at = CURRENT_TIMESTAMP
      FROM upd_ar
      WHERE sar.sale_account_receivable_id = $1
    `,

    updateCollection: `
      UPDATE pos_schema.sale_collection
      SET amount_paid       = $1::NUMERIC,
          payment_method_id = $2::INTEGER,
          currency_id       = $3::INTEGER,
          payment_reference = $4::TEXT,
          original_amount   = COALESCE($6::NUMERIC, original_amount),
          exchange_rate     = COALESCE($7::NUMERIC, exchange_rate),
          updated_at        = CURRENT_TIMESTAMP
      WHERE sale_collection_id = $5::UUID
      RETURNING *
    `,

    getReceivableAccess: `
      SELECT
        sar.sale_account_receivable_id,
        sar.sale_id,
        ar.tenant_id
      FROM pos_schema.sale_account_receivable sar
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      WHERE sar.sale_account_receivable_id = $1
      LIMIT 1
    `,

    getCollectionAccess: `
      SELECT
        sc.sale_collection_id,
        ar.tenant_id,
        sar.sale_id,
        sar.sale_account_receivable_id
      FROM pos_schema.sale_collection sc
      JOIN pos_schema.sale_account_receivable sar
        ON sar.sale_account_receivable_id = sc.sale_account_receivable_id
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      WHERE sc.sale_collection_id = $1
      LIMIT 1
    `,
  },

  apartado: {
    getARTypeAndSaleInfo: `
      SELECT
        art.type_name,
        sar.sale_id,
        ar.is_paid,
        ar.tenant_id,
        ar.tenant_customer_id,
        s.branch_id,
        (ar.subtotal + COALESCE(sar.tax_amount, 0)) AS total_amount
      FROM pos_schema.sale_account_receivable sar
      JOIN general_schema.account_receivable ar
        ON ar.account_receivable_id = sar.account_receivable_id
      JOIN general_schema.account_receivable_type art
        ON art.account_receivable_type_id = ar.account_receivable_type_id
      JOIN pos_schema.sale s ON s.sale_id = sar.sale_id
      WHERE sar.sale_account_receivable_id = $1
      LIMIT 1
    `,

    completeCreditSale: `
      UPDATE pos_schema.sale
      SET is_completed = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE sale_id = $1 AND is_completed = FALSE
    `,

    getSaleItems: `
      SELECT
        product_variant_id,
        quantity,
        unit_price,
        total_price
      FROM pos_schema.sale_item
      WHERE sale_id = $1
    `,

    completeSale: `
      UPDATE pos_schema.sale
      SET is_completed = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE sale_id = $1
    `,
  },

  catalog: {
    getReceivableStatuses: `
      SELECT status_id, status_name, description
      FROM general_schema.account_receivable_status
      ORDER BY status_id ASC
    `,

    getPaymentMethods: `
      SELECT payment_method_id, name, description
      FROM general_schema.payment_method
      ORDER BY payment_method_id ASC
    `,

    getCurrencies: `
      SELECT currency_id, currency_code, currency_name, symbol
      FROM general_schema.currency
      ORDER BY currency_id ASC
    `,
  },
};
