import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { hrQueries } from '@hr/hr.queries';
import { Turn } from './interface/turns.interface';
import { RegisterTurnDto, UpdateTurnDto } from './dto/create_turn.dto';
import { CreateTurnError } from '@/common/errors/create_turn.error';
import { classifyJourney } from '../journey/interfaces/journey-classification';
import { JOURNEY_LIMITS } from '../journey/interfaces/journey-limits.interface';

const { turns } = hrQueries;

@Injectable()
export class TurnsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getTurnsByBranch(branchId: string): Promise<Turn[]> {
    try {
      const res = await this.db.query(turns.getByBranch, [branchId]);

      if (res.rows.length === 0) return [];

      return res.rows;
    } catch {
      throw new Error('Failed to get turns by branch');
    }
  }

  /**
   * Clasifica el turno (Art. 173 LOTTT) y rechaza si la duracion excede
   * el maximo diario de la jornada resultante (diurna 8h, nocturna 7h,
   * mixta 7.5h). Un turno que viola el limite nunca debe poder crearse.
   */
  private classifyOrReject(entry: string, out: string) {
    const classification = classifyJourney(entry, out);
    const limit = JOURNEY_LIMITS[classification.effectiveJourney];

    if (limit && classification.totalHours > limit.maxDaily) {
      throw new BadRequestException(
        `El turno de ${entry} a ${out} dura ${classification.totalHours.toFixed(2)} horas y excede el maximo de la jornada ${classification.effectiveJourney} (${limit.maxDaily}h, Art. 173 LOTTT).`,
      );
    }

    return classification;
  }

  async createNewTurn(data: RegisterTurnDto) {
    const { branchId, entry, out } = data;
    const classification = this.classifyOrReject(entry, out);

    try {
      const res = await this.db.query(turns.create, [branchId, entry, out]);

      if (res.rows.length === 0) throw new CreateTurnError();

      return {
        message: 'Turn created successfully',
        turnId: res.rows[0].turn_id,
        journeyType: classification.effectiveJourney,
        totalHours: Number(classification.totalHours.toFixed(2)),
      };
    } catch {
      throw new Error(`Failed to create turn. Internal error.`);
    }
  }

  async updateTurn(turnId: number, data: UpdateTurnDto) {
    const currentResult = await this.db.query(turns.getById, [turnId]);
    if (currentResult.rows.length === 0) {
      throw new BadRequestException(`Turno ${turnId} no encontrado.`);
    }

    const current = currentResult.rows[0];
    const entry = data.entry ?? current.entry;
    const out = data.out ?? current.out;
    const classification = this.classifyOrReject(entry, out);

    try {
      const res = await this.db.query(turns.updateTurn, [entry, out, turnId]);

      if (res.rows.length === 0) throw new Error('Failed to update turn');

      return {
        message: 'Turn updated successfully',
        turnId: res.rows[0].turn_id,
        journeyType: classification.effectiveJourney,
        totalHours: Number(classification.totalHours.toFixed(2)),
      };
    } catch (error) {
      throw new Error(
        `Failed to update turn. Internal error. Check the body: ${error}`,
      );
    }
  }

  async deleteTurn(turnId: number) {
    try {
      const res = await this.db.query(turns.deleteTurn, [turnId]);
      if (res.rows.length === 0) throw new Error('Failed to delete turn');

      return {
        message: 'Turn deleted successfully',
        turnId: res.rows[0].turn_id,
      };
    } catch {
      throw new Error(`Failed to delete turn. Internal error.`);
    }
  }
}
