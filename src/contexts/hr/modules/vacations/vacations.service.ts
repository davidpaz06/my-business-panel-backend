import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { hrQueries } from '@hr/hr.queries';
import {
  vacationDays,
  bonusVacationDays,
} from './interfaces/vacation-calculation';
import { monthsBetween } from '../severance/interfaces/severance-calculation';
import { VacationPeriodService } from './vacation-period.service';

const { employee } = hrQueries;

@Injectable()
export class VacationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly periods: VacationPeriodService,
  ) {}

  /** Preview puro (Art. 190), sin empleado. */
  entitlement(years: number) {
    const days = vacationDays(years);
    return {
      years,
      days,
      rightVested: years >= 1,
      capped: days === 30,
      article: '190',
    };
  }

  /** Preview puro (Art. 192), sin empleado. */
  bonusEntitlement(years: number) {
    const bonusDays = bonusVacationDays(years);
    return { years, bonusDays, capped: bonusDays === 30, article: '192' };
  }

  /**
   * Entitlement de un empleado real. Si no se pasa `years`, se
   * calcula la antiguedad al `date` (o hoy) desde su hire_date.
   */
  async entitlementByEmployee(
    tenantId: string,
    employeeId: string,
    years: number | undefined,
    includeBonus: boolean,
    includeShiftCompensation: boolean,
    date?: string,
  ) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    let effectiveYears = years;
    if (effectiveYears === undefined) {
      const hire = new Date(`${result.rows[0].hire_date}T00:00:00Z`);
      const end = new Date(
        `${date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      );
      effectiveYears = monthsBetween(hire, end).completeYears;
    }

    const days = vacationDays(effectiveYears);
    const response: Record<string, unknown> = {
      employeeId,
      years: effectiveYears,
      days,
      baseDays: days,
      capped: days === 30,
    };

    if (includeBonus) {
      const bonusDays = bonusVacationDays(effectiveYears);
      response.bonusDays = bonusDays;
      response.vacationDays = days;
      response.totalDays = days + bonusDays;
    }

    if (includeShiftCompensation) {
      // Art. 176: las semanas de 6 dias se compensan con 1 dia
      // adicional de vacaciones. Sin registro de jornadas por turno,
      // se documenta el campo en 0 (no hay datos de origen para
      // calcularlo automaticamente).
      response.compensatoryDays = 0;
      response.totalDays = ((response.totalDays as number) ?? days) + 0;
    }

    return response;
  }

  /**
   * Fraccion por terminacion antes de cumplir el anio (Art. 196).
   * Solo cuentan los MESES COMPLETOS; vacaciones y bono se
   * prorratean con el mismo divisor.
   */
  fraction(hireDate: string, endDate: string, explain = false) {
    const { totalMonths } = monthsBetween(
      new Date(`${hireDate}T00:00:00Z`),
      new Date(`${endDate}T00:00:00Z`),
    );

    // "Anio siguiente" para quien aun no cumple el primero es el anio 1.
    const vacDaysYear1 = vacationDays(1);
    const bonusDaysYear1 = bonusVacationDays(1);

    const vacationFraction = (vacDaysYear1 * totalMonths) / 12;
    const bonusFraction = (bonusDaysYear1 * totalMonths) / 12;

    const base = {
      completeMonths: totalMonths,
      vacationFraction: Number(vacationFraction.toFixed(2)),
      bonusFraction: Number(bonusFraction.toFixed(2)),
      totalDays: Number((vacationFraction + bonusFraction).toFixed(2)),
      article: '196',
    };

    return explain
      ? { ...base, divisor: 12, vacDaysYear1, bonusDaysYear1 }
      : base;
  }

  /** Combina periodos causados + fraccion del anio en curso (Art. 196). */
  async settlementPreview(
    tenantId: string,
    employeeId: string,
    endDate: string,
  ) {
    const causedPeriods = await this.periods.listByEmployee(
      tenantId,
      employeeId,
    );
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    const hireDate = result.rows[0].hire_date as string;
    const lastAnniversaryYears = causedPeriods.length;
    const currentPeriodStart = new Date(`${hireDate}T00:00:00Z`);
    currentPeriodStart.setUTCFullYear(
      currentPeriodStart.getUTCFullYear() + lastAnniversaryYears,
    );

    const fractionResult = this.fraction(
      currentPeriodStart.toISOString().slice(0, 10),
      endDate,
    );

    return {
      causedPeriods,
      currentYearFraction: fractionResult,
    };
  }
}
