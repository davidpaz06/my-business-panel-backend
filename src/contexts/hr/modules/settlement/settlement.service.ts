import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { SeveranceService } from '../severance/severance.service';
import { SeveranceAdvanceService } from '../severance/severance-advance.service';
import { SeveranceInterestService } from '../severance/severance-interest.service';
import { VacationPeriodService } from '../vacations/vacation-period.service';
import { VacationsService } from '../vacations/vacations.service';
import { ProfitSharingService } from '../profit-sharing/profit-sharing.service';
import { MoraService } from '../mora/mora.service';
import { SalaryService } from '../salary/salary.service';
import { indemnityApplies } from './interfaces/indemnity';
import { CreateSettlementDto, PaySettlementDto } from './dto/settlement.dto';

const { employee, settlement, settlementItem } = hrQueries;

export interface SettlementItemDraft {
  code: string;
  conceptName: string;
  article: string;
  salaryBasis: 'normal' | 'integral';
  baseAmount: string;
  days: number | null;
  amount: string;
  formulaText: string;
}

/** Dias de gracia para el pago de prestaciones (Art. 142.f). */
const GRACE_DAYS = 5;

@Injectable()
export class SettlementService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly severance: SeveranceService,
    private readonly severanceAdvances: SeveranceAdvanceService,
    private readonly severanceInterest: SeveranceInterestService,
    private readonly vacationPeriods: VacationPeriodService,
    private readonly vacations: VacationsService,
    private readonly profitSharing: ProfitSharingService,
    private readonly mora: MoraService,
    private readonly salaryService: SalaryService,
  ) {}

  indemnityAppliesCheck(terminationType: string) {
    return {
      terminationType,
      appliesIndemnity: indemnityApplies(terminationType),
      article: '92',
    };
  }

  /**
   * Orquestacion completa (doc S12.1): parametros -> salario ->
   * antiguedad -> prestaciones (MAX) -> intereses -> fracciones ->
   * indemnizacion -> anticipos/descuentos -> mora -> desglose.
   */
  async preview(
    tenantId: string,
    employeeId: string,
    endDate: string,
    opts: {
      breakdown?: boolean;
      onlyDeductions?: boolean;
      hireDateOverride?: string;
    } = {},
  ) {
    const emp = await this.getEmployee(employeeId, tenantId);
    const hireDate = opts.hireDateOverride ?? emp.hireDate;

    const severanceResult = await this.severance.calculate(
      tenantId,
      employeeId,
      endDate,
    );
    const items: SettlementItemDraft[] = [];
    let sortOrder = 0;

    // Art. 142.e (antiguedad < 3 meses) usa salario NORMAL, no integral:
    // sustituye por completo el esquema de garantia/retroactivo.
    const isShortTenure = severanceResult.selectedVia === 'antiguedad_corta';
    items.push({
      code: 'HR-VE-05',
      conceptName: 'Prestaciones sociales',
      article: severanceResult.article,
      salaryBasis: isShortTenure ? 'normal' : 'integral',
      baseAmount:
        (isShortTenure
          ? severanceResult.normalDailySalary
          : severanceResult.lastIntegralDailySalary) ?? '0.0000',
      days: null,
      amount: severanceResult.severanceAmount,
      formulaText: `Via seleccionada: ${severanceResult.selectedVia}`,
    });
    sortOrder++;

    // Intereses de garantia capitalizados (Art. 143), si existen.
    const capitalizedInterest =
      await this.severanceInterest.sumCapitalized(employeeId);
    if (capitalizedInterest.gt(0)) {
      items.push(
        this.draft(
          'HR-VE-06',
          'Intereses sobre la garantia',
          '143',
          'integral',
          capitalizedInterest,
          sortOrder++,
        ),
      );
    }

    // Vacaciones y bono. Son CUATRO conceptos distintos y pueden
    // coexistir: los anios ya cumplidos se pagan como causados
    // (Arts. 195 y 192) y los meses del anio en curso como fraccion
    // (Art. 196). Antes solo se emitia uno de los dos bloques y el
    // bono causado no se liquidaba nunca.
    const { completeYears, remainderMonths } = this.monthsAndYears(
      hireDate,
      endDate,
    );

    if (completeYears >= 1) {
      const pending = await this.vacationPeriods.pendingValue(
        tenantId,
        employeeId,
        endDate,
      );
      if (Number(pending.totalPendingDays) > 0) {
        items.push(
          this.draft(
            'HR-VE-13',
            'Vacaciones causadas no disfrutadas',
            '195',
            'normal',
            new Decimal(pending.amount),
            sortOrder++,
          ),
        );
      }

      const pendingBonus = await this.vacationPeriods.pendingBonusValue(
        tenantId,
        employeeId,
        endDate,
      );
      if (Number(pendingBonus.totalPendingBonusDays) > 0) {
        items.push(
          this.draft(
            'HR-VE-12',
            'Bono vacacional causado no pagado',
            '192',
            'normal',
            new Decimal(pendingBonus.amount),
            sortOrder++,
          ),
        );
      }
    }

    // Fraccion del anio en curso (Art. 196), tenga o no anios cumplidos.
    if (remainderMonths > 0) {
      const fraction = this.vacations.fraction(hireDate, endDate);
      const normalDaily = await this.salaryService.getNormalDaily(
        employeeId,
        tenantId,
        endDate,
      );

      if (fraction.vacationFraction > 0) {
        items.push(
          this.draft(
            'HR-VE-13',
            'Vacaciones fraccionadas',
            '196',
            'normal',
            normalDaily.mul(fraction.vacationFraction),
            sortOrder++,
          ),
        );
      }
      if (fraction.bonusFraction > 0) {
        items.push(
          this.draft(
            'HR-VE-13',
            'Bono vacacional fraccionado',
            '196',
            'normal',
            normalDaily.mul(fraction.bonusFraction),
            sortOrder++,
          ),
        );
      }
    }

    // Utilidades fraccionadas (Art. 131, estimado).
    const profitFraction = await this.profitSharing.fraction(
      tenantId,
      employeeId,
      endDate,
    );
    if (Number(profitFraction.amount) > 0) {
      items.push(
        this.draft(
          'HR-VE-09',
          'Utilidades fraccionadas',
          '131',
          'normal',
          new Decimal(profitFraction.amount),
          sortOrder++,
        ),
      );
    }

    // Indemnizacion (Art. 92) = mismo monto que las prestaciones seleccionadas.
    if (indemnityApplies(emp.terminationType)) {
      items.push(
        this.draft(
          'HR-VE-14',
          'Indemnizacion Art. 92',
          '92',
          'integral',
          new Decimal(severanceResult.severanceAmount),
          sortOrder++,
        ),
      );
    }

    // Anticipos de prestaciones aprobados (Art. 144) — se RESTAN.
    const advancesApproved =
      await this.severanceAdvances.sumApproved(employeeId);
    if (advancesApproved.gt(0)) {
      items.push(
        this.draft(
          'HR-VE-08',
          'Anticipos de prestaciones',
          '144',
          'integral',
          advancesApproved.neg(),
          sortOrder++,
        ),
      );
    }

    // Descuentos por deudas con el patrono, tope 50% del credito acumulado hasta este punto (Art. 154).
    const creditSoFar = items.reduce(
      (acc, i) => acc.add(new Decimal(i.amount)),
      new Decimal(0),
    );
    const outstandingDebt = await this.outstandingDebt(employeeId);
    if (outstandingDebt.gt(0)) {
      const maxCompensation = creditSoFar.mul(0.5);
      const compensated = Decimal.min(outstandingDebt, maxCompensation);
      if (compensated.gt(0)) {
        items.push(
          this.draft(
            'HR-VE-17',
            'Descuentos (deuda con el patrono)',
            '154',
            'normal',
            compensated.neg(),
            sortOrder++,
          ),
        );
      }
    }

    const subtotal = items.reduce(
      (acc, i) => acc.add(new Decimal(i.amount)),
      new Decimal(0),
    );

    // Mora proyectada si el pago (hoy, hipoteticamente) excede los 5 dias (Art. 142.f).
    const today = new Date().toISOString().slice(0, 10);
    const paymentDueDate = this.addDays(endDate, GRACE_DAYS);
    let moraDays = 0;
    let moraAmount = new Decimal(0);
    if (today > paymentDueDate) {
      const moraResult = await this.mora.calculate(tenantId, {
        debt_amount: subtotal.toNumber(),
        due_from: endDate,
        grace_days: GRACE_DAYS,
        payment_date: today,
        debt_kind: 'prestaciones',
      });
      moraDays = moraResult.moraDays;
      moraAmount = new Decimal(moraResult.moraAmount);
    }

    const result = {
      employeeId,
      endDate,
      hireDate,
      completeYears,
      remainderMonths,
      lastIntegralDailySalary: severanceResult.lastIntegralDailySalary,
      via1Amount: severanceResult.via1Amount,
      via2Amount: severanceResult.via2Amount,
      selectedVia: severanceResult.selectedVia,
      severanceAmount: severanceResult.severanceAmount,
      indemnityAmount: indemnityApplies(emp.terminationType)
        ? severanceResult.severanceAmount
        : '0.0000',
      subtotal: subtotal.toFixed(4),
      moraDays,
      moraAmount: moraAmount.toFixed(4),
      total: subtotal.add(moraAmount).toFixed(4),
      paymentDueDate,
    };

    const filteredItems = opts.onlyDeductions
      ? items.filter((i) => Number(i.amount) < 0)
      : items;

    return opts.breakdown || opts.onlyDeductions
      ? { ...result, items: filteredItems }
      : result;
  }

  async create(tenantId: string, dto: CreateSettlementDto) {
    const existing = await this.db.query(settlement.getByEmployeeAndDate, [
      dto.employee_id,
      dto.termination_date,
    ]);
    if (existing.rows.length) {
      throw new ConflictException(
        'Ya existe una liquidacion para este empleado y fecha de egreso.',
      );
    }

    const preview = await this.preview(
      tenantId,
      dto.employee_id,
      dto.termination_date,
      {
        breakdown: true,
      },
    );
    const items = (preview as { items: SettlementItemDraft[] }).items;
    const emp = await this.getEmployee(dto.employee_id, tenantId);
    const { completeYears, remainderMonths } = this.monthsAndYears(
      emp.hireDate,
      dto.termination_date,
    );

    const advancesDeducted = items
      .filter((i) => i.code === 'HR-VE-08')
      .reduce((acc, i) => acc.add(new Decimal(i.amount).abs()), new Decimal(0));
    const deductionsAmount = items
      .filter((i) => i.code === 'HR-VE-17')
      .reduce((acc, i) => acc.add(new Decimal(i.amount).abs()), new Decimal(0));

    const result = await this.db.query(settlement.create, [
      dto.employee_id,
      tenantId,
      null,
      dto.termination_date,
      this.addDays(dto.termination_date, GRACE_DAYS),
      emp.hireDate,
      completeYears,
      remainderMonths,
      preview.lastIntegralDailySalary ?? '0.0000',
      (
        await this.salaryService.getNormal(
          dto.employee_id,
          tenantId,
          dto.termination_date,
        )
      ).dailySalary,
      preview.via1Amount ?? null,
      preview.via2Amount ?? null,
      preview.selectedVia,
      preview.severanceAmount,
      advancesDeducted.toFixed(4),
      deductionsAmount.toFixed(4),
      preview.subtotal,
    ]);

    const settlementId = result.rows[0].settlement_id;

    for (const item of items) {
      await this.db.query(settlementItem.create, [
        settlementId,
        item.code,
        item.conceptName,
        item.article,
        item.salaryBasis,
        item.baseAmount,
        item.days,
        item.amount,
        item.formulaText,
        // sortOrder was attached dynamically; fall back to array index
        items.indexOf(item),
      ]);
    }

    return this.getById(tenantId, settlementId, true);
  }

  async pay(tenantId: string, settlementId: string, dto: PaySettlementDto) {
    const row = await this.assertOwnership(settlementId, tenantId);

    const moraResult = await this.mora.calculate(tenantId, {
      debt_amount: Number(row.subtotal),
      due_from: row.termination_date,
      grace_days: GRACE_DAYS,
      payment_date: dto.payment_date,
      debt_kind: 'prestaciones',
      explain: true,
    });

    // Tasa efectiva al momento del pago: el ultimo tramo aplicado.
    const segments = (moraResult as { segments?: { rate: string }[] }).segments;
    const effectiveRate = segments?.length
      ? segments[segments.length - 1].rate
      : null;

    const result = await this.db.query(settlement.pay, [
      dto.payment_date,
      moraResult.moraDays,
      effectiveRate,
      moraResult.moraAmount,
      settlementId,
    ]);

    if (Number(moraResult.moraAmount) > 0) {
      const itemsCount = (
        await this.db.query(settlementItem.listBySettlement, [settlementId])
      ).rows.length;
      await this.db.query(settlementItem.create, [
        settlementId,
        'HR-VE-07',
        'Mora en el pago (Art. 142.f)',
        '142.f',
        'integral',
        row.subtotal,
        moraResult.moraDays,
        moraResult.moraAmount,
        `${moraResult.moraDays} dias de mora`,
        itemsCount,
      ]);
    }

    return result.rows[0];
  }

  async void(tenantId: string, settlementId: string) {
    await this.assertOwnership(settlementId, tenantId);
    const result = await this.db.query(settlement.void, [settlementId]);
    return result.rows[0];
  }

  async getById(tenantId: string, settlementId: string, breakdown = false) {
    const row = await this.assertOwnership(settlementId, tenantId);
    if (!breakdown) return row;

    const items = await this.db.query(settlementItem.listBySettlement, [
      settlementId,
    ]);
    return { ...row, items: items.rows };
  }

  async overdue(tenantId: string) {
    const result = await this.db.query(settlement.listOverdue, [tenantId]);
    return result.rows;
  }

  private draft(
    code: string,
    conceptName: string,
    article: string,
    salaryBasis: 'normal' | 'integral',
    amount: Decimal,
    _sortOrder: number,
  ): SettlementItemDraft {
    return {
      code,
      conceptName,
      article,
      salaryBasis,
      baseAmount: amount.abs().toFixed(4),
      days: null,
      amount: amount.toFixed(4),
      formulaText: conceptName,
    };
  }

  private async outstandingDebt(employeeId: string): Promise<Decimal> {
    const result = await this.db.query(
      hrQueries.employeeDeduction.listOutstandingByEmployee,
      [employeeId],
    );
    return result.rows
      .filter((r) => r.kind === 'deuda_patrono')
      .reduce(
        (acc, r) => acc.add(new Decimal(r.outstanding_balance)),
        new Decimal(0),
      );
  }

  private monthsAndYears(hireDate: string, endDate: string) {
    const hire = new Date(`${hireDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    let years = end.getUTCFullYear() - hire.getUTCFullYear();
    let months = end.getUTCMonth() - hire.getUTCMonth();
    const dayDiff = end.getUTCDate() - hire.getUTCDate();
    if (dayDiff < 0) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return {
      completeYears: Math.max(years, 0),
      remainderMonths: Math.max(months, 0),
      totalMonths: Math.max(years * 12 + months, 0),
    };
  }

  private addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private async assertOwnership(settlementId: string, tenantId: string) {
    const result = await this.db.query(settlement.getById, [settlementId]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Liquidacion ${settlementId} no encontrada.`);
    }
    return result.rows[0];
  }

  private async getEmployee(employeeId: string, tenantId: string) {
    const result = await this.db.query(employee.getTerminationInfo, [
      employeeId,
    ]);
    if (!result.rows.length || result.rows[0].tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${employeeId} no encontrado.`);
    }
    return {
      hireDate: result.rows[0].hire_date as string,
      terminationType: result.rows[0].termination_type as string | null,
    };
  }
}
