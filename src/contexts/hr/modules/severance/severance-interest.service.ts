import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import Decimal from 'decimal.js';
import { hrQueries } from '@hr/hr.queries';
import { ParametersService } from '../parameters/parameters.service';
import { SeveranceDepositService } from './severance-deposit.service';
import { GenerateInterestDto, SettleInterestDto } from './dto/severance.dto';

const { severanceInterest } = hrQueries;

export interface InterestRateInfo {
  rateKind: 'fideicomiso' | 'promedio_activa_pasiva' | 'activa_bcv';
  rate: Decimal;
  penalty?: boolean;
  article: string;
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class SeveranceInterestService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly parameters: ParametersService,
    private readonly deposits: SeveranceDepositService,
  ) {}

  /**
   * Tasa aplicable a la garantia (Art. 143). El incumplimiento del
   * deposito (!depositMade) manda SOBRE la ubicacion: dispara la
   * tasa activa BCV como penalizacion, sea cual sea el location.
   */
  async getRate(
    tenantId: string,
    location: string,
    depositMade: boolean,
    date: string,
  ): Promise<InterestRateInfo> {
    if (!depositMade) {
      const rate = await this.parameters.resolve(
        tenantId,
        'tasa_activa_bcv',
        date,
      );
      return { rateKind: 'activa_bcv', rate, penalty: true, article: '143' };
    }

    if (location === 'contabilidad') {
      const rate = await this.parameters.resolve(
        tenantId,
        'tasa_promedio_activa_pasiva_bcv',
        date,
      );
      return { rateKind: 'promedio_activa_pasiva', rate, article: '143' };
    }

    // fideicomiso / fondo_nacional: el rendimiento real del fondo no
    // esta modelado como parametro (no hay dato externo disponible);
    // se usa la tasa promedio activa-pasiva como referencia.
    const rate = await this.parameters.resolve(
      tenantId,
      'tasa_promedio_activa_pasiva_bcv',
      date,
    );
    return { rateKind: 'fideicomiso', rate, article: '143' };
  }

  async generate(tenantId: string, dto: GenerateInterestDto) {
    const depositRows = await this.deposits.listByEmployee(
      tenantId,
      dto.employee_id,
    );
    const created: unknown[] = [];

    for (const deposit of depositRows) {
      const start =
        deposit.quarter_start > dto.from ? deposit.quarter_start : dto.from;
      let month = firstOfMonth(start);

      while (month <= dto.to) {
        const rateInfo = await this.getRate(
          tenantId,
          deposit.location,
          deposit.deposit_made,
          month,
        );
        const balanceBase = new Decimal(deposit.amount);
        const amount = balanceBase.mul(rateInfo.rate).div(12);

        const result = await this.db.query(severanceInterest.create, [
          deposit.deposit_id,
          dto.employee_id,
          tenantId,
          month,
          balanceBase.toFixed(4),
          rateInfo.rate.toFixed(6),
          rateInfo.rateKind,
          amount.toFixed(4),
        ]);

        if (result.rows.length) created.push(result.rows[0]);
        month = addMonths(month, 1);
      }
    }

    return { generated: created.length, interest: created };
  }

  async listByEmployee(employeeId: string, from: string, to: string) {
    const result = await this.db.query(severanceInterest.listByEmployeeRange, [
      employeeId,
      from,
      to,
    ]);
    return result.rows;
  }

  async settle(dto: SettleInterestDto) {
    const result = await this.db.query(severanceInterest.settleYear, [
      dto.capitalize,
      dto.employee_id,
      dto.year,
    ]);
    return { updated: result.rows.length, rows: result.rows };
  }

  async sumCapitalized(employeeId: string): Promise<Decimal> {
    const result = await this.db.query(severanceInterest.sumCapitalized, [
      employeeId,
    ]);
    return new Decimal(result.rows[0].total);
  }
}
