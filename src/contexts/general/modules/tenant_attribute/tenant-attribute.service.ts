import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';
import {
  CreateTenantAttributeDto,
  UpdateTenantAttributeDto,
} from './dto/tenant-attribute.dto';

const { tenantAttribute } = generalQueries;

@Injectable()
export class TenantAttributeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByTenant(tenantId: string) {
    const result = await this.db.query(tenantAttribute.byTenant, [tenantId]);
    return result.rows;
  }

  async searchUnified(tenantId: string, query: string, page = 1, limit = 100) {
    const offset = (page - 1) * limit;
    const term = (query ?? '').trim();
    const [data, count] = await Promise.all([
      this.db.query(tenantAttribute.searchUnified, [
        tenantId,
        term,
        limit,
        offset,
      ]),
      this.db.query(tenantAttribute.countSearchUnified, [tenantId, term]),
    ]);
    return {
      attributes: data.rows,
      total: count.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getById(id: string, tenantId: string) {
    const result = await this.db.query(tenantAttribute.byId, [id, tenantId]);
    return result.rows[0];
  }

  async create(data: CreateTenantAttributeDto) {
    if (data.global_attribute_id) {
      const result = await this.db.query(tenantAttribute.createFromGlobal, [
        data.tenant_id,
        data.global_attribute_id,
      ]);
      return result.rows[0];
    }
    if (!data.attribute_name) {
      throw new BadRequestException(
        'attribute_name is required for custom attributes',
      );
    }
    const result = await this.db.query(tenantAttribute.createCustom, [
      data.tenant_id,
      data.attribute_name,
    ]);
    return result.rows[0];
  }

  async update(id: string, tenantId: string, data: UpdateTenantAttributeDto) {
    const result = await this.db.query(tenantAttribute.update, [
      id,
      tenantId,
      data.attribute_name ?? null,
    ]);
    return result.rows[0];
  }

  async delete(id: string, tenantId: string) {
    const result = await this.db.query(tenantAttribute.delete, [id, tenantId]);
    return { deleted: result.rows[0]?.tenant_attribute_id ?? null };
  }
}
