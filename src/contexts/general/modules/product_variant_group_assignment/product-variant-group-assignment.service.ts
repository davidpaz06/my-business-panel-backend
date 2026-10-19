import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import {
  bulkProductVariantGroupAssignments,
  generalQueries,
} from '@general/general.queries';
import { ReplaceVariantGroupsDto } from './dto/product-variant-group-assignment.dto';

const { productVariantGroupAssignment, tenantProductGroup } = generalQueries;

@Injectable()
export class ProductVariantGroupAssignmentService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByVariant(tenantId: string, variantId: string) {
    const result = await this.db.query(
      productVariantGroupAssignment.byVariant,
      [tenantId, variantId],
    );
    return result.rows;
  }

  async getVariantsByGroup(tenantId: string, groupId: string) {
    const result = await this.db.query(
      productVariantGroupAssignment.variantsByGroup,
      [tenantId, groupId],
    );
    return result.rows;
  }

  async replaceForVariant(data: ReplaceVariantGroupsDto) {
    const txn = await this.db.transaction();
    try {
      if (data.group_ids.length > 0) {
        const owned = await txn.query(
          tenantProductGroup.validateGroupsOwnedByTenant,
          [data.tenant_id, data.group_ids],
        );
        if ((owned.rows[0]?.owned ?? 0) !== data.group_ids.length) {
          throw new BadRequestException(
            'One or more group_ids do not belong to this tenant',
          );
        }
      }

      await txn.query(productVariantGroupAssignment.deleteForVariant, [
        data.tenant_id,
        data.product_variant_id,
      ]);

      if (data.group_ids.length > 0) {
        await txn.bulkInsert(
          'general_schema.product_variant_group_assignment',
          bulkProductVariantGroupAssignments,
          data.group_ids.map((gid) => [
            data.tenant_id,
            data.product_variant_id,
            gid,
          ]),
        );
      }

      await txn.commit();
      return {
        message: 'Variant groups replaced',
        count: data.group_ids.length,
      };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error);
    }
  }
}
