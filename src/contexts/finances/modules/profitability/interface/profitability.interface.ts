// Tipos de fila cruda devueltos por las consultas de rentabilidad.
// Los valores numericos de Postgres llegan como string (patron del repo).

export type ProfitabilityInterval =
  | '24h'
  | '7d'
  | '15d'
  | '30d'
  | '90d'
  | '180d'
  | '365d';

export type BucketUnit = 'hour' | 'day' | 'week' | 'month';

export interface BranchRow {
  branch_id: string;
  branch_name: string;
}

// Montos en USD y VES con la tasa de la fecha de cada movimiento (FNZ-X-02).
// Postgres devuelve numeric como string.
export interface SalesComponentRow {
  branch_id: string;
  bucket_start: string;
  net_sales_usd: string;
  net_sales_ves: string;
  discounts_usd: string;
  discounts_ves: string;
  cogs_usd: string;
  cogs_ves: string;
}

export interface ReturnsComponentRow {
  branch_id: string;
  bucket_start: string;
  returns_usd: string;
  returns_ves: string;
  returns_cogs_usd: string;
  returns_cogs_ves: string;
}

export interface ExpenseComponentRow {
  branch_id: string;
  bucket_start: string;
  amount_usd: string;
  amount_ves: string;
}

export interface ExpenseCategoryComponentRow {
  branch_id: string;
  bucket_start: string;
  category_id: string | null;
  category_name: string | null;
  amount_usd: string;
  amount_ves: string;
}

export interface PayrollComponentRow {
  branch_id: string;
  bucket_start: string;
  amount_usd: string;
  amount_ves: string;
}

// Notas de credito (negativas) y debito (positivas) activas, netas de IVA.
export interface NotesComponentRow {
  branch_id: string;
  bucket_start: string;
  notes_usd: string;
  notes_ves: string;
}

export interface ProfitabilityRawData {
  interval: ProfitabilityInterval;
  range_start: string;
  bucket_unit: BucketUnit;
  branches: BranchRow[];
  sales: SalesComponentRow[];
  returns: ReturnsComponentRow[];
  expenses: ExpenseComponentRow[];
  expense_categories: ExpenseCategoryComponentRow[];
  payroll: PayrollComponentRow[];
  notes: NotesComponentRow[];
}
