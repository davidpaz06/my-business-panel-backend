import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { ContractDto } from '../employee/dto/newEmployeeDto.dto';
import { hrQueries } from '@hr/hr.queries';
import { Contract } from '../employee/interface/employee.interface';
import { JOURNEY_LIMITS } from '../journey/interfaces/journey-limits.interface';

const { contract } = hrQueries;

@Injectable()
export class ContractService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async updateContract(contract_id: string, data: ContractDto) {
    const existingContract = await this.db.query(contract.byId, [contract_id]);

    if (existingContract.rows.length === 0) {
      throw new Error(`Contract with id ${contract_id} not found.`);
    }

    const current = existingContract.rows[0];
    const {
      start_date,
      end_date,
      hours,
      base_salary,
      duties_type_id,
      turn_type,
      turn_id,
      journey_type,
      weekly_hours,
    } = data;

    // Art. 173 LOTTT: el tope semanal depende del tipo de jornada
    // EFECTIVO tras la actualizacion (el que se envia, o el que ya
    // tenia el contrato si no cambia en este PATCH).
    const effectiveJourneyType = journey_type ?? current.journey_type;
    const effectiveWeeklyHours = weekly_hours ?? current.weekly_hours;
    const limit = JOURNEY_LIMITS[effectiveJourneyType];

    if (limit && Number(effectiveWeeklyHours) > limit.maxWeekly) {
      throw new BadRequestException(
        `La jornada '${effectiveJourneyType}' no puede superar ${limit.maxWeekly} horas semanales (Art. 173 LOTTT).`,
      );
    }

    const updatedContract = await this.db.query(contract.update, [
      start_date ?? null,
      end_date ?? null,
      hours ?? null,
      base_salary ?? null,
      duties_type_id ?? null,
      turn_type ?? null,
      turn_id ?? null,
      contract_id,
      journey_type ?? null,
      weekly_hours ?? null,
    ]);

    return {
      message: 'Contract updated successfully',
      contract: updatedContract.rows[0],
    };
  }

  async getContractById(contract_id: string): Promise<Contract | null> {
    const result = await this.db.query(contract.byId, [contract_id]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async getPaymentSchedules() {
    const result = await this.db.query(contract.getSchedule);
    return result.rows;
  }
}
