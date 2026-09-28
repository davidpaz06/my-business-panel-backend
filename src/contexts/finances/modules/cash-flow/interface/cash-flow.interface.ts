export type CashFlowGroupBy = 'daily' | 'weekly' | 'monthly';

export interface CashFlowSummaryItem {
  direction: 'entrada' | 'salida';
  currency_id: number;
  movement_type: string;
  branch_id: string | null;
  total_amount: string;
}

export interface CashFlowBucket {
  bucket_start: string;
  direction: 'entrada' | 'salida';
  currency_id: number;
  branch_id: string | null;
  total_amount: string;
}

export interface CashFlowAvailableItem {
  direction: 'entrada' | 'salida';
  currency_id: number;
  total_amount: string;
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
  projection_date: string;
  amount: string;
  currency_id: number;
  direction: 'entrada' | 'salida';
  movement_type: string;
  description: string;
}

export interface CashFlowProjectionsData {
  projections: CashFlowProjectionItem[];
}
