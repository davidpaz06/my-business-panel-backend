/**
 * Tasa vigente aplicable a un tenant. Con auto_update: base global + su
 * diferencial. Sin auto_update: su ultima tasa manual (manual_rate).
 */
export interface EffectiveExchangeRate {
  base_rate: string | null;
  delta: string;
  effective_rate: string | null;
  base_at: string | null;
  delta_at: string | null;
  auto_update: boolean;
  manual_rate: string | null;
  manual_at: string | null;
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

/** Respuesta de https://ve.dolarapi.com/v1/dolares/oficial (tasa BCV). */
export interface DolarApiOficialResponse {
  fuente: string;
  promedio: number;
  fechaActualizacion: string;
}
