import { Module } from '@nestjs/common';
import { VacationsService } from './vacations.service';
import { VacationPeriodService } from './vacation-period.service';
import { VacationsController } from './vacations.controller';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [SalaryModule],
  providers: [VacationsService, VacationPeriodService],
  controllers: [VacationsController],
  exports: [VacationsService, VacationPeriodService],
})
export class VacationsModule {}
