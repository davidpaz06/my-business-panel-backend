import { Inject, Injectable } from '@nestjs/common';
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  expenseCategoryComponents,
  expenseComponents,
  returnsComponents,
  salesComponents,
  tenantBranches,
} from './profitability.queries';
import {
  BranchRow,
  BucketUnit,
  ExpenseCategoryComponentRow,
  ExpenseComponentRow,
  ProfitabilityInterval,
  ProfitabilityRawData,
  ReturnsComponentRow,
  SalesComponentRow,
} from './interface/profitability.interface';

// Cada preset define cuanto retroceder (rango) y el paso del bucket (date_trunc).
const INTERVAL_CONFIG: Record<
  ProfitabilityInterval,
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

const DEFAULT_INTERVAL: ProfitabilityInterval = '24h';

@Injectable()
export class ProfitabilityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getProfitability(
    interval: ProfitabilityInterval | undefined,
    session: IUserSession,
    branchId?: string,
  ): Promise<ProfitabilityRawData> {
    const resolvedInterval = interval ?? DEFAULT_INTERVAL;
    const { rangeMs, bucketUnit } = INTERVAL_CONFIG[resolvedInterval];
    const rangeStart = new Date(Date.now() - rangeMs);
    const branchFilter = branchId ?? null;

    const tenantParams = [session.tenant_id, branchFilter];
    const bucketParams = [
      session.tenant_id,
      bucketUnit,
      rangeStart,
      branchFilter,
    ];

    const [
      branchesResult,
      salesResult,
      returnsResult,
      expensesResult,
      expenseCategoriesResult,
    ] = await Promise.all([
      this.db.query(tenantBranches, tenantParams),
      this.db.query(salesComponents, bucketParams),
      this.db.query(returnsComponents, bucketParams),
      this.db.query(expenseComponents, bucketParams),
      this.db.query(expenseCategoryComponents, bucketParams),
    ]);

    return {
      interval: resolvedInterval,
      range_start: rangeStart.toISOString(),
      bucket_unit: bucketUnit,
      branches: branchesResult.rows as BranchRow[],
      sales: salesResult.rows as SalesComponentRow[],
      returns: returnsResult.rows as ReturnsComponentRow[],
      expenses: expensesResult.rows as ExpenseComponentRow[],
      expense_categories:
        expenseCategoriesResult.rows as ExpenseCategoryComponentRow[],
    };
  }
}
