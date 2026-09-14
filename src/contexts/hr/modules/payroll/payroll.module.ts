import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './service/payroll.service';
import { PayrollRepository } from './repositories/payroll.repository';
import { CalculationEngine } from './service/calc-engine.service';
import { EmployeeService } from '../employee/employee.service';
import { StrategyContext } from './service/strategy.context';
import { FixedStrategy } from './strategies/fixed.strategy';
import { PercentageStrategy } from './strategies/percentage.strategy';
import {
  HolidayWorkedStrategy,
  IncapacityDeductionStrategy,
  IncapacityStrategy,
  NightSurchargeStrategy,
  OvertimeStrategy,
} from './strategies/formula.strategy';
import { AccountingModule } from '../../../finances/modules/accounting/accounting.module';

@Module({
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayrollRepository,
    CalculationEngine,
    StrategyContext,
    FixedStrategy,
    PercentageStrategy,
    EmployeeService,
    NightSurchargeStrategy,
    OvertimeStrategy,
    HolidayWorkedStrategy,
    IncapacityStrategy,
    IncapacityDeductionStrategy,
  ],
  imports: [AccountingModule],
})
export class PayrollModule {}
