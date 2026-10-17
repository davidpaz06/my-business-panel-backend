export const accountingQueries = {
  // -------------------------------------------------------
  // CHART OF ACCOUNTS
  // -------------------------------------------------------

  getAccountsByTenant: `
    SELECT
      a.account_id,
      a.tenant_id,
      a.account_code,
      a.account_name,
      a.account_type_id,
      at.type_name,
      at.nature,
      a.parent_account_id,
      p.account_code AS parent_code,
      p.account_name AS parent_name,
      a.cost_center_id,
      cc.center_name,
      a.is_active,
      a.is_system,
      a.allows_transactions,
      a.created_at,
      a.updated_at
    FROM accounting_schema.chart_of_accounts a
    INNER JOIN accounting_schema.account_type at ON at.account_type_id = a.account_type_id
    LEFT JOIN accounting_schema.chart_of_accounts p ON p.account_id = a.parent_account_id
    LEFT JOIN accounting_schema.cost_center cc ON cc.cost_center_id = a.cost_center_id
    WHERE a.tenant_id = $1
    ORDER BY a.account_code
  `,

  getAccountById: `
    SELECT
      a.account_id,
      a.tenant_id,
      a.account_code,
      a.account_name,
      a.account_type_id,
      at.type_name,
      at.nature,
      a.parent_account_id,
      p.account_code AS parent_code,
      p.account_name AS parent_name,
      a.cost_center_id,
      cc.center_name,
      a.is_active,
      a.is_system,
      a.allows_transactions,
      a.created_at,
      a.updated_at
    FROM accounting_schema.chart_of_accounts a
    INNER JOIN accounting_schema.account_type at ON at.account_type_id = a.account_type_id
    LEFT JOIN accounting_schema.chart_of_accounts p ON p.account_id = a.parent_account_id
    LEFT JOIN accounting_schema.cost_center cc ON cc.cost_center_id = a.cost_center_id
    WHERE a.account_id = $1 AND a.tenant_id = $2
    LIMIT 1
  `,

  createAccount: `
    INSERT INTO accounting_schema.chart_of_accounts
      (tenant_id, account_code, account_name, account_type_id, parent_account_id, cost_center_id, allows_transactions)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING account_id
  `,

  updateAccount: `
    UPDATE accounting_schema.chart_of_accounts
    SET
      account_name = COALESCE($3, account_name),
      is_active = COALESCE($4, is_active),
      cost_center_id = COALESCE($5, cost_center_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE account_id = $1 AND tenant_id = $2 AND is_system = FALSE
    RETURNING account_id
  `,

  getAccountTypes: `
    SELECT * FROM accounting_schema.account_type ORDER BY account_type_id
  `,

  provisionTenantAccounts: `
    SELECT accounting_schema.provision_tenant_accounts($1) AS accounts_created
  `,

  // -------------------------------------------------------
  // COST CENTERS
  // -------------------------------------------------------

  getCostCentersByTenant: `
    SELECT * FROM accounting_schema.cost_center
    WHERE tenant_id = $1
    ORDER BY center_code
  `,

  getCostCenterById: `
    SELECT * FROM accounting_schema.cost_center
    WHERE cost_center_id = $1 AND tenant_id = $2
    LIMIT 1
  `,

  createCostCenter: `
    INSERT INTO accounting_schema.cost_center (tenant_id, center_code, center_name)
    VALUES ($1, $2, $3)
    RETURNING *
  `,

  updateCostCenter: `
    UPDATE accounting_schema.cost_center
    SET
      center_name = COALESCE($3, center_name),
      is_active = COALESCE($4, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE cost_center_id = $1 AND tenant_id = $2
    RETURNING *
  `,

  // -------------------------------------------------------
  // JOURNAL ENTRIES
  // -------------------------------------------------------

  getJournalEntriesByTenant: `
    SELECT
      je.entry_id,
      je.tenant_id,
      je.entry_number,
      je.source_type_id,
      st.source_name,
      je.source_id,
      je.entry_date,
      je.description,
      je.status_id,
      jes.status_name,
      je.total_debit,
      je.total_credit,
      je.created_by,
      je.created_at,
      je.updated_at
    FROM accounting_schema.journal_entry je
    INNER JOIN accounting_schema.source_type st ON st.source_type_id = je.source_type_id
    INNER JOIN accounting_schema.journal_entry_status jes ON jes.status_id = je.status_id
    WHERE je.tenant_id = $1
    ORDER BY je.entry_date DESC, je.entry_number DESC
  `,

  getJournalEntryById: `
    SELECT
      je.entry_id,
      je.tenant_id,
      je.entry_number,
      je.source_type_id,
      st.source_name,
      je.source_id,
      je.entry_date,
      je.description,
      je.status_id,
      jes.status_name,
      je.total_debit,
      je.total_credit,
      je.created_by,
      je.created_at,
      je.updated_at,
      COALESCE((
        SELECT json_agg(json_build_object(
          'line_id', jel.line_id,
          'entry_id', jel.entry_id,
          'account_id', jel.account_id,
          'account_code', a.account_code,
          'account_name', a.account_name,
          'cost_center_id', jel.cost_center_id,
          'center_name', cc.center_name,
          'debit_amount', jel.debit_amount,
          'credit_amount', jel.credit_amount,
          'description', jel.description
        ) ORDER BY jel.created_at)
        FROM accounting_schema.journal_entry_line jel
        INNER JOIN accounting_schema.chart_of_accounts a ON a.account_id = jel.account_id
        LEFT JOIN accounting_schema.cost_center cc ON cc.cost_center_id = jel.cost_center_id
        WHERE jel.entry_id = je.entry_id
      ), '[]'::json) AS lines
    FROM accounting_schema.journal_entry je
    INNER JOIN accounting_schema.source_type st ON st.source_type_id = je.source_type_id
    INNER JOIN accounting_schema.journal_entry_status jes ON jes.status_id = je.status_id
    WHERE je.entry_id = $1 AND je.tenant_id = $2
    LIMIT 1
  `,

  createJournalEntry: `
    INSERT INTO accounting_schema.journal_entry
      (tenant_id, source_type_id, source_id, entry_date, description, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING entry_id
  `,

  confirmJournalEntry: `
    SELECT accounting_schema.confirm_journal_entry($1) AS confirmed
  `,

  voidJournalEntry: `
    SELECT accounting_schema.void_journal_entry($1, $2) AS reversal_entry_id
  `,

  getSourceTypes: `
    SELECT * FROM accounting_schema.source_type ORDER BY source_type_id
  `,

  getJournalEntryStatuses: `
    SELECT * FROM accounting_schema.journal_entry_status ORDER BY status_id
  `,

  // -------------------------------------------------------
  // JOURNAL GENERATION (Phase 2)
  // -------------------------------------------------------

  // Lineas de un asiento ya registrado (ya en VES), para revertirlo.
  getEntryLinesBySource: `
    SELECT jel.account_id, jel.debit_amount, jel.credit_amount, jel.description
    FROM accounting_schema.journal_entry je
    JOIN accounting_schema.journal_entry_line jel ON jel.entry_id = je.entry_id
    WHERE je.tenant_id = $1
      AND je.source_type_id = $2
      AND je.source_id = $3
    ORDER BY je.created_at, jel.created_at
  `,

  getAccountByCode: `
    SELECT account_id
    FROM accounting_schema.chart_of_accounts
    WHERE tenant_id = $1 AND account_code = $2 AND is_active = TRUE AND allows_transactions = TRUE
    LIMIT 1
  `,

  getSourceTypeByName: `
    SELECT source_type_id
    FROM accounting_schema.source_type
    WHERE source_name = $1
    LIMIT 1
  `,

  // $9 = moneda del documento de origen, $10 = tasa USD -> VES usada (las
  // lineas van en VES, ver migrations/accounting/045).
  createJournalEntryRaw: `
    INSERT INTO accounting_schema.journal_entry
      (tenant_id, source_type_id, source_id, entry_date, description, status_id, total_debit, total_credit,
       currency_id, exchange_rate)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING entry_id
  `,

  tenantHasAccounts: `
    SELECT 1 FROM accounting_schema.chart_of_accounts WHERE tenant_id = $1 LIMIT 1
  `,

  // Tasa USD -> VES del tenant en un instante (migracion general/044).
  exchangeRateAt: `
    SELECT general_schema.get_exchange_rate_at($1, $2::timestamp) AS rate
  `,

  getConfirmedStatusId: `
    SELECT status_id FROM accounting_schema.journal_entry_status WHERE status_name = 'Confirmado' LIMIT 1
  `,
};
