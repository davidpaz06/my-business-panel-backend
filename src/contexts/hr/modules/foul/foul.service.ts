import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { RegisterFoulDto } from './dto/create_foul.dto';
import { hrQueries } from '@hr/hr.queries';
import { CreateFoulError } from '@/common/errors/foul_create.error';
import { Cron, CronExpression } from '@nestjs/schedule';

const { foul } = hrQueries;

@Injectable()
export class FoulService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registerFoul(data: RegisterFoulDto) {
    try {
      const {
        employee_id,
        branch_id,
        identificator,
        foul_date,
        foul_hour,
        description,
      } = data;

      const res = await this.db.query(foul.create, [
        employee_id,
        branch_id,
        identificator,
        foul_date,
        foul_hour,
        description,
      ]);

      if (res.rows.length === 0) throw new CreateFoulError();

      return {
        message: 'Foul registered succesfully',
        foulId: res.rows[0].foul_id,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error registering foul:', error.message);
      } else {
        console.error('Unknown error registering foul');
      }
      throw new CreateFoulError();
    }
  }

  async getFoulsByEmployee(employeeId: string) {
    try {
      const count = await this.db.query(foul.foulCounts, [employeeId]);
      const fouls = await this.db.query(foul.getByEmployee, [employeeId]);

      return {
        totalFouls: count.rows[0].total_fouls,
        fouls: fouls.rows,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching fouls for employee:', error.message);
      } else {
        console.error('Unknown error fetching fouls for employee');
      }
      throw new Error('Failed to fetch fouls for employee');
    }
  }

  async getFoulsByBranch(branchId: string) {
    try {
      const count = await this.db.query(foul.foulCountByBranch, [branchId]);
      const fouls = await this.db.query(foul.getByBranch, [branchId]);

      return {
        totalFouls: count.rows[0].total_fouls,
        fouls: fouls.rows,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching fouls for branch:', error.message);
      } else {
        console.error('Unknown error fetching fouls for branch');
      }
      throw new Error('Failed to fetch fouls for branch');
    }
  }

  /** scopeTenantId null = sin filtro (superusuario de plataforma). */
  async getFoulsByPeriod(
    startDate: string,
    endDate: string,
    scopeTenantId: string | null,
  ) {
    try {
      const fouls = await this.db.query(foul.getByPeriod, [
        startDate,
        endDate,
        scopeTenantId,
      ]);

      return fouls.rows;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching fouls by period:', error.message);
      } else {
        console.error('Unknown error fetching fouls by period');
      }
      throw new Error('Failed to fetch fouls for the specified period');
    }
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanFoulsByBranch() {
    try {
      const config = await this.db.query(foul.getConfigforBranch);

      for (const c of config.rows) {
        await this.db.query(foul.cleanOldFouls, [
          c.branch_id,
          c.foul_expiration_months,
        ]);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error during scheduled foul cleanup:', error.message);
      } else {
        console.error('Unknown error during scheduled foul cleanup');
      }
      throw new Error('Failed to cleanup old fouls');
    }
  }
}
