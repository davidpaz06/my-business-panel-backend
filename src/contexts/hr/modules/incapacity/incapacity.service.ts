import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import {
  RegisterIncapacityDto,
  UpdateIncapacityDto,
} from './dto/register_incapacity.dto';
import { hrQueries } from '@hr/hr.queries';
import { RegisterIncapacityError } from '@/common/errors/register_incapacity.error';
import { Incapacity } from './interface/incapacity.interface';

const { incapacities } = hrQueries;

@Injectable()
export class IncapacityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registerIncapacity(data: RegisterIncapacityDto) {
    try {
      const {
        employee_id,
        branch_id,
        type,
        period_start,
        period_end,
        days_paying,
        percentage_to_pay,
      } = data;

      const res = await this.db.query(incapacities.create, [
        employee_id,
        branch_id,
        type,
        period_start,
        period_end,
        days_paying,
        percentage_to_pay,
      ]);

      if (res.rowCount === 0) {
        throw new RegisterIncapacityError(employee_id);
      }

      return {
        message: 'Incapacity registered successfully',
        id: res.rows[0].incapacity_id,
      };
    } catch (error) {
      throw new Error(`Error registering incapacity: ${error}`);
    }
  }

  async getIncapacitiesByBranch(branchId: string): Promise<Incapacity[]> {
    try {
      const res = await this.db.query(incapacities.byBranch, [branchId]);
      return res.rows;
    } catch (error) {
      throw new Error(`Error fetching incapacities by branch: ${error}`);
    }
  }

  async getIncapacitiesByEmployee(employeeId: string): Promise<Incapacity[]> {
    try {
      const res = await this.db.query(incapacities.byEmployee, [employeeId]);
      return res.rows;
    } catch (error) {
      throw new Error(`Error fetching incapacities by employee: ${error}`);
    }
  }

  async updateIncapacityRegister(
    incapacityId: string,
    data: UpdateIncapacityDto,
  ) {
    try {
      const { type, period_start, period_end, days_paying, percentage_to_pay } =
        data;

      const res = await this.db.query(incapacities.update, [
        incapacityId,
        type,
        period_start,
        period_end,
        days_paying,
        percentage_to_pay,
      ]);

      return { message: 'Incapacity updated successfully' };
    } catch (error) {
      throw new Error(`Error updating incapacity: ${error}`);
    }
  }

  async closeIncapacity(incapacityId: string) {
    try {
      const res = await this.db.query(incapacities.deactivate, [incapacityId]);
      return {
        message: 'Incapacity closed successfully',
        id: res.rows[0].incapacity_id,
      };
    } catch (error) {
      throw new Error(`Error closing incapacity: ${error}`);
    }
  }
}
