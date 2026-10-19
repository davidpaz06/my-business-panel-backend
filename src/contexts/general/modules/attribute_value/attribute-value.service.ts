import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute-value.dto';

const { attributeValue } = generalQueries;

@Injectable()
export class AttributeValueService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByTenantAttribute(tenantAttributeId: string, tenantId: string) {
    const result = await this.db.query(attributeValue.byTenantAttribute, [
      tenantAttributeId,
      tenantId,
    ]);
    return result.rows;
  }

  async getById(id: string, tenantId: string) {
    const result = await this.db.query(attributeValue.byId, [id, tenantId]);
    return result.rows[0];
  }

  async create(data: CreateAttributeValueDto) {
    const result = await this.db.query(attributeValue.create, [
      data.tenant_id,
      data.tenant_attribute_id,
      data.value,
    ]);
    return result.rows[0];
  }

  async update(id: string, tenantId: string, data: UpdateAttributeValueDto) {
    const result = await this.db.query(attributeValue.update, [
      id,
      tenantId,
      data.value ?? null,
    ]);
    return result.rows[0];
  }

  async delete(id: string, tenantId: string) {
    const result = await this.db.query(attributeValue.delete, [id, tenantId]);
    return { deleted: result.rows[0]?.attribute_value_id ?? null };
  }
}
