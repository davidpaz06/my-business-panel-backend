import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import {
  NewSuspentionDto,
  UpdateSuspention,
} from './dto/create_suspention.dto';
import { hrQueries } from '@hr/hr.queries';
import { CreateSuspentionError } from '@/common/errors/new_suspention.error';
import { Suspention } from './interface/suspentions.interface';
import { Cron, CronExpression } from '@nestjs/schedule';

const { suspention } = hrQueries;

@Injectable()
export class SuspentionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registerNewSuspention(data: NewSuspentionDto) {
    try {
      const { employee_id, suspentionStart, suspentionEnd, reason, branchId } =
        data;

      const res = await this.db.query(suspention.create, [
        employee_id,
        suspentionStart,
        suspentionEnd,
        reason,
        branchId,
      ]);

      if (res.rows.length === 0) throw new CreateSuspentionError();

      return {
        message: 'Suspention registered succesfully',
        suspentionId: res.rows[0].suspention_id,
      };
    } catch (error) {
      throw new Error(`Internal Error: ${error}`);
    }
  }

  async getSuspentionsByEmployee(
    employeeId: string,
  ): Promise<Suspention[] | { message: string }> {
    try {
      const res = await this.db.query(suspention.getByEmployee, [employeeId]);
      if (res.rows.length === 0)
        return {
          message: 'No suspentions found for this employee',
        };
      return res.rows;
    } catch (error) {
      throw new Error(`Internal Error: ${error}`);
    }
  }

  async getSuspentionsByBranch(
    branchId: string,
  ): Promise<Suspention[] | { message: string }> {
    try {
      const res = await this.db.query(suspention.getByBranch, [branchId]);
      if (res.rows.length === 0)
        return {
          message: 'No suspentions found for this branch',
        };
      return res.rows;
    } catch (error) {
      throw new Error(`Internal Error: ${error}`);
    }
  }

  async closeSuspention(suspentionId: string) {
    try {
      const exists = await this.db.query(suspention.getById, [suspentionId]);

      if (exists.rows.length === 0) throw new Error('Suspention not found');

      const res = await this.db.query(suspention.closeSuspention, [
        suspentionId,
      ]);

      if (res.rows.length === 0) throw new Error('Failed to close suspention');

      return {
        message: 'Suspention closed succesfully',
        suspentionId: res.rows[0].suspention_id,
      };
    } catch (error) {
      throw new Error(`Internal Error: ${error}`);
    }
  }

  async updateSuspention(suspentionId: string, data: UpdateSuspention) {
    try {
      const { suspentionStart, suspentionEnd, reason } = data;

      const res = await this.db.query(suspention.updateSuspention, [
        suspentionStart,
        suspentionEnd,
        reason,
        suspentionId,
      ]);

      if (res.rows.length === 0) throw new Error('Failed to update suspention');

      return {
        message: 'Suspention updated successfully',
        id: res.rows[0].suspention_id,
      };
    } catch (error) {
      throw new Error(`Internal Error: ${error}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAndCloseExpiredSuspentions() {
    await this.db.query(suspention.cronJobSuspention);
  }
}
