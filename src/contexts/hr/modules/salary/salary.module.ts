import { Module } from '@nestjs/common';
import { SalaryHistoryService } from './salary-history.service';
import { SalaryHistoryController } from './salary-history.controller';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { ParametersModule } from '../parameters/parameters.module';

@Module({
  imports: [ParametersModule],
  providers: [SalaryHistoryService, SalaryService],
  controllers: [SalaryHistoryController, SalaryController],
  exports: [SalaryHistoryService, SalaryService],
})
export class SalaryModule {}
