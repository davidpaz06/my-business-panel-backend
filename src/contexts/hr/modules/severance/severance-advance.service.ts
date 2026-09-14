import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { ParametersService } from '../parameters/parameters.service';
import { SeveranceDepositService } from './severance-deposit.service';
import { SeveranceInterestService } from './severance-interest.service';
import { CreateAdvanceDto, ApproveAdvanceDto, RejectAdvanceDto } from './dto/severance.dto';

const { severanceAdvance } = hrQueries;

@Injectable()
export class SeveranceAdvanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly parameters: ParametersService,
    private readonly deposits: SeveranceDepositService,
    private readonly interest: SeveranceInterestService,
  ) {}

  /** Saldo de la garantia disponible y el maximo anticipable (Art. 144). */
  async available(tenantId: string, employeeId: string, date: string) {
    const balance = await this.balance(employeeId);
    const tope = await this.parameters.resolve(
      tenantId,
      'tope_anticipo_prestaciones',
      date,
    );

    return {
      guaranteeBalance: balance.toFixed(4),
      maxAdvance: balance.mul(tope).toFixed(4),
      article: '144',
    };
  }

  async create(tenantId: string, dto: CreateAdvanceDto) {
    const today = new Date().toISOString().slice(0, 10);
    const availability = await this.available(tenantId, dto.employee_id, today);
    const maxAdvance = new Decimal(availability.maxAdvance);

    if (new Decimal(dto.requested_amount).gt(maxAdvance)) {
      throw new BadRequestException(
        `Anticipo maximo 75% de la garantia (Art. 144). Maximo disponible: ${maxAdvance.toFixed(2)}.`,
      );
    }

    const result = await this.db.query(severanceAdvance.create, [
      dto.employee_id,
      tenantId,
      dto.requested_amount,
      dto.reason,
      dto.reason_detail ?? null,
      availability.guaranteeBalance,
    ]);

    return result.rows[0];
  }

  async approve(tenantId: string, advanceId: string, dto: ApproveAdvanceDto) {
    await this.assertOwnership(advanceId, tenantId);
    const result = await this.db.query(severanceAdvance.approve, [
      dto.approved_amount,
      dto.resolution_date,
      advanceId,
    ]);
    return result.rows[0];
  }

  async reject(tenantId: string, advanceId: string, dto: RejectAdvanceDto) {
    await this.assertOwnership(advanceId, tenantId);
    const result = await this.db.query(severanceAdvance.reject, [
      dto.resolution_date,
      advanceId,
    ]);
    return result.rows[0];
  }

  async listByEmployee(employeeId: string) {
    const result = await this.db.query(severanceAdvance.listByEmployee, [
      employeeId,
    ]);
    return result.rows;
  }

  async sumApproved(employeeId: string): Promise<Decimal> {
    const result = await this.db.query(severanceAdvance.sumApproved, [
      employeeId,
    ]);
    return new Decimal(result.rows[0].total);
  }

  async balance(employeeId: string): Promise<Decimal> {
    const [deposited, capitalized, advanced] = await Promise.all([
      this.deposits.sumMadeAmount(employeeId),
      this.interest.sumCapitalized(employeeId),
      this.sumApproved(employeeId),
    ]);
    return deposited.add(capitalized).sub(advanced);
  }

  private async assertOwnership(advanceId: string, tenantId: string) {
    const result = await this.db.query(severanceAdvance.getById, [advanceId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Anticipo ${advanceId} no encontrado.`);
    }
  }
}
