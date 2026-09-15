import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PayrollRepository } from '../repositories/payroll.repository';
import { CalculationEngine } from './calc-engine.service';
import { AccountingJournalService } from '@/contexts/finances/modules/accounting/accounting-journal.service';
import { hrQueries } from '@hr/hr.queries';
import { CreatePaysheetDto } from '../dto/create-paysheet.dto';
import {
  EmployeePayrollData,
  Incapacities,
  PayrollConceptRow,
} from '../interface/payroll-db.interface';
import { JOURNEY_LIMITS } from '../../journey/interfaces/journey-limits.interface';
import Decimal from 'decimal.js';

interface OvertimeTotals {
  nocturnaWeightedHours: number;
  extraWeightedHours: number;
  feriadoWeightedHours: number;
}

const { payroll } = hrQueries;

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repo: PayrollRepository,
    private readonly engine: CalculationEngine,
    private readonly journalService: AccountingJournalService,
  ) {}

  async processPayrollForEmployee(
    paysheetId: string,
    branchId: string,
    tenantId: string,
    periodStart: string,
    periodEnd: string,
    paymentMethodId: number,
  ) {
    const concepts = await this.repo.getConceptsPerTenant(tenantId);
    const incomes = concepts.filter((c) => c.type === 'earning');
    const deductions = concepts.filter((c) => c.type === 'deduction');

    const incapacities = await this.repo.getIncapacities(
      branchId,
      periodStart,
      periodEnd,
    );

    const suspentions = await this.repo.getSuspentionInPeriod(
      periodStart,
      periodEnd,
    );

    const suspentionMap = new Map<
      string,
      { suspention_start: string; suspention_end: string }
    >(
      suspentions.map((s) => [
        s.employee_id,
        {
          suspention_start: s.suspention_start,
          suspention_end: s.suspention_end,
        },
      ]),
    );

    const employees = await this.repo.getEmployeeContractForPayroll(
      tenantId,
      branchId,
    );

    if (employees.length === 0) {
      throw new BadRequestException(
        'No hay empleados activos con contrato asignados a esta sucursal.',
      );
    }

    // Horas con recargo del periodo (Arts. 117, 118, 120), ya factorizadas
    // por evento en hr_schema.overtime_record (1+recargo, o el doble sin
    // autorizacion de Inspectoria en horas extra, Art. 182).
    const overtimeSummary = await this.repo.getOvertimeSummary(
      branchId,
      periodStart,
      periodEnd,
    );

    const overtimeMap = new Map<string, OvertimeTotals>();

    for (const row of overtimeSummary) {
      const current = overtimeMap.get(row.employee_id) || {
        nocturnaWeightedHours: 0,
        extraWeightedHours: 0,
        feriadoWeightedHours: 0,
      };
      const weighted = Number(row.weighted_hours);
      if (row.kind === 'nocturna') current.nocturnaWeightedHours += weighted;
      if (row.kind === 'extra') current.extraWeightedHours += weighted;
      if (row.kind === 'feriado') current.feriadoWeightedHours += weighted;
      overtimeMap.set(row.employee_id, current);
    }

    for (const emp of employees) {
      const empOvertime = overtimeMap.get(emp.employee_id) || {
        nocturnaWeightedHours: 0,
        extraWeightedHours: 0,
        feriadoWeightedHours: 0,
      };
      const empSuspentions = suspentionMap.get(emp.employee_id) || {
        suspention_start: '',
        suspention_end: '',
      };

      const susDiscount = this.calculateSuspentionDiscount(
        empSuspentions.suspention_start,
        empSuspentions.suspention_end,
        periodStart,
        periodEnd,
        new Decimal(emp.base_salary),
      );

      await this.calculateAndSavePayroll(
        emp,
        incomes,
        deductions,
        paysheetId,
        empOvertime,
        incapacities,
        susDiscount,
        paymentMethodId,
      );
    }

    const totals = await this.closePayroll(paysheetId, employees.length);

    // Registro de gasto contable — no bloqueante
    try {
      await this.db.query(payroll.insertPayrollExpense, [
        tenantId,
        branchId,
        totals.net_total,
        paysheetId,
        periodStart,
        periodEnd,
      ]);
    } catch (expenseError) {
      this.logger.error(
        `Error registering payroll expense for paysheet ${paysheetId}: ${(expenseError as Error).message}`,
      );
    }

    return totals;
  }

  private async calculateAndSavePayroll(
    emp: EmployeePayrollData,
    incomeConcepts: PayrollConceptRow[],
    deductionConcepts: PayrollConceptRow[],
    paysheetId: string,
    overtime: OvertimeTotals,
    incapacities: Incapacities[],
    discount: number,
    paymentMethodId: number,
  ) {
    const incapacityInfo = incapacities.find(
      (i) => i.employee_id === emp.employee_id,
    );

    // Horas de jornada segun Art. 173 (fuente unica: JOURNEY_LIMITS), no
    // el campo legado contract.turn_type.
    const journeyHours = JOURNEY_LIMITS[emp.journey_type]?.maxDaily ?? 8;

    const salaryWithDiscount = new Decimal(emp.base_salary).minus(
      new Decimal(discount),
    );

    const incomeResult = this.engine.execute(
      salaryWithDiscount.toString(),
      incomeConcepts,
      {
        journeyHours,
        nocturnaWeightedHours: overtime.nocturnaWeightedHours,
        extraWeightedHours: overtime.extraWeightedHours,
        feriadoWeightedHours: overtime.feriadoWeightedHours,
        incapacityDays: incapacityInfo ? incapacityInfo.days_paying : 0,
        incapacityPercentage: incapacityInfo
          ? incapacityInfo.percentage_to_pay
          : 0,
        percentage: incapacityInfo ? incapacityInfo.percentage_to_pay : 0,
      },
    );

    const currentGrossSalary = incomeResult.totals.taxableBase;

    const deductionResult = this.engine.execute(
      emp.base_salary,
      deductionConcepts,
      {
        gross: new Decimal(currentGrossSalary),
      },
    );

    const allMovements = [
      ...incomeResult.movements,
      ...deductionResult.movements,
    ];
    const netSalary = new Decimal(incomeResult.totals.earnings).minus(
      new Decimal(deductionResult.totals.deductions),
    );

    const allTotals = {
      grossSalary: incomeResult.totals.grossSalary,
      earnings: incomeResult.totals.earnings,
      deductions: deductionResult.totals.deductions,
      netSalary: netSalary.plus(emp.base_salary),
    };

    const txn = await this.db.transaction();
    try {
      const { rows } = await txn.query(payroll.insertDetail, [
        paysheetId,
        emp.employee_id,
        emp.contract_id,
        paymentMethodId,
        allTotals.grossSalary,
        allTotals.earnings,
        allTotals.deductions,
        allTotals.netSalary.toString(),
        new Date(),
      ]);
      const detailId = rows[0].detail_id;

      for (const mov of allMovements) {
        await txn.query(payroll.insertMovement, [
          detailId,
          mov.concept_id,
          mov.appliedValue.toString(), // base_amount: valor/factor de entrada
          mov.calculated_amount.toString(), // calculated_amount: resultado monetario
          mov.name,
        ]);
      }

      await txn.commit();
    } catch (error) {
      await txn.rollback();
      console.error('Error processing payroll transaction:', error);
      throw new Error(
        'Failed to process payroll for employee ' + emp.employee_id,
      );
    }
  }

  async createPaysheetHeader(tenantId: string, data: CreatePaysheetDto) {
    const newPaysheet = await this.db.query(payroll.insertPaysheet, [
      tenantId,
      data.branchId,
      data.periodStart,
      data.periodEnd,
    ]);

    return newPaysheet.rows[0];
  }

  async closePayroll(paysheetId: string, expectedEmployeeCount: number) {
    const verify = await this.db.query(payroll.verifyPaysheet, [paysheetId]);
    const actualCount = parseInt(verify.rows[0].total);

    if (actualCount !== expectedEmployeeCount) {
      throw new Error(
        `Paysheet cannot be closed. Expected ${expectedEmployeeCount} employees, but found ${actualCount} processed.`,
      );
    }

    const result = await this.db.query(payroll.closePaysheet, [paysheetId]);

    if (result.rows.length === 0) {
      throw Error(
        'Paysheey not found or cant be closed. (Maybe theres no details generated)',
      );
    }

    const totals = result.rows[0];

    // Generate payroll journal entry (non-blocking — log errors but don't fail)
    try {
      const txn = await this.db.transaction();
      try {
        await this.journalService.generatePayrollJournal(
          {
            tenantId: totals.tenant_id,
            paysheetId,
            totalEarnings: Number(totals.total_earnings),
            totalDeductions: Number(totals.total_deductions),
            netTotal: Number(totals.net_total),
            entryDate: new Date(),
          },
          txn,
        );
        await txn.commit();
      } catch (txnError) {
        await txn.rollback();
        throw txnError;
      }
    } catch (journalError) {
      this.logger.error(
        `Error generating payroll journal for paysheet ${paysheetId}: ${(journalError as Error).message}`,
      );
    }

    return totals;
  }

  calculateSuspentionDiscount(
    start: string,
    end: string,
    periodStart: string,
    periodEnd: string,
    base_salary: Decimal,
  ) {
    if (!start || !end || start === '' || end === '') return 0;

    let discount = 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const periodStartDate = new Date(periodStart);
    const periodEndDate = new Date(periodEnd);

    const effectiveStart =
      startDate > periodStartDate ? startDate : periodStartDate;
    const effectiveEnd = endDate < periodEndDate ? endDate : periodEndDate;

    const timeDiff = effectiveEnd.getTime() - effectiveStart.getTime();

    const dayDiff = Math.max(Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1, 0);
    const dailySalary = base_salary.dividedBy(30);

    discount = dailySalary.times(dayDiff).toNumber();

    return discount;
  }
}
