// Tipos de la Vista financiera de Puntos de Fidelidad.
// El backend agrega el pasivo de puntos a nivel tenant y calcula su equivalencia
// monetaria con la tasa de canje del programa activo.

export type LoyaltyInterval =
  | '24h'
  | '7d'
  | '15d'
  | '30d'
  | '90d'
  | '180d'
  | '365d';

export type BucketUnit = 'hour' | 'day' | 'week' | 'month';

// Config cruda del programa activo (numeric llega como string desde Postgres).
export interface LoyaltyProgramConfig {
  points_earned_per_currency_unit: string;
  points_redeemed_per_currency_unit: string;
  is_active: boolean;
}

export interface LoyaltyTotals {
  active_points: number;
  redeemed_points: number;
  lifetime_points: number;
  expired_points: number;
  customers_with_points: number;
  // Equivalencia monetaria en USD (moneda del programa, FNZ-FI-02) y en VES a
  // la tasa de hoy; el frontend elige la columna segun el toggle de moneda.
  active_value_usd: number;
  active_value_ves: number;
  redeemed_value_usd: number;
  redeemed_value_ves: number;
  lifetime_value_usd: number;
  lifetime_value_ves: number;
  expired_value_usd: number;
  expired_value_ves: number;
}

export interface LoyaltyGrowthPoint {
  bucket_start: string;
  earned: number;
  redeemed: number;
}

export interface LoyaltyTopCustomer {
  tenant_customer_id: string;
  name: string;
  document_number: string | null;
  score: number;
  lifetime_score: number;
  value_usd: number;
  value_ves: number;
}

export interface LoyaltyOverview {
  interval: LoyaltyInterval;
  range_start: string;
  bucket_unit: BucketUnit;
  config: LoyaltyProgramConfig | null;
  /** Tasa USD -> VES de hoy con la que se valoran los equivalentes en VES. */
  usd_ves_rate: number | null;
  totals: LoyaltyTotals;
  growth: LoyaltyGrowthPoint[];
  top_customers: LoyaltyTopCustomer[];
}
