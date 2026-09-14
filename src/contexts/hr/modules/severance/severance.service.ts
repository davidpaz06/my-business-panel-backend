import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryService } from '../salary/salary.service';
import { ParametersService } from '../parameters/parameters.service';
import { SeveranceDepositService } from './severance-deposit.service';
import {
  additionalDays,
  computableYears,
  daysBetween,
  monthsBetween,
} from './interfaces/severance-calculation';

const { employee } = hrQueries;

@Injectable()
export class SeveranceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryService: SalaryService,
    private readonly parameters: ParametersService,
    private readonly deposits: SeveranceDepositService,
  ) {}

  /** Dias adicionales por antiguedad, en aislado (Art. 142.b). */
  additionalDaysPreview(years: number) {
    const days = additionalDays(years);
    return {
      completeYears: years,
      additionalDays: days,
      capped: days === 30,
      article: '142.b',
    };
  }

  /**
   * Preview puro del retroactivo (Art. 142.c), sin tenant ni salario:
   * usa el piso legal de 30 dias/anio.
   */
  retroactivePreview(hireDate: string, endDate: string) {
    const { completeYears, remainderMonths } = monthsBetween(
      new Date(`${hireDate}T00:00:00Z`),
      new Date(`${endDate}T00:00:00Z`),
    );
    const compYears = computableYears(completeYears, remainderMonths);

    return {
      completeYears,
      remainderMonths,
      computableYears: compYears,
      days: compYears * 30,
      article: '142.c',
    };
  }

  /**
   * Preview de la seleccion sin datos de deposito reales (sin
   * tenant/empleado): solo dias, no montos. Documentado como
   * simplificacion: sin depositos persistidos, la via1 (garantia)
   * no puede evaluarse, por lo que la seleccion asume 'retroactivo'
   * cuando la antiguedad supera los 3 meses.
   */
  calculatePreview(hireDate: string, endDate: string) {
    const hire = new Date(`${hireDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const { completeYears, remainderMonths, totalMonths } = monthsBetween(hire, end);

    if (totalMonths < 3) {
      const monthsOrFraction = Math.ceil(daysBetween(hire, end) / 30);
      return {
        selectedVia: 'antiguedad_corta',
        monthsOrFraction,
        days: 5 * monthsOrFraction,
        article: '142.e',
      };
    }

    const compYears = computableYears(completeYears, remainderMonths);
    return {
      selectedVia: 'retroactivo',
      completeYears,
      remainderMonths,
      computableYears: compYears,
      days: compYears * 30,
      article: '142.c',
      note: 'preview sin datos de deposito persistidos; via1 (garantia) no evaluada',
    };
  }

  /** Calculo completo por empleado (Art. 142, seleccion del MAX). */
  async calculate(tenantId: string, employeeId: string, endDate: string) {
    const emp = await this.getEmployee(employeeId, tenantId);
    const hire = new Date(`${emp.hireDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const { completeYears, remainderMonths, totalMonths } = monthsBetween(hire, end);

    // Excepcion antiguedad < 3 meses (Art. 142.e): sustituye ambos esquemas.
    if (totalMonths < 3) {
      const diasPorMes = await this.parameters.resolve(
        tenantId,
        'dias_por_mes_antiguedad_corta',
        endDate,
      );
      const dailySalary = await this.salaryService.getNormalDaily(employeeId, tenantId, endDate);
      const monthsOrFraction = Math.ceil(daysBetween(hire, end) / 30);
      const amount = dailySalary.mul(diasPorMes).mul(monthsOrFraction);

      return {
        employeeId,
        endDate,
        completeYears,
        remainderMonths,
        selectedVia: 'antiguedad_corta',
        monthsOrFraction,
        normalDailySalary: dailySalary.toFixed(4),
        severanceAmount: amount.toFixed(4),
        article: '142.e',
      };
    }

    const lastIntegralDaily = await this.salaryService.getIntegralDaily(employeeId, tenantId, endDate);

    // Via 1 (142.a + 142.b): garantia depositada + dias adicionales.
    const depositsSum = await this.deposits.sumMadeAmount(employeeId);
    const addDays = additionalDays(completeYears);
    const via1 = depositsSum.add(lastIntegralDaily.mul(addDays));

    // Via 2 (142.c): retroactivo al ultimo salario integral.
    const compYears = computableYears(completeYears, remainderMonths);
    const diasRetro = await this.parameters.resolve(
      tenantId,
      'dias_retroactivo_por_anio',
      endDate,
    );
    const via2 = lastIntegralDaily.mul(diasRetro).mul(compYears);

    // Seleccion (142.d): se paga el MAYOR.
    const severanceAmount = Decimal.max(via1, via2);
    const selectedVia = via1.gte(via2) ? 'garantia' : 'retroactivo';

    return {
      employeeId,
      endDate,
      completeYears,
      remainderMonths,
      additionalDays: addDays,
      computableYears: compYears,
      lastIntegralDailySalary: lastIntegralDaily.toFixed(4),
      via1Amount: via1.toFixed(4),
      via2Amount: via2.toFixed(4),
      selectedVia,
      severanceAmount: severanceAmount.toFixed(4),
      article: '142.d',
    };
  }

  private async getEmployee(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    // hire_date::text ya viene como 'YYYY-MM-DD'; NUNCA reenvolver en
    // new Date().toISOString() (desplaza un dia segun el TZ del host).
    return {
      hireDate: result.rows[0].hire_date as string,
    };
  }
}
