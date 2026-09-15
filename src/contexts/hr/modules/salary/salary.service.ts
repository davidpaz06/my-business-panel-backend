import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryHistoryService } from './salary-history.service';
import { ParametersService } from '../parameters/parameters.service';
import { Salary } from './interfaces/salary.vo';
import { JOURNEY_DAILY_HOURS } from './interfaces/journey-hours.interface';
import { bonusVacationDays } from '../vacations/interfaces/vacation-calculation';
import { monthsBetween } from '../severance/interfaces/severance-calculation';

const { employee } = hrQueries;

@Injectable()
export class SalaryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryHistory: SalaryHistoryService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * Salario diario NORMAL a precision completa (sin redondear a 4
   * decimales). Para consumo de OTROS servicios (severance,
   * settlement, etc.) que multiplican este valor por dias: redondear
   * solo al presentar/persistir el monto FINAL, nunca este
   * intermedio, o el redondeo se compone (ver vacation-period.service.ts).
   */
  async getNormalDaily(
    employeeId: string,
    tenantId: string,
    date: string,
  ): Promise<Decimal> {
    const monthlySalary = await this.salaryHistory.resolve(employeeId, date);
    return monthlySalary.div(30);
  }

  /**
   * Salario NORMAL (Art. 104): base de recargos, feriados, vacaciones
   * y bono vacacional. Nunca usarlo para prestaciones. Respuesta para
   * API: dailySalary viene redondeado a 4 decimales para PRESENTAR,
   * no para reencadenar en otro calculo (usar getNormalDaily() para eso).
   */
  async getNormal(employeeId: string, tenantId: string, date: string) {
    const { journey_type: journeyType } = await this.getEmployeeContext(
      employeeId,
      tenantId,
    );
    const monthlySalary = await this.salaryHistory.resolve(employeeId, date);

    const salary = new Salary(monthlySalary, new Decimal(0), new Decimal(0));
    const dailyHours = JOURNEY_DAILY_HOURS[journeyType] ?? 8;

    return {
      employeeId,
      date,
      journeyType,
      monthlySalary: monthlySalary.toFixed(4),
      dailySalary: salary.daily().toFixed(4),
      hourlyRate: salary.hourly(dailyHours).toFixed(4),
      salaryBasis: 'normal',
      article: '104',
    };
  }

  /**
   * Salario integral diario a precision completa (Art. 122), sin
   * redondear a 4 decimales. Para consumo de OTROS servicios
   * (severance) que multiplican este valor por dias.
   */
  async getIntegralDaily(
    employeeId: string,
    tenantId: string,
    date: string,
  ): Promise<Decimal> {
    const monthlySalary = await this.salaryHistory.resolve(employeeId, date);
    const [diasUtilidades, completeYears] = await Promise.all([
      this.parameters.resolve(tenantId, 'dias_utilidades', date),
      this.getCompleteYears(employeeId, tenantId, date),
    ]);
    const diasBonoVacacional = new Decimal(bonusVacationDays(completeYears));
    const salary = new Salary(
      monthlySalary,
      diasUtilidades,
      diasBonoVacacional,
    );
    return salary.integralDaily();
  }

  /**
   * Salario INTEGRAL (Art. 122): unico admitido para prestaciones e
   * indemnizaciones. Integra salario diario + alicuota de utilidades
   * + alicuota de bono vacacional. Respuesta para API: valores
   * redondeados a 4 decimales para PRESENTAR (usar getIntegralDaily()
   * para reencadenar en otro calculo).
   *
   * La alicuota de bono vacacional SIEMPRE se escala por antiguedad
   * (Art. 192: 15 dias + 1 por anio de servicio, tope 30), nunca el
   * parametro plano del tenant: cada trabajador causa su propio
   * numero de dias segun su hire_date, no un valor unico por tenant.
   */
  async getIntegral(
    employeeId: string,
    tenantId: string,
    date: string,
    explain = false,
  ) {
    const monthlySalary = await this.salaryHistory.resolve(employeeId, date);
    const [diasUtilidades, completeYears] = await Promise.all([
      this.parameters.resolve(tenantId, 'dias_utilidades', date),
      this.getCompleteYears(employeeId, tenantId, date),
    ]);
    const diasBonoVacacional = new Decimal(bonusVacationDays(completeYears));

    const salary = new Salary(
      monthlySalary,
      diasUtilidades,
      diasBonoVacacional,
    );

    const base = {
      employeeId,
      date,
      monthlySalary: monthlySalary.toFixed(4),
      dailySalary: salary.daily().toFixed(4),
      alicuotaUtilidades: salary.alicuotaUtilidades().toFixed(4),
      alicuotaBonoVacacional: salary.alicuotaBonoVacacional().toFixed(4),
      integralDaily: salary.integralDaily().toFixed(4),
      salaryBasis: 'integral',
      article: '122',
    };

    if (!explain) return base;

    return {
      ...base,
      explanation: {
        diasUtilidades: diasUtilidades.toFixed(2),
        diasBonoVacacionalDays: diasBonoVacacional.toFixed(2),
        completeYears,
        commercialYearDays: 360,
        formula:
          'salario_integral = salario_diario + (salario_diario * dias_utilidades / 360) ' +
          '+ (salario_diario * dias_bono_vacacional / 360)',
        bonoVacacionalNote:
          'dias_bono_vacacional = 15 + 1 por anio de antiguedad, tope 30 (Art. 192). ' +
          'Escalado por hire_date del empleado, no por el parametro del tenant.',
      },
    };
  }

  /** Anios completos de antiguedad del empleado a una fecha dada. */
  private async getCompleteYears(
    employeeId: string,
    tenantId: string,
    date: string,
  ): Promise<number> {
    const { hire_date: hireDate } = await this.getEmployeeContext(
      employeeId,
      tenantId,
    );
    return monthsBetween(
      new Date(`${hireDate}T00:00:00Z`),
      new Date(`${date}T00:00:00Z`),
    ).completeYears;
  }

  private async getEmployeeContext(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    return result.rows[0] as {
      employee_id: string;
      tenant_id: string;
      hire_date: string;
      journey_type: string;
      weekly_hours: string;
    };
  }
}
