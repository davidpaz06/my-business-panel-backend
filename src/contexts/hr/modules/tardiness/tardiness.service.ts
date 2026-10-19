import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { hrQueries } from '@hr/hr.queries';

const { tardiness } = hrQueries;

@Injectable()
export class TardinessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getTardinessByEmployee(employeeId: string) {
    try {
      const res = await this.db.query(tardiness.getByEmployee, [employeeId]);

      const count = await this.db.query(tardiness.getCountByEmployee, [
        employeeId,
      ]);

      return {
        tardiness: res.rows,
        totalCount: count.rows[0].total,
      };
    } catch (error) {
      throw new Error(
        `Error fetching tardiness for employee ${employeeId}: ${error}`,
      );
    }
  }

  async getTardinessByBranch(branchId: string) {
    try {
      const res = await this.db.query(tardiness.getByBranch, [branchId]);
      const count = await this.db.query(tardiness.getCountByBranch, [branchId]);
      return {
        tardiness: res.rows,
        totalCount: count.rows[0].total,
      };
    } catch (error) {
      throw new Error(
        `Error fetching tardiness for branch ${branchId}: ${error}`,
      );
    }
  }

  async getTardinessByDateRange(
    startDate: string,
    endDate: string,
    branchId: string,
  ) {
    try {
      const res = await this.db.query(tardiness.getByPeriod, [
        startDate,
        endDate,
        branchId,
      ]);

      const count = await this.db.query(tardiness.getCountByPeriod, [
        startDate,
        endDate,
        branchId,
      ]);
      return {
        tardiness: res.rows,
        totalCount: count.rows[0].total,
      };
    } catch (error) {
      throw new Error(
        `Error fetching tardiness for date range ${startDate} - ${endDate}: ${error}`,
      );
    }
  }
}
