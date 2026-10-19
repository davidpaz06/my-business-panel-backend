import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { hrQueries } from '@hr/hr.queries';
import type {
  CreateDutiesTypeDto,
  UpdateDutiesTypeDto,
} from './dto/duties-type.dto';

const { dutiesType } = hrQueries;

@Injectable()
export class DutiesTypeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByTenant(tenantId: string) {
    const result = await this.db.query(dutiesType.listByTenant, [tenantId]);
    return result.rows;
  }

  async create(tenantId: string, data: CreateDutiesTypeDto) {
    const result = await this.db.query(dutiesType.create, [
      tenantId,
      data.name,
      data.description ?? null,
    ]);
    return { message: 'Tipo de cargo creado', dutiesType: result.rows[0] };
  }

  async update(id: number, data: UpdateDutiesTypeDto) {
    const existing = await this.db.query(dutiesType.getById, [id]);
    if (!existing.rows.length)
      throw new NotFoundException(`Tipo de cargo ${id} no encontrado`);

    const result = await this.db.query(dutiesType.update, [
      data.name ?? null,
      data.description ?? null,
      id,
    ]);
    return { message: 'Tipo de cargo actualizado', dutiesType: result.rows[0] };
  }

  async remove(id: number) {
    const existing = await this.db.query(dutiesType.getById, [id]);
    if (!existing.rows.length)
      throw new NotFoundException(`Tipo de cargo ${id} no encontrado`);

    await this.db.query(dutiesType.softDelete, [id]);
    return { message: `Tipo de cargo ${id} eliminado` };
  }
}
