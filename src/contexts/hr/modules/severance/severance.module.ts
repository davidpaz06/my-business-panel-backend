import { Module } from '@nestjs/common';
import { SeveranceService } from './severance.service';
import { SeveranceDepositService } from './severance-deposit.service';
import { SeveranceInterestService } from './severance-interest.service';
import { SeveranceAdvanceService } from './severance-advance.service';
import { SeveranceController } from './severance.controller';
import { ParametersModule } from '../parameters/parameters.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [ParametersModule, SalaryModule],
  providers: [
    SeveranceService,
    SeveranceDepositService,
    SeveranceInterestService,
    SeveranceAdvanceService,
  ],
  controllers: [SeveranceController],
  exports: [SeveranceService, SeveranceDepositService, SeveranceInterestService, SeveranceAdvanceService],
})
export class SeveranceModule {}
