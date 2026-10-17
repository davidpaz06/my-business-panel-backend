export type CashFlowGroupBy = 'daily' | 'weekly' | 'monthly';

export interface CashFlowSummaryItem {
  direction: 'entrada' | 'salida';
  movement_type: string;
  branch_id: string | null;
  /** Total convertido con la tasa de la fecha de cada movimiento (FNZ-X-02). */
  total_usd: string;
  total_ves: string;
}

export interface CashFlowBucket {
  bucket_start: string;
  direction: 'entrada' | 'salida';
  branch_id: string | null;
  /** Total convertido con la tasa de la fecha de cada movimiento (FNZ-X-02). */
  total_usd: string;
  total_ves: string;
}

export interface CashFlowAvailableItem {
  direction: 'entrada' | 'salida';
  /** Total convertido con la tasa de la fecha de cada movimiento (FNZ-X-02). */
  total_usd: string;
  total_ves: string;
}

export interface CashFlowData {
  start_date: string;
  end_date: string;
  group_by: CashFlowGroupBy;
  summary: CashFlowSummaryItem[];
  buckets: CashFlowBucket[];
  available_cash: CashFlowAvailableItem[];
}

export interface CashFlowProjectionItem {
  /** YYYY-MM-DD (dia local). */
  projection_date: string;
  /** La fecha ya paso (antes de hoy) y sigue pendiente. */
  is_overdue: boolean;
  amount: string;
  currency_id: number;
  direction: 'entrada' | 'salida';
  movement_type: string;
  description: string;
}

export interface CashFlowProjectionsData {
  projections: CashFlowProjectionItem[];
}
