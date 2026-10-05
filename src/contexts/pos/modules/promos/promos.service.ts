import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import type { ITransaction } from '@crane-technologies/database/dist/interfaces/ITransaction';
import {
  Promo,
  PromoAnalyticsRow,
  PromoRule,
  PromoWithRule,
} from './interface/promo.interface';
import {
  NewPromoDto,
  PromoRules,
  PromotionTargetDto,
} from './dto/newPromo.dto';
import { RuleCreationError } from '@/common/errors/create_rule.error';
import { PromotionCreationError } from '@/common/errors/create_promo.error';
import { UpdatePromotionDto } from './dto/updatePromo.dto';
import { posQueries } from '@pos/pos.queries';

const { promotions, promotionTypes, promotionTarget } = posQueries;

@Injectable()
export class PromosService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getPromos(tenantId: string): Promise<Promo[]> {
    const promos = await this.db.query(promotions.getPromos, [tenantId]);
    return promos.rows;
  }

  /**
   * Returns active default promotions for a tenant on the current date,
   * with their rules and targets pre-loaded so the POS can apply them
   * automatically when starting a sale.
   */
  async getActiveDefaults(tenantId: string) {
    const result = await this.db.query(promotions.getActiveDefaults, [
      tenantId,
    ]);
    return result.rows;
  }

  async getPromoInfo(promoID: string): Promise<PromoWithRule | null> {
    const promo = await this.db.query(promotions.getPromoInfo, [promoID]);
    const row = promo.rows[0] as Promo | undefined;
    if (!row) return null;

    const [rules, targets] = await Promise.all([
      this.db.query(promotions.getPromotionRules, [promoID]),
      this.db.query(promotionTarget.byPromotion, [promoID]),
    ]);
    const ruleRows = rules.rows as PromoRule[];

    return {
      ...row,
      rule: ruleRows[0],
      rules: ruleRows,
      targets: targets.rows,
    };
  }

  async createPromoWithRule(tenant_id: string, newPromoDto: NewPromoDto) {
    const {
      promotion_name,
      promotion_code,
      promotion_description,
      promotion_type_id,
      is_universal,
      customer_segment_ids,
      promotion_start_date,
      promotion_end_date,
      is_active,
      is_default,
      is_stackable,
      rules,
      targets,
    } = newPromoDto;

    const effectiveIsUniversal = is_universal ?? true;

    const txn = await this.db.transaction();
    try {
      const promo = await txn.query(promotions.insertPromo, [
        tenant_id,
        promotion_name,
        promotion_code,
        promotion_description,
        promotion_type_id,
        effectiveIsUniversal,
        promotion_start_date,
        promotion_end_date,
        is_active,
        is_default ?? false,
        is_stackable ?? true,
      ]);

      if (promo.rows.length === 0) {
        throw new PromotionCreationError();
      }

      const promotionId = promo.rows[0].promotion_id;

      for (const ruleData of rules ?? []) {
        await this._insertRule(txn, { ...ruleData, promotion_id: promotionId });
      }

      if (
        !effectiveIsUniversal &&
        customer_segment_ids &&
        customer_segment_ids.length > 0
      ) {
        await this.replacePromoSegments(promotionId, customer_segment_ids, txn);
      }

      if (targets && targets.length > 0) {
        await this.replaceTargets(promotionId, tenant_id, targets, txn);
      }

      await txn.commit();
      return {
        message: `Promotion created successfully`,
        promotion_id: promotionId,
      };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  private async replacePromoSegments(
    promotionId: string,
    segmentIds: number[],
    txn: ITransaction,
  ): Promise<void> {
    await txn.query(promotions.deletePromoSegments, [promotionId]);
    for (const segId of segmentIds) {
      await txn.query(promotions.insertPromoSegment, [promotionId, segId]);
    }
  }

  private async replaceTargets(
    promotionId: string,
    tenantId: string,
    targets: PromotionTargetDto[],
    txn: ITransaction,
  ): Promise<void> {
    await txn.query(promotionTarget.deleteForPromotion, [promotionId]);
    for (const t of targets) {
      if (t.target_type === 'VARIANT') {
        await txn.query(promotionTarget.insertVariantTarget, [
          promotionId,
          tenantId,
          t.target_id,
        ]);
      } else {
        await txn.query(promotionTarget.insertGroupTarget, [
          promotionId,
          tenantId,
          t.target_id,
        ]);
      }
    }
  }

  async getTargets(promotionId: string) {
    const result = await this.db.query(promotionTarget.byPromotion, [
      promotionId,
    ]);
    return result.rows;
  }

  /**
   * Returns active promotions matching a variant: directly via VARIANT target,
   * or indirectly via any GROUP target where the variant is assigned to that
   * group or any of its descendants.
   */
  async getApplicableToVariant(tenantId: string, variantId: string) {
    const result = await this.db.query(promotionTarget.getApplicableToVariant, [
      tenantId,
      variantId,
    ]);
    return result.rows;
  }

  private async _insertRule(
    txn: ITransaction,
    data: PromoRules,
  ): Promise<string> {
    const { promotion_rule_id: _, ...dataWithoutId } = data;
    const insertKeys = Object.keys(dataWithoutId).filter(
      (key) => dataWithoutId[key as keyof typeof dataWithoutId] !== undefined,
    );

    if (insertKeys.length === 0) {
      throw new RuleCreationError();
    }

    const insertClause = insertKeys.map((k) => `"${k}"`);
    const paramsArray = insertKeys.map(
      (k) => dataWithoutId[k as keyof typeof dataWithoutId],
    );
    const placeholders = insertKeys.map((_, i) => `$${i + 1}`);

    const q = `
      INSERT INTO pos_schema.promotion_rule(${insertClause.join(', ')})
      VALUES(${placeholders.join(', ')})
      RETURNING promotion_rule_id
    `;

    const result = await txn.rawQuery(q, paramsArray);
    return result.rows[0].promotion_rule_id;
  }

  async deletePromotion(promotionId: string, scopeTenantId: string | null) {
    const result = await this.db.query(promotions.deletePromo, [
      promotionId,
      scopeTenantId,
    ]);
    if (result.rows.length === 0) {
      throw new NotFoundException('Promotion not found');
    }
    return {
      message: `Promotion with id: ${result.rows[0].promotion_id} deleted successfully`,
    };
  }

  async updatePromotion(
    promotionId: string,
    updatePromoDto: UpdatePromotionDto,
    scopeTenantId: string | null,
  ) {
    const {
      promotion_name,
      promotion_code,
      promotion_description,
      promotion_type_id,
      is_universal,
      customer_segment_ids,
      promotion_start_date,
      promotion_end_date,
      is_active,
      is_default,
      is_stackable,
      rules,
      targets,
    } = updatePromoDto;

    const txn = await this.db.transaction();
    try {
      const updatedPromo = await txn.query(promotions.updatePromo, [
        promotionId,
        scopeTenantId,
        promotion_name,
        promotion_code,
        promotion_description,
        promotion_type_id,
        is_universal,
        promotion_start_date,
        promotion_end_date,
        is_active,
        is_default,
        is_stackable,
      ]);

      if (!updatedPromo.rows || updatedPromo.rows.length === 0) {
        throw new NotFoundException('Promotion not found');
      }

      if (rules !== undefined) {
        await txn.query(promotions.deletePromoRules, [promotionId]);
        for (const ruleData of rules) {
          await this._insertRule(txn, {
            ...ruleData,
            promotion_id: promotionId,
          });
        }
      }

      if (customer_segment_ids !== undefined) {
        await txn.query(promotions.deletePromoSegments, [promotionId]);
        const effectiveUniversal =
          is_universal ?? updatedPromo.rows[0]?.is_universal;
        if (!effectiveUniversal && customer_segment_ids.length > 0) {
          for (const segId of customer_segment_ids) {
            await txn.query(promotions.insertPromoSegment, [
              promotionId,
              segId,
            ]);
          }
        }
      }

      if (targets !== undefined) {
        const promoTenantId = updatedPromo.rows[0]?.tenant_id;
        if (promoTenantId) {
          await this.replaceTargets(promotionId, promoTenantId, targets, txn);
        }
      }

      await txn.commit();
      return {
        message: `Promotion with id: ${updatedPromo.rows[0].promotion_id} updated successfully`,
      };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  async getPromoTypes() {
    const promoType = await this.db.query(promotionTypes.getPromoTypes);
    return promoType.rows;
  }

  private readonly INTERVAL_MAP: Record<string, string> = {
    '24h': '24 hours',
    '7d': '7 days',
    '15d': '15 days',
    '30d': '30 days',
    '90d': '90 days',
    '180d': '180 days',
    '365d': '365 days',
  };

  async getAnalytics(
    tenantId: string,
    interval: string,
    isActive?: boolean,
    branchId?: string,
  ): Promise<PromoAnalyticsRow[]> {
    const pgInterval = this.INTERVAL_MAP[interval] ?? '30 days';
    const result = await this.db.query(promotions.getAnalytics, [
      tenantId,
      pgInterval,
      isActive ?? null,
      branchId ?? null,
    ]);
    return result.rows;
  }
}
