import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ParametersService } from '../parameters/parameters.service';
import { CalculateMoraDto, SalaryMinimumDifferenceDto } from './dto/mora.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * Servicio transversal de mora (Arts. 128, 130, 141, 142.f, 143).
 * Consumido por prestaciones, liquidacion y salario. La tasa se
 * resuelve VIGENTE POR TRAMO temporal, nunca fija: si la mora cruza
 * un cambio de tasa se parte en segmentos.
 */
@Injectable()
export class MoraService {
  constructor(private readonly parameters: ParametersService) {}

  async calculate(tenantId: string, dto: CalculateMoraDto) {
    const limite = addDays(dto.due_from, dto.grace_days);
    const article = dto.debt_kind === 'prestaciones' ? '142.f' : '128';

    if (dto.payment_date <= limite) {
      return {
        moraDays: 0,
        moraAmount: '0.0000',
        limite,
        article,
        debtKind: dto.debt_kind,
      };
    }

    const timeline = await this.parameters.getTimeline(tenantId, 'tasa_activa_bcv');

    if (!timeline.length) {
      throw new BadRequestException(
        `No hay tasa_activa_bcv vigente para calcular mora en el rango solicitado.`,
      );
    }

    // Puntos de quiebre: cualquier cambio de tasa dentro del tramo de mora.
    const breakpoints = timeline
      .filter((t) => t.validFrom > limite && t.validFrom < dto.payment_date)
      .map((t) => t.validFrom);

    const points = Array.from(
      new Set([limite, ...breakpoints, dto.payment_date]),
    ).sort();

    let totalAmount = new Decimal(0);
    const segments: { from: string; to: string; rate: string; days: number; amount: string }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const segStart = points[i];
      const segEnd = points[i + 1];

      const applicable = [...timeline]
        .filter((t) => t.validFrom <= segStart)
        .pop();

      if (!applicable) {
        throw new BadRequestException(
          `No hay tasa_activa_bcv vigente para la fecha ${segStart}.`,
        );
      }

      const days = diffDays(segStart, segEnd);
      const dailyRate = applicable.value.div(360);
      const amount = new Decimal(dto.debt_amount).mul(dailyRate).mul(days);

      totalAmount = totalAmount.add(amount);
      segments.push({
        from: segStart,
        to: segEnd,
        rate: applicable.value.toFixed(6),
        days,
        amount: amount.toFixed(4),
      });
    }

    const result = {
      moraDays: diffDays(limite, dto.payment_date),
      moraAmount: totalAmount.toFixed(4),
      limite,
      article,
      debtKind: dto.debt_kind,
    };

    if (!dto.explain) return result;

    return { ...result, segments };
  }

  /** Naturaleza de la deuda de mora (Art. 141): deuda de valor, privilegio absoluto. */
  nature(debtKind: string) {
    return {
      debtKind,
      debtNature: 'deuda_de_valor',
      privileged: true,
      article: '141',
    };
  }

  /** Diferencia por salario inferior al minimo + mora (Art. 130). */
  async salaryMinimumDifference(tenantId: string, dto: SalaryMinimumDifferenceDto) {
    let minimumWage: Decimal;
    try {
      minimumWage = await this.parameters.resolve(
        tenantId,
        'salario_minimo_nacional',
        dto.period_to,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const from = new Date(`${dto.period_from}T00:00:00Z`);
    const to = new Date(`${dto.period_to}T00:00:00Z`);
    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()) +
      1;

    const diffPerMonth = Decimal.max(0, minimumWage.minus(dto.paid_monthly));
    const difference = diffPerMonth.mul(Math.max(months, 0));

    const moraResult = await this.calculate(tenantId, {
      debt_amount: difference.toNumber(),
      due_from: dto.period_to,
      grace_days: 0,
      payment_date: dto.payment_date,
      debt_kind: 'salario_minimo',
    });

    return {
      minimumWage: minimumWage.toFixed(4),
      months,
      difference: difference.toFixed(4),
      moraDays: moraResult.moraDays,
      moraAmount: moraResult.moraAmount,
      total: difference.add(new Decimal(moraResult.moraAmount)).toFixed(4),
      article: '130',
    };
  }
}
