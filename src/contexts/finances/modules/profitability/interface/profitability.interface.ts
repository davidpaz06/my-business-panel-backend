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

export interface SalesComponentRow {
  branch_id: string;
  bucket_start: string;
  currency_id: number;
  net_sales: string;
  discounts: string;
  cogs: string;
}

export interface ReturnsComponentRow {
  branch_id: string;
  bucket_start: string;
  currency_id: number;
  returns: string;
  returns_cogs: string;
}

export interface ExpenseComponentRow {
  branch_id: string;
  bucket_start: string;
  currency_id: number;
  amount: string;
}

export interface ExpenseCategoryComponentRow {
  branch_id: string;
  bucket_start: string;
  currency_id: number;
  category_id: string | null;
  category_name: string | null;
  amount: string;
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
}
