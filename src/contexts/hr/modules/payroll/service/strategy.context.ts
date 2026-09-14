import { Injectable } from '@nestjs/common';
import { IPayrollStrategy } from '../interface/payroll-strategy.interface';
import { FixedStrategy } from '../strategies/fixed.strategy';
import { PercentageStrategy } from '../strategies/percentage.strategy';
import {
  HolidayWorkedStrategy,
  IncapacityDeductionStrategy,
  IncapacityStrategy,
  NightSurchargeStrategy,
  OvertimeStrategy,
} from '../strategies/formula.strategy';

@Injectable()
export class StrategyContext {
  private readonly strategies = new Map<string, IPayrollStrategy>();

  constructor(
    private readonly fixed: FixedStrategy,
    private readonly percentage: PercentageStrategy,
    private readonly bn: NightSurchargeStrategy,
    private readonly he: OvertimeStrategy,
    private readonly fer: HolidayWorkedStrategy,
    private readonly sub: IncapacityStrategy,
    private readonly inc: IncapacityDeductionStrategy,
  ) {
    this.strategies.set('fixed', this.fixed);
    this.strategies.set('percentage', this.percentage);
    this.strategies.set('bn', this.bn);
    this.strategies.set('he', this.he);
    this.strategies.set('fer', this.fer);
    this.strategies.set('sub', this.sub);
    this.strategies.set('inc', this.inc);
  }

  getStrategy(method: string, code?: string): IPayrollStrategy {
    let strat: IPayrollStrategy | undefined;

    if (method === 'formula' && code) {
      strat = this.strategies.get(code.toLowerCase());
    } else {
      strat = this.strategies.get(method.toLowerCase());
    }

    if (!strat) {
      throw new Error(`Strategy for method ${method} not found`);
    }

    return strat;
  }
}
