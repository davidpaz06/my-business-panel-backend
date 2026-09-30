import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Database from '@crane-technologies/database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { generalQueries } from '@general/general.queries';
import { SetBaseRateDto } from './dto/set-base-rate.dto';
import { SetDeltaDto } from './dto/set-delta.dto';
import { SetManualRateDto } from './dto/set-manual-rate.dto';
import {
  EffectiveExchangeRate,
  ExchangeRateLedgerEntry,
} from './interfaces/exchange-rate.interface';

const { exchangeRate } = generalQueries;

/**
 * Tasa de cambio bimonetaria USD -> VES (Venezuela).
 *
 * Modelo (migrations/general/034):
 *   - Tasa base: ledger GLOBAL e inmutable. Una sola vigente, la mas
 *     reciente. Misma base para todos los tenants.
 *   - Diferencial (delta): ledger POR TENANT e inmutable. El tenant cobra
 *     por encima o por debajo de la base. Persiste hasta que se cargue
 *     otro valor; 0 lo restablece.
 *   - Tasa efectiva del tenant = base + delta. Es la que aplica a toda la
 *     aplicacion; resolverla siempre con getEffectiveRate(), nunca leyendo
 *     exchange_rate directo.
 *
 * Nada se edita ni se borra: cambiar la tasa o el delta agrega una fila.
 */
@Injectable()
export class ExchangeRateService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Tasa vigente aplicable al tenant (base + su diferencial). */
  async getEffectiveRate(tenantId: string): Promise<EffectiveExchangeRate> {
    const result = await this.db.query(exchangeRate.effectiveForTenant, [
      tenantId,
    ]);
    const row = result.rows[0];

    if (!row || row.effective_rate === null) {
      throw new BadRequestException(
        'No hay tasa de cambio base cargada. Registre la tasa USD -> VES antes de operar.',
      );
    }

    return row;
  }

  /**
   * Activa o desactiva la actualizacion automatica de tasa del tenant. El
   * job BCV solo alimenta la tasa base global; un tenant con auto_update =
   * false ignora esa base y opera con su tasa manual. No se puede desactivar
   * sin tener antes una tasa manual cargada.
   */
  async setAutoUpdate(tenantId: string, userId: string, autoUpdate: boolean) {
    if (!autoUpdate) {
      const manual = await this.db.query(exchangeRate.hasManualRate, [
        tenantId,
      ]);
      if (manual.rows.length === 0) {
        throw new BadRequestException(
          'Registre una tasa manual antes de desactivar la actualizacion automatica.',
        );
      }
    }

    const result = await this.db.query(exchangeRate.upsertAutoUpdate, [
      tenantId,
      autoUpdate,
      userId,
    ]);
    return result.rows[0];
  }

  /**
   * Carga la tasa manual del tenant. Agrega una fila al ledger; solo aplica
   * mientras el tenant tenga la actualizacion automatica desactivada.
   */
  async setManualRate(tenantId: string, userId: string, dto: SetManualRateDto) {
    const result = await this.db.query(exchangeRate.insertManualRate, [
      tenantId,
      dto.rate,
      userId,
    ]);
    return result.rows[0];
  }

  /** Historial completo del tenant: cada cambio de tasa base o de delta. */
  async getLedger(tenantId: string): Promise<ExchangeRateLedgerEntry[]> {
    const result = await this.db.query(exchangeRate.ledgerByTenant, [tenantId]);
    return result.rows;
  }

  /** Tasa base global vigente, sin el diferencial de ningun tenant. */
  async getCurrentBase() {
    const result = await this.db.query(exchangeRate.currentBase, []);
    return result.rows[0] ?? null;
  }

  /**
   * Carga una tasa base nueva. Afecta a TODOS los tenants (la base es la
   * del BCV, un dato del mundo). Agrega una fila al ledger, no edita nada.
   */
  async setBaseRate(dto: SetBaseRateDto) {
    const result = await this.db.query(exchangeRate.insertBaseRate, [
      dto.rate,
      dto.source ?? null,
    ]);
    return result.rows[0];
  }

  /**
   * Carga el diferencial del tenant. Agrega una fila al ledger, no edita
   * la anterior -- el historial queda completo. delta = 0 restablece.
   */
  async setDelta(tenantId: string, userId: string, dto: SetDeltaDto) {
    const result = await this.db.query(exchangeRate.insertDelta, [
      tenantId,
      dto.delta,
      dto.source ?? null,
      userId,
    ]);
    return result.rows[0];
  }
}
