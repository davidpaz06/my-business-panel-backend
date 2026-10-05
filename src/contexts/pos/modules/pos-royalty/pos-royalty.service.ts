import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database/dist/components/Database';
import { posRoyaltyQueries } from './pos-royalty.queries';
import type {
  CreateRoyaltyRuleDto,
  UpdateRoyaltyRuleDto,
  CreateRoyaltyOptionDto,
  UpdateRoyaltyOptionDto,
  SetRuleDimensionsDto,
} from './dto/pos-royalty.dto';
import type {
  BucketUnit,
  RoyaltyAnalytics,
  RoyaltyCategoryRow,
  RoyaltyCustomerRow,
  RoyaltyEvolutionPoint,
  RoyaltyInterval,
} from './interface/royalty-analytics.interface';

const q = posRoyaltyQueries;

// Cada preset define cuanto retroceder y el paso del bucket (date_trunc).
const ROYALTY_INTERVAL_CONFIG: Record<
  RoyaltyInterval,
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

const DEFAULT_ROYALTY_INTERVAL: RoyaltyInterval = '30d';

@Injectable()
export class PosRoyaltyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listRules(tenantId: string) {
    const { rows } = await this.db.query(q.listRulesByTenant, [tenantId]);
    return rows;
  }

  async getRule(royaltyRuleId: string) {
    const { rows } = await this.db.query(q.getRuleById, [royaltyRuleId]);
    if (!rows.length) throw new NotFoundException('Royalty rule not found');
    return rows[0];
  }

  async createRule(tenantId: string, dto: CreateRoyaltyRuleDto) {
    const { rows } = await this.db.query(q.createRule, [
      tenantId,
      dto.min_amount,
    ]);
    return rows[0];
  }

  async updateRule(royaltyRuleId: string, dto: UpdateRoyaltyRuleDto) {
    const { rows } = await this.db.query(q.updateRule, [
      royaltyRuleId,
      dto.min_amount,
    ]);
    if (!rows.length) throw new NotFoundException('Royalty rule not found');
    return rows[0];
  }

  async deleteRule(royaltyRuleId: string) {
    await this.db.query(q.deleteRule, [royaltyRuleId]);
    return { deleted: true };
  }

  // Replace the rule's dimension set in a single txn. Options whose group
  // belongs to a removed dimension are deleted to keep state consistent.
  async setRuleDimensions(royaltyRuleId: string, dto: SetRuleDimensionsDto) {
    const { rows: tenantRows } = await this.db.query(q.getRuleTenantId, [
      royaltyRuleId,
    ]);
    if (!tenantRows.length) {
      throw new NotFoundException('Royalty rule not found');
    }
    const tenantId = tenantRows[0].tenant_id as string;
    const typeIds = Array.from(
      new Set(dto.tenant_product_group_type_ids ?? []),
    );

    await this.db.query(q.deleteOptionsByRuleExcludingTypes, [
      royaltyRuleId,
      typeIds,
    ]);
    await this.db.query(q.clearRuleDimensions, [royaltyRuleId]);
    for (const typeId of typeIds) {
      await this.db.query(q.insertRuleDimension, [
        royaltyRuleId,
        tenantId,
        typeId,
      ]);
    }
    return this.getRule(royaltyRuleId);
  }

  async createOption(dto: CreateRoyaltyOptionDto) {
    const { rows: allowedRows } = await this.db.query(
      q.isGroupInRuleDimensions,
      [dto.royalty_rule_id, dto.tenant_product_group_id],
    );
    if (!allowedRows.length) {
      throw new BadRequestException(
        'Group dimension is not enabled for this rule',
      );
    }
    const { rows } = await this.db.query(q.createOption, [
      dto.royalty_rule_id,
      dto.tenant_product_group_id,
      dto.quantity,
    ]);
    return rows[0];
  }

  async updateOption(royaltyOptionId: string, dto: UpdateRoyaltyOptionDto) {
    const { rows } = await this.db.query(q.updateOption, [
      royaltyOptionId,
      dto.quantity,
    ]);
    if (!rows.length) throw new NotFoundException('Royalty option not found');
    return rows[0];
  }

  async deleteOption(royaltyOptionId: string) {
    await this.db.query(q.deleteOption, [royaltyOptionId]);
    return { deleted: true };
  }

  async getApplicableRules(tenantId: string, amount: number) {
    const { rows } = await this.db.query(q.getApplicableRules, [
      tenantId,
      amount,
    ]);
    return rows;
  }

  async getGiftableProductsByGroup(tenantProductGroupId: string) {
    const { rows } = await this.db.query(q.getGiftableProductsByGroup, [
      tenantProductGroupId,
    ]);
    return rows;
  }

  // ── Analytics (Regalias) ─────────────────────────────────────────────────────

  async getRoyaltyAnalytics(
    tenantId: string,
    interval: RoyaltyInterval | undefined,
    branchId?: string,
  ): Promise<RoyaltyAnalytics> {
    const resolvedInterval =
      interval && ROYALTY_INTERVAL_CONFIG[interval]
        ? interval
        : DEFAULT_ROYALTY_INTERVAL;
    const { rangeMs, bucketUnit } = ROYALTY_INTERVAL_CONFIG[resolvedInterval];
    const rangeStart = new Date(Date.now() - rangeMs);
    const branchFilter = branchId || null;

    const baseParams = [tenantId, branchFilter, rangeStart];

    const [totalsResult, categoryResult, customerResult, evolutionResult] =
      await Promise.all([
        this.db.query(q.royaltyTotals, baseParams),
        this.db.query(q.royaltyByCategory, baseParams),
        this.db.query(q.royaltyByCustomer, baseParams),
        this.db.query(q.royaltyEvolution, [...baseParams, bucketUnit]),
      ]);

    const totalsRow = totalsResult.rows[0] as {
      total_value: string;
      gift_lines: string;
      total_sales: string;
    };
    const totalValue = Number(totalsRow?.total_value ?? 0);
    const totalSales = Number(totalsRow?.total_sales ?? 0);

    return {
      interval: resolvedInterval,
      range_start: rangeStart.toISOString(),
      bucket_unit: bucketUnit,
      totals: {
        total_value: totalValue,
        gift_lines: Number(totalsRow?.gift_lines ?? 0),
        total_sales: totalSales,
        pct_of_sales: totalSales > 0 ? (totalValue / totalSales) * 100 : 0,
      },
      by_category: (
        categoryResult.rows as Array<{
          category_id: string | null;
          category_name: string;
          value: string;
          quantity: string;
        }>
      ).map((r) => ({
        category_id: r.category_id,
        category_name: r.category_name,
        value: Number(r.value),
        quantity: Number(r.quantity),
      })) as RoyaltyCategoryRow[],
      by_customer: (
        customerResult.rows as Array<{
          tenant_customer_id: string | null;
          name: string;
          document_number: string | null;
          value: string;
          quantity: string;
        }>
      ).map((r) => ({
        tenant_customer_id: r.tenant_customer_id,
        name: r.name,
        document_number: r.document_number,
        value: Number(r.value),
        quantity: Number(r.quantity),
      })) as RoyaltyCustomerRow[],
      evolution: (
        evolutionResult.rows as Array<{
          bucket_start: string;
          value: string;
          quantity: string;
        }>
      ).map((r) => ({
        bucket_start: r.bucket_start,
        value: Number(r.value),
        quantity: Number(r.quantity),
      })) as RoyaltyEvolutionPoint[],
    };
  }
}
