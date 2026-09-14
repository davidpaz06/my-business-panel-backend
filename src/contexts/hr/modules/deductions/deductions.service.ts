import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SalaryHistoryService } from '../salary/salary-history.service';
import { CreateDeductionDto, UpdateDeductionDto, ApplyDeductionPaymentDto } from './dto/deduction.dto';

const { employeeDeduction, settlement } = hrQueries;

/** Tope de descuento durante la relacion: 1/3 del periodo (Art. 154). */
const PERIOD_DEDUCTION_FRACTION = 1 / 3;
/** Tope de compensacion al terminar la relacion (Art. 154). */
const SETTLEMENT_COMPENSATION_FRACTION = 0.5;

@Injectable()
export class DeductionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly salaryHistory: SalaryHistoryService,
  ) {}

  async create(tenantId: string, dto: CreateDeductionDto) {
    // Arts. 412/413: la cuota sindical exige autorizacion expresa.
    if (dto.kind === 'sindical' && !(dto.authorized && dto.authorization_date)) {
      throw new BadRequestException(
        'La cuota sindical requiere autorizacion expresa del trabajador (Arts. 412, 413).',
      );
    }

    // Art. 154: tope de 1/3 del periodo, salvo pension alimentaria (Art. 152).
    if (dto.kind !== 'alimentaria' && dto.installment_amount) {
      const margin = await this.availableMargin(tenantId, dto.employee_id, dto.start_date);
      const newTotal = margin.currentlyApplied + dto.installment_amount;

      if (newTotal > margin.maxDeduction) {
        throw new BadRequestException(
          `Descuento excede 1/3 del periodo (Art. 154). Tope: ${margin.maxDeduction.toFixed(2)}, ` +
            `ya aplicado: ${margin.currentlyApplied.toFixed(2)}.`,
        );
      }
    }

    const result = await this.db.query(employeeDeduction.create, [
      dto.employee_id,
      tenantId,
      dto.kind,
      dto.description,
      dto.total_amount,
      dto.installment_amount ?? null,
      dto.authorized ?? false,
      dto.authorization_date ?? null,
      dto.authorization_ref ?? null,
      dto.union_organization ?? null,
      dto.start_date,
    ]);

    return result.rows[0];
  }

  /** Margen disponible de descuento (Art. 154): tope 1/3 del salario del periodo. */
  async availableMargin(tenantId: string, employeeId: string, date: string) {
    const monthlySalary = await this.salaryHistory.resolve(employeeId, date);
    const maxDeduction = monthlySalary.mul(PERIOD_DEDUCTION_FRACTION);

    const active = await this.db.query(employeeDeduction.listActiveByEmployee, [
      employeeId,
    ]);
    const currentlyApplied = active.rows.reduce(
      (acc, row) => acc.add(new Decimal(row.installment_amount ?? 0)),
      new Decimal(0),
    );

    return {
      periodSalary: monthlySalary.toNumber(),
      maxDeduction: maxDeduction.toNumber(),
      currentlyApplied: currentlyApplied.toNumber(),
      available: Decimal.max(0, maxDeduction.sub(currentlyApplied)).toNumber(),
      article: '154',
    };
  }

  async listByEmployee(employeeId: string, active?: boolean) {
    const result = await this.db.query(employeeDeduction.listByEmployee, [
      employeeId,
    ]);
    if (active === undefined) return result.rows;
    return result.rows.filter((r) => r.is_active === active);
  }

  async update(tenantId: string, deductionId: string, dto: UpdateDeductionDto) {
    await this.assertOwnership(deductionId, tenantId);
    const result = await this.db.query(employeeDeduction.update, [
      dto.authorized ?? null,
      dto.is_active ?? null,
      dto.end_date ?? null,
      dto.outstanding_balance ?? null,
      deductionId,
    ]);
    return result.rows[0];
  }

  async applyPayment(tenantId: string, deductionId: string, dto: ApplyDeductionPaymentDto) {
    const deduction = await this.assertOwnership(deductionId, tenantId);

    if (dto.amount > Number(deduction.outstanding_balance)) {
      throw new BadRequestException(
        `El pago (${dto.amount}) excede el saldo pendiente (${deduction.outstanding_balance}).`,
      );
    }

    const result = await this.db.query(employeeDeduction.applyPayment, [
      dto.amount,
      deductionId,
    ]);
    return result.rows[0];
  }

  /**
   * Compensacion en la liquidacion (Art. 154): hasta el 50% del
   * credito a favor del trabajador. Solo aplica a deudas del
   * trabajador con el patrono (kind = 'deuda_patrono').
   */
  async settlementCompensation(tenantId: string, employeeId: string, settlementId: string) {
    const settlementRow = await this.db.query(settlement.getById, [settlementId]);
    if (!settlementRow.rows.length || settlementRow.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Liquidacion ${settlementId} no encontrada.`);
    }

    const creditInFavor = new Decimal(
      settlementRow.rows[0].total ?? settlementRow.rows[0].subtotal ?? 0,
    );

    const outstandingRows = await this.db.query(
      employeeDeduction.listOutstandingByEmployee,
      [employeeId],
    );
    const outstanding = outstandingRows.rows
      .filter((r) => r.kind === 'deuda_patrono')
      .reduce((acc, r) => acc.add(new Decimal(r.outstanding_balance)), new Decimal(0));

    const maxCompensation = creditInFavor.mul(SETTLEMENT_COMPENSATION_FRACTION);
    const compensated = Decimal.min(outstanding, maxCompensation);
    const remainingDebt = outstanding.sub(compensated);

    return {
      creditInFavor: creditInFavor.toFixed(4),
      outstanding: outstanding.toFixed(4),
      maxCompensation: maxCompensation.toFixed(4),
      compensated: compensated.toFixed(4),
      remainingDebt: remainingDebt.toFixed(4),
      article: '154',
    };
  }

  private async assertOwnership(deductionId: string, tenantId: string) {
    const result = await this.db.query(employeeDeduction.getById, [deductionId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Deduccion ${deductionId} no encontrada.`);
    }
    return result.rows[0];
  }
}
