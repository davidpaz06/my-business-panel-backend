import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { PayrollMovement } from './interface/payroll_movement.interface';
import { hrQueries } from '@hr/hr.queries';

const { payrollMovement } = hrQueries;

@Injectable()
export class PayrollMovementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getPayrollMovementsByPaysheet(
    paysheetId: string,
  ): Promise<PayrollMovement[]> {
    const result = await this.db.query(payrollMovement.getMovementsByPaysheet, [
      paysheetId,
    ]);

    if (result.rows.length === 0) return [];

    return result.rows;
  }

  async getPayrollMovementsByDetail(
    detailId: string,
  ): Promise<PayrollMovement[]> {
    const result = await this.db.query(payrollMovement.getMovementsByDetail, [
      detailId,
    ]);
    if (result.rows.length === 0) return [];
    return result.rows;
  }
}
