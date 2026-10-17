export type IvaComponent =
  | 'debito'
  | 'notas_debito'
  | 'notas_credito'
  | 'credito'
  | 'cxp'
  | 'gastos'
  | 'retenciones';

export interface IvaSummaryRowFromDb {
  component: IvaComponent;
  total_usd: string;
  total_ves: string;
}

/** Un componente del IVA en USD y VES, con la tasa de la fecha de cada documento. */
export interface IvaSummaryRow {
  component: IvaComponent;
  total_usd: number;
  total_ves: number;
}

// El cliente elige la moneda y calcula recuperable, debito ajustado y neto.
export interface IvaSummaryResponse {
  components: IvaSummaryRow[];
}
