import { Module } from '@nestjs/common';
import { ProfitSharingService } from './profit-sharing.service';
import { ProfitSharingPeriodService } from './profit-sharing-period.service';
import { ProfitSharingController } from './profit-sharing.controller';
import { SalaryModule } from '../salary/salary.module';
import { ParametersModule } from '../parameters/parameters.module';

@Module({
  imports: [SalaryModule, ParametersModule],
  providers: [ProfitSharingService, ProfitSharingPeriodService],
  controllers: [ProfitSharingController],
  exports: [ProfitSharingService, ProfitSharingPeriodService],
})
export class ProfitSharingModule {}
