import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { posQueries } from '@pos/pos.queries';
import { NewLoyalProgramDto } from './dto/newLoyalProgram.dto';
import { LoyalProgram } from './interface/loyal-program.interface';
import { UpdateLoyalProgramDto } from './dto/updateLoyalProgram.dto';

const { loyaltyProgram } = posQueries;

@Injectable()
export class LoyalProgramService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getLoyalProgramsByTenant(tenant_id: string): Promise<LoyalProgram[]> {
    const programs = await this.db.query(loyaltyProgram.all, [tenant_id]);
    return programs.rows;
  }

  // scopeTenantId: tenant de la sesion; null solo para el superusuario de
  // plataforma. Un programa de otro tenant responde como si no existiera.
  async getLoyalProgramById(
    program_id: string,
    scopeTenantId: string | null,
  ): Promise<LoyalProgram> {
    const program = await this.db.query(loyaltyProgram.byId, [
      program_id,
      scopeTenantId,
    ]);

    if (program.rows.length === 0)
      throw new NotFoundException(
        `Loyal Program with id ${program_id} not found.`,
      );

    return program.rows[0];
  }

  async createLoyalProgram(tenant_id: string, data: NewLoyalProgramDto) {
    const {
      points_earned_per_currency_unit,
      points_redeemed_per_currency_unit,
      minimum_purchase_for_points,
    } = data;

    await this.db.query(loyaltyProgram.create, [
      tenant_id,
      points_earned_per_currency_unit,
      points_redeemed_per_currency_unit,
      minimum_purchase_for_points || 0,
    ]);

    return { message: 'Loyal Program created successfully' };
  }

  async deleteLoyalProgram(program_id: string, scopeTenantId: string | null) {
    const program = await this.db.query(loyaltyProgram.delete, [
      program_id,
      scopeTenantId,
    ]);

    if (program.rowCount === 0)
      throw new NotFoundException(
        `Loyal Program with id ${program_id} not found.`,
      );

    return { message: 'Loyal Program deleted successfully' };
  }

  async updateLoyalProgram(
    data: UpdateLoyalProgramDto,
    program_id: string,
    scopeTenantId: string | null,
  ) {
    const {
      points_earned_per_currency_unit,
      points_redeemed_per_currency_unit,
      minimum_purchase_for_points,
      is_active,
    } = data;

    const programUpdated = await this.db.query(loyaltyProgram.update, [
      program_id,
      points_earned_per_currency_unit,
      points_redeemed_per_currency_unit,
      minimum_purchase_for_points,
      is_active,
      scopeTenantId,
    ]);

    if (programUpdated.rowCount === 0)
      throw new NotFoundException(
        `Loyal Program with id ${program_id} not found.`,
      );
    return {
      message: `Loyal Program with id ${programUpdated.rows[0].loyalty_program_id} updated successfully`,
    };
  }
}
