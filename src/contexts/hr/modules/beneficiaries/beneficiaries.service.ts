import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { CreateBeneficiaryDto, ValidateBeneficiaryDto, DistributeSettlementDto } from './dto/beneficiary.dto';

const { employeeBeneficiary, employee, settlement } = hrQueries;

/** Ventana de reclamo por fallecimiento (Art. 145): 3 meses. */
const CLAIM_WINDOW_DAYS = 90;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class BeneficiariesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(tenantId: string, dto: CreateBeneficiaryDto) {
    const emp = await this.getEmployeeTermination(dto.employee_id, tenantId);

    if (emp.termination_date) {
      const deadline = addDays(emp.termination_date, CLAIM_WINDOW_DAYS);
      if (dto.claim_date > deadline) {
        throw new BadRequestException(
          `Reclamo fuera de la ventana de 3 meses (Art. 145). Plazo vencido el ${deadline}.`,
        );
      }
    }

    const result = await this.db.query(employeeBeneficiary.create, [
      dto.employee_id,
      tenantId,
      dto.full_name,
      dto.doc_number,
      dto.relationship,
      dto.claim_date,
    ]);

    return result.rows[0];
  }

  async validate(tenantId: string, beneficiaryId: string, dto: ValidateBeneficiaryDto) {
    await this.assertOwnership(beneficiaryId, tenantId);
    const result = await this.db.query(employeeBeneficiary.validate, [
      dto.validated_at,
      beneficiaryId,
    ]);
    return result.rows[0];
  }

  async claimWindow(tenantId: string, employeeId: string) {
    const emp = await this.getEmployeeTermination(employeeId, tenantId);
    const list = await this.db.query(employeeBeneficiary.listByEmployee, [employeeId]);

    const deadline = emp.termination_date
      ? addDays(emp.termination_date, CLAIM_WINDOW_DAYS)
      : null;

    return {
      deadline,
      open: deadline ? new Date().toISOString().slice(0, 10) <= deadline : true,
      validatedClaimants: list.rows.filter((r) => r.validated).length,
      pendingClaimants: list.rows.filter((r) => !r.validated).length,
      article: '145',
    };
  }

  /** Reparto en partes iguales entre los reclamantes VALIDADOS (Art. 145). */
  async distribute(tenantId: string, employeeId: string, dto: DistributeSettlementDto) {
    const validated = await this.db.query(employeeBeneficiary.listValidatedByEmployee, [
      employeeId,
    ]);

    if (!validated.rows.length) {
      throw new BadRequestException('No hay reclamantes validados para repartir (Art. 145).');
    }

    const settlementRow = await this.db.query(settlement.getById, [dto.settlement_id]);
    if (!settlementRow.rows.length || settlementRow.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Liquidacion ${dto.settlement_id} no encontrada.`);
    }

    const total = new Decimal(
      settlementRow.rows[0].total ?? settlementRow.rows[0].subtotal ?? 0,
    );
    const count = validated.rows.length;
    const sharePercentage = new Decimal(100).div(count);
    const shareAmount = total.div(count);

    for (const row of validated.rows) {
      await this.db.query(employeeBeneficiary.updateShare, [
        sharePercentage.toFixed(4),
        shareAmount.toFixed(4),
        dto.settlement_id,
        row.beneficiary_id,
      ]);
    }

    return {
      count,
      sharePercentage: sharePercentage.toFixed(4),
      shareAmount: shareAmount.toFixed(4),
      total: total.toFixed(4),
      article: '145',
    };
  }

  async list(employeeId: string, onlyValidated?: boolean) {
    const result = await this.db.query(employeeBeneficiary.listByEmployee, [employeeId]);
    if (onlyValidated === undefined) return result.rows;
    return result.rows.filter((r) => r.validated === onlyValidated);
  }

  private async assertOwnership(beneficiaryId: string, tenantId: string) {
    const result = await this.db.query(employeeBeneficiary.getById, [beneficiaryId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Beneficiario ${beneficiaryId} no encontrado.`);
    }
  }

  private async getEmployeeTermination(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getTerminationInfo, [employeeId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }
    return result.rows[0];
  }
}
