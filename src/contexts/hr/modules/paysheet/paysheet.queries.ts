import { createQueries } from '@resonance-components/datahandler';

export const paysheetQueries = createQueries({
  paysheet: {
    getTenantPaysheets: `
      SELECT * FROM hr_schema.paysheet WHERE tenant_id = $1
      ORDER BY created_at DESC
    `,
    getPaysheetById: `
      SELECT * FROM hr_schema.paysheet WHERE paysheet_id = $1 LIMIT 1
    `,
    getBranchPaysheets: `
      SELECT * FROM hr_schema.paysheet 
      WHERE  branch_id = $1
      ORDER BY created_at DESC
    `,
    getDetails: `
      SELECT * FROM hr_schema.paysheet_detail WHERE paysheet_id = $1
    `,
    filtrateByDate: `
      SELECT 
        p.paysheet_id,
        p.tenant_id,
        p.branch_id,
        p.period_start,
        p.period_end,
        p.payment_date,
        p.net_total,
        ps.status_description as paysheet_status
      FROM hr_schema.paysheet p
      INNER JOIN hr_schema.paysheet_status ps USING(status_id)
      WHERE p.branch_id = $1
        AND p.period_start >= $2
        AND p.period_end <= $3
      ORDER BY p.created_at DESC
    `,
  },
});
