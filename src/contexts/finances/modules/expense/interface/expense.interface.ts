export interface ExpenseCategoryFromDb {
  category_id: string;
  tenant_id: string;
  name: string;
  account_code: string;
  parent_category_id: string | null;
  is_fixed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseFromDb {
  expense_id: string;
  tenant_id: string;
  branch_id: string;
  category_id: string;
  category_name: string;
  account_code: string;
  description: string | null;
  amount: string;
  tax_amount: string;
  total_amount: string;
  currency_id: number;
  expense_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseHistoryRow extends ExpenseFromDb {
  branch_name: string;
  is_fixed: boolean;
  created_by_email: string | null;
}

export interface PaginatedExpenses {
  results: ExpenseHistoryRow[];
  total: number;
  page: number;
  limit: number;
}

export interface FiscalPeriodFromDb {
  period_id: string;
  tenant_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  created_at: string;
}

// -------------------------------------------------------
// ANALYTICS
// -------------------------------------------------------

// Analiticos vigentes (handlers analytics*): montos en USD y VES con la tasa
// de la fecha de cada gasto o venta (FNZ-X-02).
export interface FixedVsVariableAnalytic {
  is_fixed: boolean;
  expense_type: string;
  total_usd: string;
  total_ves: string;
}

export interface CategoryAnalytic {
  category_id: string;
  category_name: string;
  account_code: string;
  total_usd: string;
  total_ves: string;
}

export interface SalesVsExpensesAnalytic {
  period: string;
  total_sales_usd: string;
  total_sales_ves: string;
  total_expenses_usd: string;
  total_expenses_ves: string;
}

export interface PayrollAnalytic {
  paysheet_count: number;
  /** Costo de nomina: total devengado (o el neto si el devengado quedo en 0). */
  gross_total_usd: string;
  gross_total_ves: string;
  net_total_usd: string;
  net_total_ves: string;
}
