import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import type { CashFlowGroupBy } from '../interface/cash-flow.interface';

export const CASH_FLOW_GROUP_BY: CashFlowGroupBy[] = [
  'daily',
  'weekly',
  'monthly',
];

const BUCKET_UNIT: Record<CashFlowGroupBy, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

export function resolveBucketUnit(groupBy: CashFlowGroupBy): string {
  return BUCKET_UNIT[groupBy];
}

export class GetCashFlowDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(CASH_FLOW_GROUP_BY)
  groupBy?: CashFlowGroupBy;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
