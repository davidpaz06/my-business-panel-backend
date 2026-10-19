import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';
import {
  CreateTenantProductGroupTypeDto,
  UpdateTenantProductGroupTypeDto,
} from './dto/tenant-product-group-type.dto';

const { tenantProductGroupType } = generalQueries;

@Injectable()
export class TenantProductGroupTypeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByTenant(tenantId: string) {
    const result = await this.db.query(tenantProductGroupType.byTenant, [
      tenantId,
    ]);
    return result.rows;
  }

  async getById(id: string, tenantId: string) {
    const result = await this.db.query(tenantProductGroupType.byId, [
      id,
      tenantId,
    ]);
    return result.rows[0];
  }

  async create(data: CreateTenantProductGroupTypeDto) {
    const result = await this.db.query(tenantProductGroupType.create, [
      data.tenant_id,
      data.type_name,
      data.description ?? null,
      data.is_active ?? null,
    ]);
    return result.rows[0];
  }

  async update(
    id: string,
    tenantId: string,
    data: UpdateTenantProductGroupTypeDto,
  ) {
    const result = await this.db.query(tenantProductGroupType.update, [
      id,
      tenantId,
      data.type_name ?? null,
      data.description ?? null,
      data.is_active ?? null,
    ]);
    return result.rows[0];
  }

  async delete(id: string, tenantId: string) {
    try {
      const result = await this.db.query(tenantProductGroupType.delete, [
        id,
        tenantId,
      ]);
      return { deleted: result.rows[0]?.tenant_product_group_type_id ?? null };
    } catch (err: any) {
      if (
        err?.code === '23503' &&
        err?.constraint?.includes('royalty_option')
      ) {
        throw new BadRequestException(
          'No se puede eliminar esta dimensión porque tiene reglas de regalía asociadas. Elimine las reglas de regalía vinculadas a esta dimensión antes de continuar.',
        );
      }
      throw err;
    }
  }
}
