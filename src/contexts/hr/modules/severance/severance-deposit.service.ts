import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryService } from '../salary/salary.service';
import { ParametersService } from '../parameters/parameters.service';
import { GenerateDepositsDto, UpdateDepositDto } from './dto/severance.dto';

const { severanceDeposit, employee } = hrQueries;

/** Suma 3 meses a una fecha 'YYYY-MM-DD', preservando dia. */
function addQuarter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function subtractOneDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class SeveranceDepositService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryService: SalaryService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * Genera los depositos trimestrales desde el ingreso hasta `until`
   * (Art. 142.a). Cada trimestre congela SU salario integral
   * vigente: un aumento posterior no lo modifica. Idempotente
   * (ON CONFLICT DO NOTHING sobre employee_id+quarter_start).
   */
  async generate(tenantId: string, dto: GenerateDepositsDto) {
    const emp = await this.getEmployee(dto.employee_id, tenantId);
    const created: unknown[] = [];

    let quarterStart = emp.hireDate;
    const diasGarantia = await this.parameters
      .resolve(tenantId, 'dias_garantia_trimestral', dto.until)
      .catch(() => new Decimal(15));

    while (quarterStart <= dto.until) {
      const quarterEndCandidate = subtractOneDay(addQuarter(quarterStart));
      const quarterEnd =
        quarterEndCandidate > dto.until ? dto.until : quarterEndCandidate;

      const integralDaily = await this.salaryService.getIntegralDaily(
        dto.employee_id,
        tenantId,
        quarterStart,
      );
      const amount = integralDaily.mul(diasGarantia);

      const result = await this.db.query(severanceDeposit.create, [
        dto.employee_id,
        tenantId,
        quarterStart,
        quarterEnd,
        diasGarantia.toString(),
        integralDaily.toFixed(4),
        amount.toFixed(4),
        true,
        quarterEnd,
        dto.location,
      ]);

      if (result.rows.length) created.push(result.rows[0]);
      quarterStart = addQuarter(quarterStart);
    }

    return { generated: created.length, deposits: created };
  }

  async listByEmployee(tenantId: string, employeeId: string) {
    await this.getEmployee(employeeId, tenantId);
    const result = await this.db.query(severanceDeposit.listByEmployee, [
      employeeId,
    ]);
    return result.rows;
  }

  async listPending(tenantId: string, employeeId: string) {
    await this.getEmployee(employeeId, tenantId);
    const result = await this.db.query(severanceDeposit.listPending, [
      employeeId,
    ]);
    return result.rows;
  }

  async updateDepositMade(
    tenantId: string,
    depositId: string,
    dto: UpdateDepositDto,
  ) {
    const existing = await this.db.query(severanceDeposit.getById, [depositId]);
    if (!existing.rows.length || existing.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Deposito ${depositId} no encontrado.`);
    }

    const result = await this.db.query(severanceDeposit.updateDepositMade, [
      dto.deposit_made,
      dto.deposit_date ?? (dto.deposit_made ? new Date().toISOString().slice(0, 10) : null),
      depositId,
    ]);

    return result.rows[0];
  }

  async sumMadeAmount(employeeId: string): Promise<Decimal> {
    const result = await this.db.query(severanceDeposit.sumMadeAmount, [
      employeeId,
    ]);
    return new Decimal(result.rows[0].total);
  }

  async getEmployee(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    const row = result.rows[0];
    return {
      // hire_date::text ya viene como 'YYYY-MM-DD'; NUNCA reenvolver en
      // new Date().toISOString() (node-postgres parsea DATE en hora
      // local y ese roundtrip desplaza un dia segun el TZ del host).
      hireDate: row.hire_date as string,
      journeyType: row.journey_type as string,
    };
  }
}
