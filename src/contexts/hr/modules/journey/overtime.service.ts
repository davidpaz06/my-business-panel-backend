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
import { ParametersService } from '../parameters/parameters.service';
import { CreateOvertimeDto } from './dto/overtime.dto';
import { JOURNEY_LIMITS } from './interfaces/journey-limits.interface';

const { overtimeRecord, employee } = hrQueries;

export interface CapValidationResult {
  allowed: boolean;
  violated: string[];
  daily: { used: number; max: number };
  weekly: { used: number; max: number };
  yearly: { used: number; max: number };
}

@Injectable()
export class OvertimeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly parameters: ParametersService,
  ) {}

  async create(tenantId: string, dto: CreateOvertimeDto) {
    const emp = await this.getEmployeeContext(dto.employee_id, tenantId);
    const rateFactor = await this.resolveRateFactor(tenantId, dto);

    if (dto.kind === 'extra') {
      const validation = await this.validateCaps(
        tenantId,
        dto.employee_id,
        dto.work_date,
        dto.hours,
        emp.dailyHours,
      );
      if (!validation.allowed) {
        throw new BadRequestException(
          `Excede topes de horas extraordinarias (Art. 178): ${validation.violated.join(', ')}`,
        );
      }
    }

    const result = await this.db.query(overtimeRecord.create, [
      dto.employee_id,
      dto.branch_id,
      tenantId,
      dto.work_date,
      dto.kind,
      dto.hours,
      rateFactor.toFixed(4),
      dto.inspectoria_authorized ?? false,
      dto.authorization_ref ?? null,
    ]);

    const record = result.rows[0];

    if (dto.kind === 'descanso') {
      // Art. 188: >=4h trabajadas -> dia completo; <4h -> medio dia.
      const salaryDays = dto.hours >= 4 ? 1 : 0.5;
      return { ...record, salaryDays, compensatoryRest: true };
    }

    return record;
  }

  async validate(
    tenantId: string,
    employeeId: string,
    workDate: string,
    hours: number,
  ) {
    const emp = await this.getEmployeeContext(employeeId, tenantId);
    return this.validateCaps(
      tenantId,
      employeeId,
      workDate,
      hours,
      emp.dailyHours,
    );
  }

  async listByEmployee(
    tenantId: string,
    employeeId: string,
    from: string,
    to: string,
    kind?: string,
  ) {
    await this.getEmployeeContext(employeeId, tenantId);

    if (kind) {
      const result = await this.db.query(
        overtimeRecord.listByEmployeeRangeKind,
        [employeeId, kind, from, to],
      );
      return result.rows;
    }

    const result = await this.db.query(overtimeRecord.listByEmployeeRange, [
      employeeId,
      from,
      to,
    ]);
    return result.rows;
  }

  async getAccumulated(
    tenantId: string,
    employeeId: string,
    date: string,
    explain = false,
  ) {
    const emp = await this.getEmployeeContext(employeeId, tenantId);
    const acc = await this.sumAccumulated(employeeId, date);

    const dailyMax = 10; // Art. 178
    const weeklyMax = 10;
    const yearlyMax = 100;

    const base = {
      // Art. 178: el tope de 10h/dia es JORNADA ORDINARIA + EXTRA sumadas,
      // no solo horas extra. Se expone el desglose para que la UI no
      // presente "used" como si fueran puras horas extra.
      daily: {
        used: emp.dailyHours + acc.dailyExtra,
        max: dailyMax,
        ordinaryHours: emp.dailyHours,
        extraHours: acc.dailyExtra,
      },
      weekly: { used: acc.weeklyExtra, max: weeklyMax },
      yearly: { used: acc.yearlyExtra, max: yearlyMax },
    };

    if (!explain) return base;

    return {
      ...base,
      explanation: {
        journeyType: emp.journeyType,
        ordinaryDailyHours: emp.dailyHours,
        article: '178',
      },
    };
  }

  private async validateCaps(
    tenantId: string,
    employeeId: string,
    workDate: string,
    hours: number,
    dailyHours: number,
  ): Promise<CapValidationResult> {
    const acc = await this.sumAccumulated(employeeId, workDate);
    const violated: string[] = [];

    const dailyUsed = dailyHours + acc.dailyExtra + hours;
    const weeklyUsed = acc.weeklyExtra + hours;
    const yearlyUsed = acc.yearlyExtra + hours;

    if (dailyUsed > 10) violated.push('Excede 10h/dia');
    if (weeklyUsed > 10) violated.push('Excede 10h/sem');
    if (yearlyUsed > 100) violated.push('Excede 100h/anio');

    return {
      allowed: violated.length === 0,
      violated,
      daily: { used: dailyUsed, max: 10 },
      weekly: { used: weeklyUsed, max: 10 },
      yearly: { used: yearlyUsed, max: 100 },
    };
  }

  private async sumAccumulated(employeeId: string, date: string) {
    const d = new Date(date);
    const dayStart = date;
    const dayEnd = date;

    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const yearStart = `${d.getFullYear()}-01-01`;
    const yearEnd = `${d.getFullYear()}-12-31`;

    const [daily, weekly, yearly] = await Promise.all([
      this.db.query(overtimeRecord.sumHoursByKindRange, [
        employeeId,
        'extra',
        dayStart,
        dayEnd,
      ]),
      this.db.query(overtimeRecord.sumHoursByKindRange, [
        employeeId,
        'extra',
        weekStart.toISOString().slice(0, 10),
        weekEnd.toISOString().slice(0, 10),
      ]),
      this.db.query(overtimeRecord.sumHoursByKindRange, [
        employeeId,
        'extra',
        yearStart,
        yearEnd,
      ]),
    ]);

    return {
      dailyExtra: Number(daily.rows[0].total),
      weeklyExtra: Number(weekly.rows[0].total),
      yearlyExtra: Number(yearly.rows[0].total),
    };
  }

  private async resolveRateFactor(
    tenantId: string,
    dto: CreateOvertimeDto,
  ): Promise<Decimal> {
    if (dto.kind === 'nocturna') {
      const recargo = await this.parameters.resolve(
        tenantId,
        'recargo_nocturno',
        dto.work_date,
      );
      return new Decimal(1).add(recargo);
    }

    if (dto.kind === 'extra') {
      const recargo = await this.parameters.resolve(
        tenantId,
        'recargo_hora_extra',
        dto.work_date,
      );
      // Art. 182: sin autorizacion de la Inspectoria, el recargo se DUPLICA.
      const factor = dto.inspectoria_authorized ? recargo : recargo.mul(2);
      return new Decimal(1).add(factor);
    }

    if (dto.kind === 'feriado') {
      const recargo = await this.parameters.resolve(
        tenantId,
        'recargo_feriado',
        dto.work_date,
      );
      return new Decimal(1).add(recargo);
    }

    // descanso: no aplica un factor hora-a-hora; se paga por dia (Art. 188).
    return new Decimal(1);
  }

  private async getEmployeeContext(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getForSalary, [employeeId]);

    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }

    const row = result.rows[0];
    const dailyHours =
      JOURNEY_LIMITS[row.journey_type as keyof typeof JOURNEY_LIMITS]
        ?.maxDaily ?? 8;

    return {
      employeeId: row.employee_id as string,
      tenantId: row.tenant_id as string,
      journeyType: row.journey_type as string,
      dailyHours,
    };
  }
}
