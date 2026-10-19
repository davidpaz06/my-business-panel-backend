import { Inject, Injectable } from '@nestjs/common';
import Database from '@resonance-components/datahandler';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { loyaltyQueries } from './loyalty.queries';
import {
  BucketUnit,
  LoyaltyGrowthPoint,
  LoyaltyInterval,
  LoyaltyOverview,
  LoyaltyProgramConfig,
  LoyaltyTopCustomer,
} from './interface/loyalty.interface';

// Cada preset define cuanto retroceder (rango) y el paso del bucket (date_trunc).
const INTERVAL_CONFIG: Record<
  LoyaltyInterval,
  { rangeMs: number; bucketUnit: BucketUnit }
> = {
  '24h': { rangeMs: 24 * 60 * 60 * 1000, bucketUnit: 'hour' },
  '7d': { rangeMs: 7 * 24 * 60 * 60 * 1000, bucketUnit: 'day' },
  '15d': { rangeMs: 15 * 24 * 60 * 60 * 1000, bucketUnit: 'day' },
  '30d': { rangeMs: 30 * 24 * 60 * 60 * 1000, bucketUnit: 'day' },
  '90d': { rangeMs: 90 * 24 * 60 * 60 * 1000, bucketUnit: 'week' },
  '180d': { rangeMs: 180 * 24 * 60 * 60 * 1000, bucketUnit: 'week' },
  '365d': { rangeMs: 365 * 24 * 60 * 60 * 1000, bucketUnit: 'month' },
};

const DEFAULT_INTERVAL: LoyaltyInterval = '30d';

interface TotalsRow {
  active_points: string;
  lifetime_points: string;
  redeemed_points: string;
  customers_with_points: string;
}

interface GrowthRow {
  bucket_start: string;
  earned: string;
  redeemed: string;
}

interface TopCustomerRow {
  tenant_customer_id: string;
  name: string;
  document_number: string | null;
  score: number;
  lifetime_score: number;
}

@Injectable()
export class LoyaltyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getOverview(
    interval: LoyaltyInterval | undefined,
    session: IUserSession,
    branchId?: string,
  ): Promise<LoyaltyOverview> {
    const resolvedInterval = interval ?? DEFAULT_INTERVAL;
    const { rangeMs, bucketUnit } = INTERVAL_CONFIG[resolvedInterval];
    const rangeStart = new Date(Date.now() - rangeMs);
    // El filtro de sucursal solo aplica al grafico de crecimiento; los saldos
    // (totales y top clientes) son a nivel tenant (no tienen dimension de sucursal).
    const branchFilter = branchId ?? null;

    const [programResult, rateResult, totalsResult, growthResult, topResult] =
      await Promise.all([
        this.db.query(loyaltyQueries.getActiveProgram, [session.tenant_id]),
        this.db.query(loyaltyQueries.getCurrentRate, [session.tenant_id]),
        this.db.query(loyaltyQueries.getTotals, [session.tenant_id]),
        this.db.query(loyaltyQueries.getGrowth, [
          session.tenant_id,
          bucketUnit,
          // ISO en UTC: las columnas timestamp guardan hora UTC; un Date crudo se
          // serializaria con el offset del proceso (que Postgres ignora).
          rangeStart.toISOString(),
          branchFilter,
        ]),
        this.db.query(loyaltyQueries.getTopCustomers, [session.tenant_id]),
      ]);

    const config: LoyaltyProgramConfig | null =
      (programResult.rows[0] as LoyaltyProgramConfig | undefined) ?? null;

    // Equivalencia monetaria: valor = puntos / tasa de canje
    // (points_redeemed_per_currency_unit). El programa se define en USD
    // (FNZ-FI-02); el equivalente en VES usa la tasa de hoy.
    const redeemRate = config
      ? Number(config.points_redeemed_per_currency_unit)
      : 0;
    const rawRate = (rateResult.rows[0] as { usd_ves_rate: string | null })
      ?.usd_ves_rate;
    const usdVesRate =
      rawRate !== null && rawRate !== undefined ? Number(rawRate) : null;
    const toValueUsd = (points: number): number =>
      redeemRate > 0 ? points / redeemRate : 0;
    const toValueVes = (points: number): number =>
      toValueUsd(points) * (usdVesRate ?? 0);

    const totalsRow = totalsResult.rows[0] as TotalsRow;
    const activePoints = Number(totalsRow.active_points);
    const redeemedPoints = Number(totalsRow.redeemed_points);
    const lifetimePoints = Number(totalsRow.lifetime_points);

    const growth: LoyaltyGrowthPoint[] = (growthResult.rows as GrowthRow[]).map(
      (row) => ({
        bucket_start: row.bucket_start,
        earned: Number(row.earned),
        redeemed: Number(row.redeemed),
      }),
    );

    const topCustomers: LoyaltyTopCustomer[] = (
      topResult.rows as TopCustomerRow[]
    ).map((row) => ({
      tenant_customer_id: row.tenant_customer_id,
      name: row.name,
      document_number: row.document_number,
      score: Number(row.score),
      lifetime_score: Number(row.lifetime_score),
      value_usd: toValueUsd(Number(row.score)),
      value_ves: toValueVes(Number(row.score)),
    }));

    return {
      interval: resolvedInterval,
      range_start: rangeStart.toISOString(),
      bucket_unit: bucketUnit,
      config,
      usd_ves_rate: usdVesRate,
      totals: {
        active_points: activePoints,
        redeemed_points: redeemedPoints,
        lifetime_points: lifetimePoints,
        // Sin mecanismo de expiracion de puntos: se reporta 0.
        expired_points: 0,
        customers_with_points: Number(totalsRow.customers_with_points),
        active_value_usd: toValueUsd(activePoints),
        active_value_ves: toValueVes(activePoints),
        redeemed_value_usd: toValueUsd(redeemedPoints),
        redeemed_value_ves: toValueVes(redeemedPoints),
        lifetime_value_usd: toValueUsd(lifetimePoints),
        lifetime_value_ves: toValueVes(lifetimePoints),
        expired_value_usd: 0,
        expired_value_ves: 0,
      },
      growth,
      top_customers: topCustomers,
    };
  }
}
