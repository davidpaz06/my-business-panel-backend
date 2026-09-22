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
import { CreatePayrollParameterDto } from './dto/payroll-parameter.dto';
import { MEJORABLE_LEGAL_FLOORS } from './interfaces/legal-floor.interface';

const { payrollParameters } = hrQueries;

/**
 * Parametros sin piso legal fijo (dependen de decreto/BCV, ver
 * legal-floor.interface.ts) pero obligatorios para operar: sin ellos
 * severance/mora truenan en runtime (Arts. 130, 142.f, 143).
 */
const REQUIRED_PARAMETER_KEYS = ['tasa_activa_bcv', 'salario_minimo_nacional'];

@Injectable()
export class ParametersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByTenant(tenantId: string) {
    const result = await this.db.query(payrollParameters.listByTenant, [
      tenantId,
    ]);
    return result.rows;
  }

  /**
   * Resuelve un parametro vigente a una fecha dada. Nunca "el ultimo
   * registro": un recalculo historico debe devolver el valor que
   * regia entonces, no el vigente hoy.
   */
  async resolve(
    tenantId: string,
    paramKey: string,
    date: string,
  ): Promise<Decimal> {
    const result = await this.db.query(payrollParameters.resolve, [
      tenantId,
      paramKey,
      date,
    ]);

    if (!result.rows.length) {
      throw new NotFoundException(
        `No hay parametro '${paramKey}' vigente para el tenant en la fecha ${date}.`,
      );
    }

    return new Decimal(result.rows[0].param_value);
  }

  async create(tenantId: string, dto: CreatePayrollParameterDto) {
    const floor = MEJORABLE_LEGAL_FLOORS[dto.param_key];

    if (floor !== undefined && dto.param_value < floor) {
      throw new BadRequestException(
        `El parametro '${dto.param_key}' no puede ser menor al piso legal (${floor}). ` +
          `La LOTTT es de orden publico e irrenunciable (Arts. 2, 19, 18.2, 434): ` +
          `una convencion colectiva solo puede mejorar el minimo legal, nunca reducirlo.`,
      );
    }

    const result = await this.db.query(payrollParameters.create, [
      tenantId,
      dto.param_key,
      dto.param_value,
      dto.valid_from,
      dto.source ?? null,
    ]);

    return result.rows[0];
  }

  /** Parametros obligatorios sin fila vigente para el tenant a la fecha dada. */
  async listMissingRequired(tenantId: string, date: string) {
    const missing: string[] = [];

    for (const key of REQUIRED_PARAMETER_KEYS) {
      try {
        await this.resolve(tenantId, key, date);
      } catch (error) {
        if (error instanceof NotFoundException) {
          missing.push(key);
        } else {
          throw error;
        }
      }
    }

    return { date, missing };
  }

  /**
   * Linea de tiempo completa de un parametro (todas las vigencias).
   * Usada por servicios que deben partir un calculo en tramos cuando
   * la tasa cambia dentro del periodo (ej. mora, Art. 143/142.f).
   */
  async getTimeline(
    tenantId: string,
    paramKey: string,
  ): Promise<{ value: Decimal; validFrom: string }[]> {
    const result = await this.db.query(payrollParameters.listByKey, [
      tenantId,
      paramKey,
    ]);

    return result.rows.map((r) => ({
      value: new Decimal(r.param_value),
      // valid_from es DATE: llega como 'YYYY-MM-DD' (ver db.provider).
      validFrom: String(r.valid_from).slice(0, 10),
    }));
  }
}
