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
import { EnjoyVacationDto, PayBonusDto } from './dto/vacation.dto';
import {
  vacationDays,
  bonusVacationDays,
} from './interfaces/vacation-calculation';
import { daysBetween } from '../severance/interfaces/severance-calculation';

const { vacationPeriod, employee } = hrQueries;

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function subtractOneDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class VacationPeriodService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryHistory: SalaryHistoryService,
  ) {}

  /** Genera un periodo por cada aniversario cumplido (Arts. 190, 192). */
  async generate(tenantId: string, employeeId: string, until: string) {
    const hireDate = await this.getHireDate(employeeId, tenantId);
    const created: unknown[] = [];

    let serviceYear = 1;
    let anniversary = addYears(hireDate, 1);

    while (anniversary <= until) {
      const periodStart = addYears(hireDate, serviceYear - 1);
      const periodEnd = subtractOneDay(anniversary);

      const result = await this.db.query(vacationPeriod.create, [
        employeeId,
        tenantId,
        serviceYear,
        periodStart,
        periodEnd,
        vacationDays(serviceYear),
        bonusVacationDays(serviceYear),
      ]);

      if (result.rows.length) created.push(result.rows[0]);
      serviceYear += 1;
      anniversary = addYears(hireDate, serviceYear);
    }

    return { generated: created.length, periods: created };
  }

  async listByEmployee(tenantId: string, employeeId: string) {
    await this.getHireDate(employeeId, tenantId);
    const result = await this.db.query(vacationPeriod.listByEmployee, [
      employeeId,
    ]);
    return result.rows;
  }

  async listPending(tenantId: string, employeeId: string) {
    await this.getHireDate(employeeId, tenantId);
    const result = await this.db.query(vacationPeriod.listPending, [
      employeeId,
    ]);
    return result.rows;
  }

  /**
   * Registra el disfrute. Base salarial: salario NORMAL del mes
   * ANTERIOR al disfrute (Art. 121) — se aproxima con el ultimo dia
   * del mes previo a enjoyed_from.
   */
  async enjoy(tenantId: string, periodId: string, dto: EnjoyVacationDto) {
    const period = await this.getPeriod(periodId, tenantId);
    const daysRequested =
      daysBetween(
        new Date(`${dto.enjoyed_from}T00:00:00Z`),
        new Date(`${dto.enjoyed_to}T00:00:00Z`),
      ) + 1;

    const availableDays =
      Number(period.days_earned) - Number(period.days_taken);
    if (daysRequested > availableDays) {
      throw new BadRequestException(
        `El periodo tiene ${availableDays} dias disponibles; se solicitaron ${daysRequested}.`,
      );
    }

    const priorMonthEnd = this.lastDayOfPriorMonth(dto.enjoyed_from);
    const salary = await this.salaryHistory.resolve(
      period.employee_id,
      priorMonthEnd,
    );
    // Redondear solo al PERSISTIR el monto final: multiplicar por
    // dias_earned con precision completa antes de fijar 4 decimales,
    // no reencadenar el redondeo del salario diario ya guardado.
    const dailySalary = salary.div(30);
    const paidAmount = dailySalary.mul(period.days_earned);

    const result = await this.db.query(vacationPeriod.enjoy, [
      Number(period.days_taken) + daysRequested,
      dto.enjoyed_from,
      dto.enjoyed_to,
      dailySalary.toFixed(4),
      paidAmount.toFixed(4),
      periodId,
    ]);

    return result.rows[0];
  }

  /** Monto de vacaciones del periodo (Art. 190). Salario NORMAL, nunca integral. */
  async amount(tenantId: string, periodId: string, explain = false) {
    const period = await this.getPeriod(periodId, tenantId);
    const dailySalary = new Decimal(period.normal_daily_salary ?? 0);
    // Preferir el monto ya persistido (calculado con precision completa
    // en enjoy()); recalcular solo como respaldo si aun no se disfruto.
    const amount = period.paid_amount
      ? new Decimal(period.paid_amount)
      : dailySalary.mul(period.days_earned);

    const base = {
      days: Number(period.days_earned),
      dailySalary: dailySalary.toFixed(4),
      amount: amount.toFixed(4),
      salaryBasis: 'normal',
      article: '190',
    };

    return explain ? { ...base, baseDaily: dailySalary.toFixed(4) } : base;
  }

  /**
   * Monto del bono vacacional del periodo (Art. 192). Recalcula el
   * salario diario a precision completa (no reencadena el redondeo
   * de la columna normal_daily_salary ya persistida a 4 decimales).
   */
  async bonusAmount(tenantId: string, periodId: string) {
    const period = await this.getPeriod(periodId, tenantId);
    const referenceDate = period.enjoyed_from
      ? this.lastDayOfPriorMonth(period.enjoyed_from)
      : period.period_end;
    const salary = await this.salaryHistory.resolve(
      period.employee_id,
      referenceDate,
    );
    const amount = salary.div(30).mul(period.bonus_days_earned);

    return {
      days: Number(period.bonus_days_earned),
      amount: amount.toFixed(4),
      salaryBasis: 'normal',
      article: '192',
    };
  }

  async payBonus(tenantId: string, periodId: string, _dto: PayBonusDto) {
    const { amount } = await this.bonusAmount(tenantId, periodId);
    const result = await this.db.query(vacationPeriod.payBonus, [
      amount,
      periodId,
    ]);
    return result.rows[0];
  }

  /**
   * Valor de las vacaciones causadas y NO disfrutadas (Art. 195): se
   * pagan al salario normal DE LA TERMINACION, no al historico de
   * cada periodo causado.
   */
  async pendingValue(
    tenantId: string,
    employeeId: string,
    endDate: string,
    explain = false,
  ) {
    await this.getHireDate(employeeId, tenantId);
    const pending = await this.db.query(vacationPeriod.listPending, [
      employeeId,
    ]);
    const terminationSalary = await this.salaryHistory.resolve(
      employeeId,
      endDate,
    );
    const dailySalary = terminationSalary.div(30);

    let totalDays = new Decimal(0);
    const periods = pending.rows.map((p) => {
      const pendingDays = new Decimal(p.days_earned).sub(p.days_taken);
      totalDays = totalDays.add(pendingDays);
      return {
        serviceYear: p.service_year,
        daysEarned: p.days_earned,
        pendingDays: pendingDays.toFixed(2),
      };
    });

    const amount = dailySalary.mul(totalDays);

    const base = {
      employeeId,
      endDate,
      totalPendingDays: totalDays.toFixed(2),
      dailySalary: dailySalary.toFixed(4),
      amount: amount.toFixed(4),
      article: '195',
      salaryBasis: 'normal',
    };

    return explain ? { ...base, periods } : base;
  }

  /**
   * Bono vacacional causado y NO pagado (Art. 192). Es un concepto
   * DISTINTO de las vacaciones: un periodo puede tener el disfrute ya
   * pagado y el bono todavia pendiente, por eso se rastrea por
   * bonus_paid_amount y no por days_taken. Se valora al salario normal
   * de la terminacion, igual que el Art. 195.
   */
  async pendingBonusValue(
    tenantId: string,
    employeeId: string,
    endDate: string,
    explain = false,
  ) {
    await this.getHireDate(employeeId, tenantId);
    const pending = await this.db.query(vacationPeriod.listBonusPending, [
      employeeId,
    ]);
    const terminationSalary = await this.salaryHistory.resolve(
      employeeId,
      endDate,
    );
    const dailySalary = terminationSalary.div(30);

    let totalDays = new Decimal(0);
    const periods = pending.rows.map((p) => {
      totalDays = totalDays.add(new Decimal(p.bonus_days_earned));
      return {
        serviceYear: p.service_year,
        bonusDaysEarned: p.bonus_days_earned,
      };
    });

    const base = {
      employeeId,
      endDate,
      totalPendingBonusDays: totalDays.toFixed(2),
      dailySalary: dailySalary.toFixed(4),
      amount: dailySalary.mul(totalDays).toFixed(4),
      article: '192',
      salaryBasis: 'normal',
    };

    return explain ? { ...base, periods } : base;
  }

  private lastDayOfPriorMonth(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(0); // ultimo dia del mes anterior
    return d.toISOString().slice(0, 10);
  }

  private async getPeriod(periodId: string, tenantId: string) {
    const result = await this.db.query(vacationPeriod.getById, [periodId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(
        `Periodo vacacional ${periodId} no encontrado.`,
      );
    }
    return result.rows[0];
  }

  private async getHireDate(
    employeeId: string,
    tenantId: string,
  ): Promise<string> {
    const result = await this.db.query(employee.getForSalary, [employeeId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }
    return result.rows[0].hire_date as string;
  }
}
