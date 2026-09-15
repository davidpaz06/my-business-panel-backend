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

export interface FixedVsVariableAnalytic {
  is_fixed: boolean;
  expense_type: string;
  total_amount: string;
}

export interface CategoryAnalytic {
  category_id: string;
  category_name: string;
  account_code: string;
  total_amount: string;
}

export interface ExpenseFixedVsVariableAnalytic {
  is_fixed: boolean;
  expense_type: string; // 'Fijo' | 'Variable'
  total_amount: string;
}

export interface ExpenseCategoryAnalytic {
  category_id: string;
  category_name: string;
  account_code: string;
  total_amount: string;
}

export interface SalesVsExpensesPoint {
  period: string;
  total_sales: string;
  total_expenses: string;
}
