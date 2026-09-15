import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryService } from '../salary/salary.service';
import { ParametersService } from '../parameters/parameters.service';
import { YearEndBonusDto } from './dto/profit-sharing.dto';
import { monthsBetween } from '../severance/interfaces/severance-calculation';

const { profitSharingPeriod, profitSharingDetail, employee } = hrQueries;

/** Piso legal de la bonificacion de fin de anio (Art. 132). */
const MIN_YEAR_END_BONUS_DAYS = 30;

@Injectable()
export class ProfitSharingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryService: SalaryService,
    private readonly parameters: ParametersService,
  ) {}

  /** Bonificacion de fin de anio (Art. 132): minimo 30 dias, nunca por debajo. */
  async yearEndBonusPreview(
    tenantId: string,
    employeeId: string,
    year: number,
    explain = false,
  ) {
    const dateInYear = `${year}-12-01`;
    let diasUtilidades: Decimal;
    try {
      diasUtilidades = await this.parameters.resolve(
        tenantId,
        'dias_utilidades',
        dateInYear,
      );
    } catch {
      diasUtilidades = new Decimal(MIN_YEAR_END_BONUS_DAYS);
    }

    const days = Decimal.max(diasUtilidades, MIN_YEAR_END_BONUS_DAYS);
    const normalDaily = await this.salaryService.getNormalDaily(
      employeeId,
      tenantId,
      dateInYear,
    );
    const amount = normalDaily.mul(days);

    const periodResult = await this.db.query(profitSharingPeriod.getByYear, [
      tenantId,
      year,
    ]);
    const period = periodResult.rows[0];
    const isNonProfit = period?.is_non_profit ?? false;

    const base = {
      employeeId,
      year,
      days: days.toNumber(),
      amount: amount.toFixed(4),
      article: isNonProfit ? '140' : '132',
      profitSharing: isNonProfit ? null : undefined,
      yearEndBonus: amount.toFixed(4),
    };

    return explain
      ? { ...base, diasUtilidades: diasUtilidades.toFixed(2) }
      : base;
  }

  async payYearEndBonus(tenantId: string, dto: YearEndBonusDto) {
    let period = (
      await this.db.query(profitSharingPeriod.getByYear, [
        tenantId,
        dto.fiscal_year,
      ])
    ).rows[0];

    if (!period) {
      // Art. 137: 2 meses tras el cierre. Dic-31 + 2 meses = Feb-28/29,
      // nunca Marzo (ver profit-sharing-period.service.ts addMonths).
      const yearEnd = `${dto.fiscal_year}-12-31`;
      const lastDayFeb = new Date(
        Date.UTC(dto.fiscal_year + 1, 2, 0),
      ).getUTCDate();
      const paymentDeadline = `${dto.fiscal_year + 1}-02-${String(lastDayFeb).padStart(2, '0')}`;

      const created = await this.db.query(profitSharingPeriod.create, [
        tenantId,
        dto.fiscal_year,
        `${dto.fiscal_year}-01-01`,
        yearEnd,
        false,
        paymentDeadline,
      ]);
      period = created.rows[0];
    }

    const result = await this.db.query(profitSharingDetail.upsertAdvance, [
      period.profit_period_id,
      dto.employee_id,
      dto.amount,
      dto.paid_at,
    ]);

    return result.rows[0];
  }

  async listYearEndBonus(tenantId: string, fiscalYear: number) {
    const period = await this.db.query(profitSharingPeriod.getByYear, [
      tenantId,
      fiscalYear,
    ]);
    if (!period.rows.length) return [];

    const details = await this.db.query(profitSharingDetail.listByPeriod, [
      period.rows[0].profit_period_id,
    ]);
    return details.rows.filter((d) => Number(d.advance_paid) > 0);
  }

  /**
   * Fraccion de utilidades para liquidacion (Art. 131), cuando la
   * relacion termina antes del cierre del ejercicio. SIMPLIFICADO:
   * el monto real depende del cierre contable (beneficios liquidos
   * aun no conocidos); se estima con el minimo de 30 dias
   * prorateado por meses del anio en curso.
   */
  async fraction(tenantId: string, employeeId: string, endDate: string) {
    const empResult = await this.db.query(employee.getForSalary, [employeeId]);
    if (!empResult.rows.length || empResult.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    const yearStart = `${endDate.slice(0, 4)}-01-01`;
    const hire = new Date(`${empResult.rows[0].hire_date}T00:00:00Z`);
    const start = new Date(yearStart);
    const effectiveStart = hire > start ? hire : start;
    const { totalMonths } = monthsBetween(
      effectiveStart,
      new Date(`${endDate}T00:00:00Z`),
    );
    const completeMonths = Math.min(totalMonths, 12);

    const normalDaily = await this.salaryService.getNormalDaily(
      employeeId,
      tenantId,
      endDate,
    );
    const days = (MIN_YEAR_END_BONUS_DAYS * completeMonths) / 12;
    const amount = normalDaily.mul(days);

    return {
      employeeId,
      completeMonths,
      estimatedDays: Number(days.toFixed(2)),
      amount: amount.toFixed(4),
      article: '131',
      note: 'estimado con el minimo legal; el monto final depende del cierre contable del ejercicio',
    };
  }
}
