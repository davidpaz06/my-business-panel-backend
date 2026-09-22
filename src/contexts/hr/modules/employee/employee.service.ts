import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import {
  Employee,
  IEmployee,
  IEmployeeDetail,
} from './interface/employee.interface';
import { hrQueries } from '@hr/hr.queries';
import { NewEmployeeDto, NewSingleEmployeeDto } from './dto/newEmployeeDto.dto';
import { CreateFullEmployeeError } from '@/common/errors/create_full_employee.error';
import { UpdateEmployeeDto } from './dto/updateEmployee.dto';
import {
  TerminateEmployeeDto,
  UpdateTerminationDto,
} from './dto/terminateEmployee.dto';

const { employee } = hrQueries;

@Injectable()
export class EmployeeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getEmployeesByTenant(tenantId: string): Promise<Employee[]> {
    const tenantEmployees = await this.db.query(employee.getByTenant, [
      tenantId,
    ]);

    if (tenantEmployees.rows.length === 0) return [];

    return tenantEmployees.rows;
  }

  async getEmployeeById(employee_id: string): Promise<IEmployee | null> {
    const result = await this.db.query(employee.getById, [employee_id]);
    if (result.rows.length === 0) return null;

    return result.rows[0];
  }

  async getEmployeeByUserId(user_id: string): Promise<IEmployeeDetail | null> {
    const result = await this.db.query(employee.getByUserId, [user_id]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async checkAvailability(
    field: string,
    value: string,
    tenantId?: string,
    excludeId?: string,
  ): Promise<{ exists: boolean }> {
    const allowedFields: Record<
      string,
      { column: string; tenantScoped: boolean }
    > = {
      doc_number: { column: 'doc_number', tenantScoped: false },
      email: { column: 'email', tenantScoped: false },
      phone: { column: 'phone', tenantScoped: true },
    };

    const def = allowedFields[field];
    if (!def) {
      throw new BadRequestException(
        `Field '${field}' no soportado. Use doc_number | email | phone.`,
      );
    }
    if (!value) return { exists: false };

    const params: any[] = [value];
    let where = `${def.column} = $1`;

    if (def.tenantScoped) {
      if (!tenantId) {
        throw new BadRequestException('tenant_id es requerido para phone');
      }
      params.push(tenantId);
      where += ` AND tenant_id = $${params.length}`;
    }
    if (excludeId) {
      params.push(excludeId);
      where += ` AND employee_id <> $${params.length}`;
    }

    const result = await this.db.query(
      `SELECT 1 FROM hr_schema.employee WHERE ${where} LIMIT 1`,
      params,
    );
    return { exists: result.rows.length > 0 };
  }

  async getEmployeesByBranchAndTenant(
    branchId: string,
    tenantId: string,
  ): Promise<Employee[]> {
    const branchEmployees = await this.db.query(employee.getByBranchAndTenant, [
      branchId,
      tenantId,
    ]);

    if (branchEmployees.rows.length === 0) return [];

    return branchEmployees.rows;
  }

  async createEmployeeWithContract(data: NewEmployeeDto) {
    const {
      user_id,
      tenant_id,
      branch_id,
      first_name,
      last_name,
      doc_number,
      identification_type_id,
      phone,
      email,
      payment_schedule_id,
      contractData,
    } = data;

    const newEmp = await this.db.query(employee.full, [
      contractData.start_date,
      contractData.end_date,
      contractData.hours,
      contractData.base_salary,
      null,
      contractData.turn_type,
      contractData.turn_id,
      user_id ?? null,
      tenant_id,
      first_name,
      last_name,
      doc_number,
      phone,
      email,
      payment_schedule_id,
      branch_id,
      identification_type_id ?? 1,
      contractData.duties_type_id ?? null,
    ]);

    if (newEmp.rowCount === 0) return new CreateFullEmployeeError();

    return {
      message: 'Employee and Contract created successfully',
      employee: newEmp.rows[0],
    };
  }

  // Ask for this
  async createEmployee(data: NewSingleEmployeeDto) {
    const {
      user_id,
      tenant_id,
      first_name,
      last_name,
      doc_number,
      phone,
      email,
      payment_schedule_id,
    } = data;

    const newEmp = await this.db.query(employee.create, [
      user_id,
      tenant_id,
      first_name,
      last_name,
      doc_number,
      phone,
      email,
      payment_schedule_id,
    ]);

    if (newEmp.rowCount === 0) return new CreateFullEmployeeError();

    return {
      message: 'Employee created successfully',
      employee: newEmp.rows[0],
    };
  }

  async updateEmployeeInfo(employee_id: string, data: UpdateEmployeeDto) {
    const existingEmp = await this.db.query(employee.getById, [employee_id]);
    if (existingEmp.rows.length === 0)
      throw new NotFoundException(`Empleado ${employee_id} no encontrado.`);

    const {
      first_name,
      last_name,
      doc_number,
      identification_type_id,
      phone,
      email,
      payment_schedule_id,
      branch_id,
    } = data;

    const updatedEmp = await this.db.query(employee.update, [
      first_name,
      last_name,
      doc_number,
      phone,
      email,
      payment_schedule_id,
      branch_id,
      identification_type_id ?? null,
      employee_id,
    ]);

    if (updatedEmp.rowCount === 0)
      throw new BadRequestException(
        'Error updating employee info. Check input data.',
      );

    return {
      message: 'Employee info updated successfully',
      employee: updatedEmp.rows[0],
    };
  }

  async deactivateEmployee(employee_id: string) {
    const existingEmp = await this.db.query(employee.getById, [employee_id]);
    if (existingEmp.rows.length === 0)
      throw new NotFoundException(`Empleado ${employee_id} no encontrado.`);

    await this.db.query(employee.deactivate, [employee_id]);

    return {
      message: `Employee with id: ${employee_id} deactivated successfully.`,
    };
  }

  /** Registra el egreso del empleado (Arts. 92, 142.f, 145 LOTTT). */
  async terminate(
    employee_id: string,
    tenant_id: string,
    data: TerminateEmployeeDto,
  ) {
    const existingEmp = await this.db.query(employee.getTerminationInfo, [
      employee_id,
    ]);
    if (
      existingEmp.rows.length === 0 ||
      existingEmp.rows[0].tenant_id !== tenant_id
    )
      throw new NotFoundException(`Empleado ${employee_id} no encontrado.`);

    if (data.termination_date < existingEmp.rows[0].hire_date) {
      throw new BadRequestException(
        'La fecha de egreso no puede ser anterior a la fecha de ingreso.',
      );
    }

    const result = await this.db.query(employee.terminate, [
      data.termination_date,
      data.termination_type,
      data.termination_reason ?? null,
      employee_id,
      tenant_id,
    ]);

    return {
      message: 'Egreso registrado correctamente',
      employee: result.rows[0],
    };
  }

  async updateTermination(
    employee_id: string,
    tenant_id: string,
    data: UpdateTerminationDto,
  ) {
    const existing = await this.db.query(employee.getTerminationInfo, [
      employee_id,
    ]);
    if (!existing.rows.length || existing.rows[0].tenant_id !== tenant_id)
      throw new NotFoundException(`Empleado ${employee_id} no encontrado.`);

    const terminationDate = existing.rows[0].termination_date;
    if (!terminationDate) {
      throw new BadRequestException(
        'El empleado no tiene un egreso registrado.',
      );
    }

    const result = await this.db.query(employee.terminate, [
      terminationDate,
      data.termination_type,
      data.termination_reason ?? null,
      employee_id,
      tenant_id,
    ]);

    return {
      message: 'Causal de egreso actualizada',
      employee: result.rows[0],
    };
  }

  async deleteEmployee(employee_id: string) {
    const existingEmp = await this.db.query(employee.getById, [employee_id]);
    if (existingEmp.rows.length === 0)
      throw new NotFoundException(`Empleado ${employee_id} no encontrado.`);

    await this.db.query(employee.delete, [employee_id]);

    return {
      message: `Employee with id: ${employee_id} deleted successfully.`,
    };
  }
}
