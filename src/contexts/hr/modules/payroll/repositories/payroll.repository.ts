import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { Inject, Injectable } from '@nestjs/common';
import {
  ActiveDeductionRow,
  EmployeePayrollData,
  Incapacities,
  OvertimeSummary,
  PayrollConceptRow,
} from '../interface/payroll-db.interface';
import { hrQueries } from '@hr/hr.queries';

const { payroll, overtimeRecord } = hrQueries;

@Injectable()
export class PayrollRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getEmployeeContractForPayroll(
    tenantId: string,
    branchId: string,
  ): Promise<EmployeePayrollData[]> {
    const employee = await this.db.query(
      payroll.getEmployeeContractForPayroll,
      [tenantId, branchId],
    );

    return employee.rows.length ? employee.rows : [];
  }

  async getConceptsPerTenant(tenantId: string): Promise<PayrollConceptRow[]> {
    const concepts = await this.db.query(payroll.getConcepts, [tenantId]);
    return concepts.rows;
  }

  /** Horas con recargo del periodo por empleado/tipo (Arts. 117, 118, 120). */
  async getOvertimeSummary(
    branchId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<OvertimeSummary[]> {
    const res = await this.db.query(overtimeRecord.sumWeightedByBranchPeriod, [
      branchId,
      periodStart,
      periodEnd,
    ]);
    return res.rows;
  }

  async getIncapacities(
    branchId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Incapacities[]> {
    const res = await this.db.query(payroll.getIncapacities, [
      branchId,
      periodStart,
      periodEnd,
    ]);

    if (res.rows.length === 0) return [];

    return res.rows.map((r) => ({
      ...r,
      period_start:
        r.period_start instanceof Date
          ? r.period_start.toISOString().split('T')[0]
          : String(r.period_start).split('T')[0],
      period_end:
        r.period_end instanceof Date
          ? r.period_end.toISOString().split('T')[0]
          : String(r.period_end).split('T')[0],
    }));
  }

  /** Deducciones individuales activas de la sucursal (Arts. 152, 154, 412, 413). */
  async getActiveDeductionsForBranch(
    branchId: string,
  ): Promise<ActiveDeductionRow[]> {
    const res = await this.db.query(payroll.getActiveDeductionsForBranch, [
      branchId,
    ]);
    return res.rows;
  }

  async getSuspentionInPeriod(periodStart: string, periodEnd: string) {
    const res = await this.db.query(payroll.getSuspentionPeriod, [
      periodStart,
      periodEnd,
    ]);

    if (res.rows.length === 0) return [];

    return res.rows.map((r) => ({
      ...r,
      suspention_start:
        r.suspention_start instanceof Date
          ? r.suspention_start.toISOString().split('T')[0]
          : String(r.suspention_start).split('T')[0],
      suspention_end:
        r.suspention_end instanceof Date
          ? r.suspention_end.toISOString().split('T')[0]
          : String(r.suspention_end).split('T')[0],
    }));
  }
}
