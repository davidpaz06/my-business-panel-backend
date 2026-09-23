import { Module } from '@nestjs/common';

import { StateModule } from '@/contexts/general/modules/state/state.module';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateController } from './exchange-rate.controller';
import { BcvRateSyncService } from './bcv-rate-sync.service';

@Module({
  imports: [StateModule],
  providers: [ExchangeRateService, BcvRateSyncService],
  controllers: [ExchangeRateController],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
