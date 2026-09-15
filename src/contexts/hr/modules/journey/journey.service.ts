import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryHistoryService } from '../salary/salary-history.service';
import {
  JOURNEY_LIMITS,
  JOURNEY_EXCEPTION_REGIMES,
} from './interfaces/journey-limits.interface';
import { classifyJourney } from './interfaces/journey-classification';

const { contract: contractQueries, employee, overtimeRecord } = hrQueries;

@Injectable()
export class JourneyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryHistory: SalaryHistoryService,
  ) {}

  getLimits(journeyType?: string, regime?: string) {
    if (regime) {
      const info = JOURNEY_EXCEPTION_REGIMES[regime];
      if (!info) {
        throw new BadRequestException(`Regimen '${regime}' no reconocido.`);
      }
      return { regime, exempt: false, ...info };
    }

    const type = journeyType ?? 'diurna';
    const limit = JOURNEY_LIMITS[type];

    if (!limit) {
      throw new BadRequestException(`Tipo de jornada '${type}' invalido.`);
    }

    return { journeyType: type, ...limit, article: '173' };
  }

  async getLimitsByContract(contractId: string) {
    const result = await this.db.query(contractQueries.byId, [contractId]);

    if (!result.rows.length) {
      throw new NotFoundException(`Contrato ${contractId} no encontrado.`);
    }

    const row = result.rows[0];
    const limit = JOURNEY_LIMITS[row.journey_type] ?? JOURNEY_LIMITS.diurna;

    return {
      contractId,
      journeyType: row.journey_type,
      weeklyHours: row.weekly_hours,
      ...limit,
      article: '173',
    };
  }

  classify(startTime: string, endTime: string) {
    const result = classifyJourney(startTime, endTime);
    return {
      totalHours: Number(result.totalHours.toFixed(2)),
      diurnalHours: Number(result.diurnalHours.toFixed(2)),
      nocturnalHours: Number(result.nocturnalHours.toFixed(2)),
      effectiveJourney: result.effectiveJourney,
      maxDaily: result.maxDaily,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  /** Recargo nocturno (Art. 117): monto sobre salario NORMAL. */
  async getNightBonus(
    tenantId: string,
    employeeId: string,
    from: string,
    to: string,
    explain = false,
  ) {
    const emp = await this.getEmployeeContext(employeeId, tenantId);
    const records = await this.db.query(
      overtimeRecord.listByEmployeeRangeKind,
      [employeeId, 'nocturna', from, to],
    );

    let totalAmount = new Decimal(0);
    let totalHours = new Decimal(0);
    let lastBaseHourly = new Decimal(0);
    let lastRateFactor = new Decimal(0);

    for (const record of records.rows) {
      const monthly = await this.salaryHistory.resolve(
        employeeId,
        record.work_date,
      );
      const dailyHours = JOURNEY_LIMITS[emp.journeyType]?.maxDaily ?? 8;
      const baseHourly = monthly.div(30).div(dailyHours);
      const rateFactor = new Decimal(record.rate_factor);
      const nightHourly = baseHourly.mul(rateFactor);
      const amount = nightHourly.mul(record.hours);

      totalAmount = totalAmount.add(amount);
      totalHours = totalHours.add(record.hours);
      lastBaseHourly = baseHourly;
      lastRateFactor = rateFactor;
    }

    const base = {
      employeeId,
      from,
      to,
      hours: totalHours.toNumber(),
      baseHourly: lastBaseHourly.toFixed(4),
      rateFactor: lastRateFactor.toFixed(2),
      nightHourly: lastBaseHourly.mul(lastRateFactor).toFixed(4),
      amount: totalAmount.toFixed(4),
      salaryBasis: 'normal',
      article: '117',
    };

    if (!explain) return base;

    return {
      ...base,
      baseDaily: lastBaseHourly
        .mul(JOURNEY_LIMITS[emp.journeyType]?.maxDaily ?? 8)
        .toFixed(4),
    };
  }

  /** Horas extra pagadas del periodo (Art. 118), desglosadas por autorizacion. */
  async getOvertimePay(
    tenantId: string,
    employeeId: string,
    from: string,
    to: string,
  ) {
    const emp = await this.getEmployeeContext(employeeId, tenantId);
    const records = await this.db.query(
      overtimeRecord.listByEmployeeRangeKind,
      [employeeId, 'extra', from, to],
    );

    let authorizedAmount = new Decimal(0);
    let authorizedHours = new Decimal(0);
    let unauthorizedAmount = new Decimal(0);
    let unauthorizedHours = new Decimal(0);

    for (const record of records.rows) {
      const monthly = await this.salaryHistory.resolve(
        employeeId,
        record.work_date,
      );
      const dailyHours = JOURNEY_LIMITS[emp.journeyType]?.maxDaily ?? 8;
      const baseHourly = monthly.div(30).div(dailyHours);
      const amount = baseHourly.mul(record.rate_factor).mul(record.hours);

      if (record.inspectoria_authorized) {
        authorizedAmount = authorizedAmount.add(amount);
        authorizedHours = authorizedHours.add(record.hours);
      } else {
        unauthorizedAmount = unauthorizedAmount.add(amount);
        unauthorizedHours = unauthorizedHours.add(record.hours);
      }
    }

    return {
      employeeId,
      from,
      to,
      authorized: {
        hours: authorizedHours.toNumber(),
        amount: authorizedAmount.toFixed(4),
        rateFactor: 1.5,
      },
      unauthorized: {
        hours: unauthorizedHours.toNumber(),
        amount: unauthorizedAmount.toFixed(4),
        rateFactor: 2.0,
      },
      total: authorizedAmount.add(unauthorizedAmount).toFixed(4),
      article: '118',
    };
  }

  /** Pago del dia feriado trabajado (Art. 120): el dia + labor con 50%. */
  async getHolidayPay(tenantId: string, employeeId: string, date: string) {
    const emp = await this.getEmployeeContext(employeeId, tenantId);
    const monthly = await this.salaryHistory.resolve(employeeId, date);
    const dailySalary = monthly.div(30);
    const dailyHours = JOURNEY_LIMITS[emp.journeyType]?.maxDaily ?? 8;

    const records = await this.db.query(overtimeRecord.listByEmployeeDateKind, [
      employeeId,
      date,
      'feriado',
    ]);

    let workAmount = new Decimal(0);
    const hourly = dailySalary.div(dailyHours);
    for (const record of records.rows) {
      workAmount = workAmount.add(
        hourly.mul(record.rate_factor).mul(record.hours),
      );
    }

    return {
      employeeId,
      date,
      dayAmount: dailySalary.toFixed(4),
      workAmount: workAmount.toFixed(4),
      total: dailySalary.add(workAmount).toFixed(4),
      article: '120',
      salaryBasis: 'normal',
    };
  }

  private async getEmployeeContext(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    return {
      journeyType: result.rows[0].journey_type as string,
    };
  }
}
