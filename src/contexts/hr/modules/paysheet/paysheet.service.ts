import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { hrQueries } from '@hr/hr.queries';
import { Paysheet, PaysheetDetails } from './interface/paysheet.interface';

const { paysheet } = hrQueries;

@Injectable()
export class PaysheetService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getPaysheetsByTenant(tenantId: string): Promise<Paysheet[]> {
    const result = await this.db.query(paysheet.getTenantPaysheets, [tenantId]);

    if (result.rows.length === 0) return [];

    return result.rows;
  }

  async getPaysheetById(paysheetId: string): Promise<Paysheet | null> {
    const result = await this.db.query(paysheet.getPaysheetById, [paysheetId]);

    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async getPaysheetByBranch(branchId: string): Promise<Paysheet[]> {
    const result = await this.db.query(paysheet.getBranchPaysheets, [branchId]);

    if (result.rows.length === 0) return [];

    return result.rows;
  }

  async getPaysheetByPeriod(
    branchId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Paysheet[]> {
    const result = await this.db.query(paysheet.filtrateByDate, [
      branchId,
      periodStart,
      periodEnd,
    ]);

    if (result.rows.length === 0) return [];

    return result.rows;
  }

  async getPaysheetDetails(paysheetId: string): Promise<PaysheetDetails[]> {
    const result = await this.db.query(paysheet.getDetails, [paysheetId]);

    if (result.rows.length === 0) return [];
    return result.rows;
  }
}
