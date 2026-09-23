import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { ExchangeRateService } from './exchange-rate.service';
import { DolarApiOficialResponse } from './interfaces/exchange-rate.interface';

const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const DEFAULT_CRON_SCHEDULE = '0 23 * * 1-5';
const BCV_AUTO_SOURCE = 'BCV_AUTO';

/**
 * Sincroniza la tasa base USD -> VES con la tasa oficial del BCV (via
 * dolarapi) de lunes a viernes. Solo corre cuando NODE_ENV=production
 * (en dev/staging la tasa base se carga a mano via POST /exchange-rate/base,
 * restringido a superuser). Cada corrida agrega una fila al ledger
 * inmutable (general_schema.exchange_rate) con source = 'BCV_AUTO'. El
 * diferencial por tenant sigue siendo manual (ExchangeRateController#setDelta).
 */
@Injectable()
export class BcvRateSyncService implements OnModuleInit {
  private readonly logger = new Logger(BcvRateSyncService.name);

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.log('bcv-rate-sync deshabilitado fuera de produccion');
      return;
    }

    const schedule =
      this.configService.get<string>('USD_RATE_CRON_SCHEDULE') ??
      DEFAULT_CRON_SCHEDULE;

    const job = new CronJob(schedule, () => {
      if (!this.isWeekday()) {
        this.logger.log('Corrida programada omitida: fin de semana');
        return;
      }
      void this.syncRate();
    });

    this.schedulerRegistry.addCronJob('bcv-rate-sync', job);
    job.start();
    this.logger.log(`bcv-rate-sync programado con schedule="${schedule}"`);

    // Corrida inicial: cubre el caso de un despliegue/reinicio que ocurra
    // despues de la hora programada del dia.
    if (this.isWeekday()) {
      void this.syncRate();
    } else {
      this.logger.log('Corrida inicial omitida: fin de semana');
    }
  }

  private isWeekday(date = new Date()): boolean {
    const day = date.getDay();
    return day >= 1 && day <= 5;
  }

  private async fetchOfficialRate(): Promise<number> {
    const response = await fetch(DOLAR_API_URL);
    if (!response.ok) {
      throw new Error(
        `dolarapi request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as DolarApiOficialResponse;
    if (typeof data.promedio !== 'number' || data.promedio <= 0) {
      throw new Error(
        `dolarapi returned an invalid "promedio" value: ${String(data.promedio)}`,
      );
    }

    return data.promedio;
  }

  private async syncRate(): Promise<void> {
    try {
      const rate = await this.fetchOfficialRate();
      const row = await this.exchangeRateService.setBaseRate({
        rate,
        source: BCV_AUTO_SOURCE,
      });
      this.logger.log(
        `exchange_rate base actualizada: ${row.rate} @ ${row.effective_at}`,
      );
    } catch (err) {
      this.logger.error('bcv-rate-sync run failed', err as Error);
    }
  }
}
