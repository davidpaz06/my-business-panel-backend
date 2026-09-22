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
  CreateProfitPeriodDto,
  SetLiquidBenefitsDto,
  UpdatePercentageDto,
} from './dto/profit-sharing.dto';
import { monthsBetween } from '../severance/interfaces/severance-calculation';

const { profitSharingPeriod, profitSharingDetail, employee } = hrQueries;

/** Piso legal del reparto de utilidades (Art. 131). */
const MIN_DISTRIBUTION_PERCENTAGE = 0.15;
const MIN_DAYS = 30;
const MAX_DAYS = 120;

/**
 * Suma n meses, con CLAMPING al ultimo dia del mes destino. Sin esto,
 * '2026-12-31' + 2 meses no da '2027-02-28': JS normaliza el
 * desborde de dia y salta a marzo (Date.setUTCMonth no clampa).
 */
function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  const targetIndex = d.getUTCMonth() + n;
  const targetYear = d.getUTCFullYear() + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay))
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class ProfitSharingPeriodService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryHistory: SalaryHistoryService,
  ) {}

  async create(tenantId: string, dto: CreateProfitPeriodDto) {
    const paymentDeadline = addMonths(dto.fiscal_year_end, 2); // Art. 137
    const result = await this.db.query(profitSharingPeriod.create, [
      tenantId,
      dto.fiscal_year,
      dto.fiscal_year_start,
      dto.fiscal_year_end,
      dto.is_non_profit ?? false,
      paymentDeadline,
    ]);
    return result.rows[0];
  }

  async getById(tenantId: string, periodId: string) {
    return this.assertOwnership(periodId, tenantId);
  }

  /** Ejercicios del tenant, del mas reciente al mas viejo. */
  async listByTenant(tenantId: string) {
    const result = await this.db.query(profitSharingPeriod.listByTenant, [
      tenantId,
    ]);
    return result.rows;
  }

  async getByYear(tenantId: string, year: number) {
    const result = await this.db.query(profitSharingPeriod.getByYear, [
      tenantId,
      year,
    ]);
    if (!result.rows.length) {
      throw new NotFoundException(
        `No hay ejercicio de utilidades para el anio ${year}.`,
      );
    }
    return result.rows[0];
  }

  async setLiquidBenefits(
    tenantId: string,
    periodId: string,
    dto: SetLiquidBenefitsDto,
  ) {
    await this.assertOwnership(periodId, tenantId);
    const result = await this.db.query(profitSharingPeriod.setLiquidBenefits, [
      dto.liquid_benefits,
      periodId,
    ]);
    return result.rows[0];
  }

  async updatePercentage(
    tenantId: string,
    periodId: string,
    dto: UpdatePercentageDto,
  ) {
    await this.assertOwnership(periodId, tenantId);

    if (dto.distribution_percentage < MIN_DISTRIBUTION_PERCENTAGE) {
      throw new BadRequestException(
        `El porcentaje de reparto no puede ser menor al piso legal (${MIN_DISTRIBUTION_PERCENTAGE}) (Art. 131).`,
      );
    }

    const result = await this.db.query(profitSharingPeriod.updatePercentage, [
      dto.distribution_percentage,
      periodId,
    ]);
    return result.rows[0];
  }

  async close(tenantId: string, periodId: string) {
    await this.assertOwnership(periodId, tenantId);
    const result = await this.db.query(profitSharingPeriod.close, [periodId]);
    return result.rows[0];
  }

  /** Reparto (Arts. 131, 136): cociente sobre la sumatoria de TODOS los salarios devengados. */
  async calculate(tenantId: string, periodId: string) {
    const period = await this.assertOwnership(periodId, tenantId);

    if (period.status === 'cerrado') {
      throw new BadRequestException('Un ejercicio cerrado no se recalcula.');
    }
    if (!period.liquid_benefits) {
      throw new BadRequestException(
        'Cargar los beneficios liquidos antes de calcular.',
      );
    }

    const employees = await this.db.query(employee.listActiveForTenant, [
      tenantId,
    ]);
    const distributable = new Decimal(period.distributable_amount);

    const rows: {
      employeeId: string;
      earnedSalary: Decimal;
      completeMonths: number;
      dailySalary: Decimal;
    }[] = [];
    let totalEarned = new Decimal(0);

    for (const emp of employees.rows) {
      const hire = new Date(`${emp.hire_date}T00:00:00Z`);
      const periodStart = new Date(`${period.fiscal_year_start}T00:00:00Z`);
      const periodEnd = new Date(`${period.fiscal_year_end}T00:00:00Z`);
      const effectiveStart = hire > periodStart ? hire : periodStart;

      if (effectiveStart > periodEnd) continue; // aun no ingresaba en el ejercicio

      const { totalMonths } = monthsBetween(effectiveStart, periodEnd);
      const completeMonths = Math.min(totalMonths, 12);

      let monthlySalary: Decimal;
      try {
        monthlySalary = await this.salaryHistory.resolve(
          emp.employee_id,
          period.fiscal_year_end,
        );
      } catch {
        continue; // sin salario vigente al cierre, se excluye del reparto
      }

      const earnedSalary = monthlySalary.mul(completeMonths);
      totalEarned = totalEarned.add(earnedSalary);

      rows.push({
        employeeId: emp.employee_id,
        earnedSalary,
        completeMonths,
        dailySalary: monthlySalary.div(30),
      });
    }

    const details: unknown[] = [];
    for (const row of rows) {
      const rawQuota = totalEarned.isZero()
        ? new Decimal(0)
        : distributable.div(totalEarned).mul(row.earnedSalary);

      const minCap = row.dailySalary
        .mul(MIN_DAYS)
        .mul(row.completeMonths)
        .div(12);
      const maxCap = row.dailySalary
        .mul(MAX_DAYS)
        .mul(row.completeMonths)
        .div(12);
      const finalAmount = Decimal.max(minCap, Decimal.min(rawQuota, maxCap));

      const result = await this.db.query(profitSharingDetail.upsert, [
        periodId,
        row.employeeId,
        row.earnedSalary.toFixed(4),
        row.completeMonths,
        row.dailySalary.toFixed(4),
        rawQuota.toFixed(4),
        minCap.toFixed(4),
        maxCap.toFixed(4),
        finalAmount.toFixed(4),
      ]);
      details.push(result.rows[0]);
    }

    await this.db.query(profitSharingPeriod.setTotals, [
      totalEarned.toFixed(4),
      periodId,
    ]);

    return {
      totalEarnedSalaries: totalEarned.toFixed(4),
      employeeCount: details.length,
      details,
    };
  }

  async listDetails(tenantId: string, periodId: string) {
    await this.assertOwnership(periodId, tenantId);
    const result = await this.db.query(profitSharingDetail.listByPeriod, [
      periodId,
    ]);
    return result.rows;
  }

  async getDetailByEmployee(
    tenantId: string,
    periodId: string,
    employeeId: string,
  ) {
    await this.assertOwnership(periodId, tenantId);
    const result = await this.db.query(profitSharingDetail.getByEmployee, [
      periodId,
      employeeId,
    ]);
    if (!result.rows.length) {
      throw new NotFoundException(
        `No hay detalle de utilidades para el empleado ${employeeId} en este ejercicio.`,
      );
    }

    const row = result.rows[0];
    const finalAmount = new Decimal(row.final_amount ?? 0);
    const advancePaid = new Decimal(row.advance_paid ?? 0);
    const pending = Decimal.max(0, finalAmount.sub(advancePaid));

    return { ...row, pending: pending.toFixed(4) };
  }

  /**
   * Preview prorateado por meses completos, sin ejecutar el reparto
   * completo (test de topes minimo/maximo por antiguedad parcial).
   */
  async preview(tenantId: string, periodId: string, hireDate: string) {
    const period = await this.assertOwnership(periodId, tenantId);
    const { totalMonths } = monthsBetween(
      new Date(`${hireDate}T00:00:00Z`),
      new Date(`${period.fiscal_year_end}T00:00:00Z`),
    );
    const completeMonths = Math.min(totalMonths, 12);

    return {
      completeMonths,
      minDays: MIN_DAYS,
      maxDays: MAX_DAYS,
      article: '131',
    };
  }

  private async assertOwnership(periodId: string, tenantId: string) {
    const result = await this.db.query(profitSharingPeriod.getById, [periodId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(
        `Ejercicio de utilidades ${periodId} no encontrado.`,
      );
    }
    return result.rows[0];
  }
}
