import { Inject, Injectable } from '@nestjs/common';
import Database from '@crane-technologies/database/dist/components/Database';
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

const DEFAULT_GROUP_BY: CashFlowGroupBy = 'daily';
const HISTORY_START = '1900-01-01T00:00:00.000Z';

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
    const resolvedStart = startDate ?? thirtyDaysAgo.toISOString().slice(0, 10);
    const resolvedEnd = endDate ?? now.toISOString().slice(0, 10);

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
        now.toISOString(),
        null,
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
