import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';
import {
  CreateTenantProductGroupDto,
  UpdateTenantProductGroupDto,
} from './dto/tenant-product-group.dto';
import { getGroupDescendants } from './helpers/descendants';

const { tenantProductGroup } = generalQueries;

@Injectable()
export class TenantProductGroupService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByTenant(tenantId: string) {
    const result = await this.db.query(tenantProductGroup.byTenant, [tenantId]);
    return result.rows;
  }

  async getById(id: string, tenantId: string) {
    const result = await this.db.query(tenantProductGroup.byId, [id, tenantId]);
    return result.rows[0];
  }

  async getTree(tenantId: string, typeId: string) {
    const result = await this.db.query(tenantProductGroup.tree, [
      tenantId,
      typeId,
    ]);
    return result.rows;
  }

  async getDescendants(tenantId: string, groupId: string) {
    return getGroupDescendants(this.db, tenantId, groupId);
  }

  async create(data: CreateTenantProductGroupDto) {
    const parentId = data.parent_group_id ?? null;
    let level = data.hierarchy_level ?? 0;

    if (parentId) {
      const parent = await this.db.query(tenantProductGroup.byId, [
        parentId,
        data.tenant_id,
      ]);
      if (!parent.rows[0]) {
        throw new BadRequestException(
          'parent_group_id does not exist for this tenant',
        );
      }
      level = (parent.rows[0].hierarchy_level ?? 0) + 1;
    }

    const result = await this.db.query(tenantProductGroup.create, [
      data.tenant_id,
      data.tenant_product_group_type_id,
      parentId,
      data.group_name,
      level,
      data.is_active ?? null,
    ]);
    return result.rows[0];
  }

  async update(
    id: string,
    tenantId: string,
    data: UpdateTenantProductGroupDto,
  ) {
    const newParent =
      data.parent_group_id === undefined ? undefined : data.parent_group_id;

    if (newParent) {
      if (newParent === id) {
        throw new BadRequestException('A group cannot be its own parent');
      }
      // Cycle prevention: the new parent must not be a descendant of `id`
      const descendants = await getGroupDescendants(this.db, tenantId, id);
      if (descendants.includes(newParent)) {
        throw new BadRequestException(
          'Cycle detected: parent_group_id is a descendant of this group',
        );
      }
    }

    let level: number | null = data.hierarchy_level ?? null;
    if (newParent) {
      const parent = await this.db.query(tenantProductGroup.byId, [
        newParent,
        tenantId,
      ]);
      if (!parent.rows[0]) {
        throw new BadRequestException(
          'parent_group_id does not exist for this tenant',
        );
      }
      level = (parent.rows[0].hierarchy_level ?? 0) + 1;
    } else if (newParent === null) {
      level = 0;
    }

    const result = await this.db.query(tenantProductGroup.update, [
      id,
      tenantId,
      data.group_name ?? null,
      newParent === undefined ? null : newParent,
      level,
      data.is_active ?? null,
    ]);
    return result.rows[0];
  }

  async delete(id: string, tenantId: string) {
    const result = await this.db.query(tenantProductGroup.delete, [
      id,
      tenantId,
    ]);
    return { deleted: result.rows[0]?.tenant_product_group_id ?? null };
  }
}
