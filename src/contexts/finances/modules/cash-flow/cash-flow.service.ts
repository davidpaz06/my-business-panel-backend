import { Inject, Injectable } from '@nestjs/common';
import Database from '@resonance-components/datahandler';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  cashFlowAvailableQuery,
  cashFlowBucketsQuery,
  cashFlowProjectionsQuery,
  cashFlowSummaryQuery,
} from './cash-flow.queries';
import {
  CashFlowAvailableItem,
  CashFlowBucket,
  CashFlowData,
  CashFlowGroupBy,
  CashFlowProjectionsData,
  CashFlowProjectionItem,
  CashFlowSummaryItem,
} from './interface/cash-flow.interface';
import { resolveBucketUnit } from './dto/cash-flow.dto';
import { businessDate, businessToday } from '@/contexts/finances/finances.time';

const DEFAULT_GROUP_BY: CashFlowGroupBy = 'daily';
const HISTORY_START = '1900-01-01';

@Injectable()
export class CashFlowService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getCashFlow(
    startDate: string | undefined,
    endDate: string | undefined,
    groupBy: CashFlowGroupBy | undefined,
    branchId: string | undefined,
    session: IUserSession,
  ): Promise<CashFlowData> {
    const resolvedGroupBy = groupBy ?? DEFAULT_GROUP_BY;
    const bucketUnit = resolveBucketUnit(resolvedGroupBy);
    const branchFilter = branchId ?? null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Dias locales de negocio (Caracas): con toISOString() despues de las
    // 20:00 el rango por defecto terminaba en el dia de manana.
    const resolvedStart = startDate ?? businessDate(thirtyDaysAgo);
    const resolvedEnd = endDate ?? businessToday(now);

    const [summaryResult, bucketsResult, availableResult] = await Promise.all([
      this.db.query(cashFlowSummaryQuery, [
        session.tenant_id,
        resolvedStart,
        resolvedEnd,
        branchFilter,
      ]),
      this.db.query(cashFlowBucketsQuery, [
        session.tenant_id,
        resolvedStart,
        resolvedEnd,
        branchFilter,
        bucketUnit,
      ]),
      this.db.query(cashFlowAvailableQuery, [
        session.tenant_id,
        HISTORY_START,
        businessToday(now),
        // Mismo filtro de sucursal que las demas tarjetas.
        branchFilter,
      ]),
    ]);

    return {
      start_date: resolvedStart,
      end_date: resolvedEnd,
      group_by: resolvedGroupBy,
      summary: summaryResult.rows as CashFlowSummaryItem[],
      buckets: bucketsResult.rows as CashFlowBucket[],
      available_cash: availableResult.rows as CashFlowAvailableItem[],
    };
  }

  async getProjections(
    session: IUserSession,
  ): Promise<CashFlowProjectionsData> {
    const result = await this.db.query(cashFlowProjectionsQuery, [
      session.tenant_id,
    ]);
    return {
      projections: result.rows as CashFlowProjectionItem[],
    };
  }
}
