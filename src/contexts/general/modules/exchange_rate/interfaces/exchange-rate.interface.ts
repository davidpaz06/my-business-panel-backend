/** Tasa vigente aplicable a un tenant: base global + su diferencial. */
export interface EffectiveExchangeRate {
  base_rate: string;
  delta: string;
  effective_rate: string;
  base_at: string;
  delta_at: string | null;
  from_currency_id: number;
  to_currency_id: number;
}

/** Fila del historial: un cambio de tasa base o de diferencial. */
export interface ExchangeRateLedgerEntry {
  tenant_id: string;
  effective_at: string;
  change_kind: 'base' | 'delta';
  source: string | null;
  base_rate: string;
  delta: string;
  effective_rate: string;
  created_at: string;
}
