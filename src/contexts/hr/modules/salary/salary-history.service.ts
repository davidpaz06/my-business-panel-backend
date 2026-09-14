import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { CreateSalaryHistoryDto } from './dto/salary-history.dto';

const { salaryHistory, employee } = hrQueries;

@Injectable()
export class SalaryHistoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByEmployee(employeeId: string, tenantId: string) {
    await this.assertOwnership(employeeId, tenantId);

    const result = await this.db.query(salaryHistory.listByEmployee, [
      employeeId,
    ]);
    return result.rows;
  }

  /**
   * Resuelve el salario mensual vigente a una fecha dada. Nunca "el
   * ultimo registro": un recalculo historico debe devolver el salario
   * que regia entonces (Arts. 104, 122).
   */
  async resolve(employeeId: string, date: string): Promise<Decimal> {
    const result = await this.db.query(salaryHistory.resolve, [
      employeeId,
      date,
    ]);

    if (!result.rows.length) {
      throw new NotFoundException(
        `No hay salario vigente para el empleado ${employeeId} en la fecha ${date}.`,
      );
    }

    return new Decimal(result.rows[0].monthly_salary);
  }

  async create(tenantId: string, dto: CreateSalaryHistoryDto) {
    await this.assertOwnership(dto.employee_id, tenantId);

    const result = await this.db.query(salaryHistory.create, [
      dto.employee_id,
      tenantId,
      dto.monthly_salary,
      dto.valid_from,
      dto.reason ?? null,
    ]);

    return result.rows[0];
  }

  private async assertOwnership(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getTenantId, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }
  }
}
