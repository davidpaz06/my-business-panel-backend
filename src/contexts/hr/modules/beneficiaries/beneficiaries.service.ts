import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import {
  CreateBeneficiaryDto,
  ValidateBeneficiaryDto,
  DistributeSettlementDto,
} from './dto/beneficiary.dto';

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

    try {
      const result = await this.db.query(employeeBeneficiary.create, [
        dto.employee_id,
        tenantId,
        dto.full_name,
        dto.doc_number,
        dto.relationship,
        dto.claim_date,
      ]);

      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(
          `Ya existe un reclamante con el documento ${dto.doc_number} para este trabajador (Art. 145).`,
        );
      }
      throw error;
    }
  }

  async validate(
    tenantId: string,
    beneficiaryId: string,
    dto: ValidateBeneficiaryDto,
  ) {
    await this.assertOwnership(beneficiaryId, tenantId);
    const result = await this.db.query(employeeBeneficiary.validate, [
      dto.validated_at,
      beneficiaryId,
      tenantId,
    ]);
    return result.rows[0];
  }

  async claimWindow(tenantId: string, employeeId: string) {
    const emp = await this.getEmployeeTermination(employeeId, tenantId);
    const list = await this.db.query(employeeBeneficiary.listByEmployee, [
      employeeId,
      tenantId,
      null,
    ]);

    const deadline = emp.termination_date
      ? addDays(emp.termination_date, CLAIM_WINDOW_DAYS)
      : null;

    return {
      terminationDate: emp.termination_date ?? null,
      deadline,
      open: deadline ? new Date().toISOString().slice(0, 10) <= deadline : true,
      totalClaimants: list.rows.length,
      validatedClaimants: list.rows.filter((r) => r.validated).length,
      pendingClaimants: list.rows.filter((r) => !r.validated).length,
      article: '145',
    };
  }

  /** Reparto en partes iguales entre los reclamantes VALIDADOS (Art. 145). */
  async distribute(
    tenantId: string,
    employeeId: string,
    dto: DistributeSettlementDto,
  ) {
    await this.getEmployeeTermination(employeeId, tenantId);

    const validated = await this.db.query(
      employeeBeneficiary.listValidatedByEmployee,
      [employeeId, tenantId],
    );

    if (!validated.rows.length) {
      throw new BadRequestException(
        'No hay reclamantes validados para repartir (Art. 145).',
      );
    }

    const alreadyDistributed = await this.db.query(
      employeeBeneficiary.listByEmployee,
      [employeeId, tenantId, null],
    );
    const hasShares = alreadyDistributed.rows.some(
      (r) =>
        r.settlement_id === dto.settlement_id && r.share_percentage !== null,
    );
    if (hasShares && dto.recalculate !== true) {
      throw new ConflictException(
        'Esta liquidacion ya fue repartida. Enviar recalculate = true para redistribuir entre los reclamantes validados actuales (Art. 145).',
      );
    }

    const settlementRow = await this.db.query(settlement.getById, [
      dto.settlement_id,
    ]);
    if (
      !settlementRow.rows.length ||
      settlementRow.rows[0].tenant_id !== tenantId
    ) {
      throw new NotFoundException(
        `Liquidacion ${dto.settlement_id} no encontrada.`,
      );
    }

    const total = new Decimal(
      settlementRow.rows[0].total ?? settlementRow.rows[0].subtotal ?? 0,
    );
    const count = validated.rows.length;
    const sharePercentage = new Decimal(100).div(count);
    const shareAmount = total.div(count);

    // El residuo de la division (centimos) se acumula en el ultimo reclamante
    // para que la suma de las cuotas cuadre exactamente con el total liquidado.
    const roundedShare = shareAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const remainder = total.minus(roundedShare.mul(count));

    for (const [index, row] of validated.rows.entries()) {
      const isLast = index === count - 1;
      const amount = isLast ? roundedShare.plus(remainder) : roundedShare;
      await this.db.query(employeeBeneficiary.updateShare, [
        sharePercentage.toFixed(4),
        amount.toFixed(4),
        dto.settlement_id,
        row.beneficiary_id,
        tenantId,
      ]);
    }

    return {
      count,
      sharePercentage: sharePercentage.toFixed(4),
      shareAmount: roundedShare.toFixed(4),
      remainder: remainder.toFixed(4),
      total: total.toFixed(4),
      article: '145',
    };
  }

  async list(tenantId: string, employeeId: string, onlyValidated?: boolean) {
    const result = await this.db.query(employeeBeneficiary.listByEmployee, [
      employeeId,
      tenantId,
      onlyValidated === undefined ? null : onlyValidated,
    ]);
    return result.rows;
  }

  private async assertOwnership(beneficiaryId: string, tenantId: string) {
    const result = await this.db.query(employeeBeneficiary.getById, [
      beneficiaryId,
    ]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(
        `Beneficiario ${beneficiaryId} no encontrado.`,
      );
    }
  }

  private async getEmployeeTermination(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getTerminationInfo, [
      employeeId,
    ]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }
    return result.rows[0];
  }
}
