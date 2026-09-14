import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { SeveranceModule } from '../severance/severance.module';
import { VacationsModule } from '../vacations/vacations.module';
import { ProfitSharingModule } from '../profit-sharing/profit-sharing.module';
import { MoraModule } from '../mora/mora.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [SeveranceModule, VacationsModule, ProfitSharingModule, MoraModule, SalaryModule],
  providers: [SettlementService],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
