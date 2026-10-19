import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { reportingQueries } from './reporting.queries';
import {
  ProductProfitability,
  SaleProfitability,
  IncomeStatementRow,
  IncomeStatementResult,
  ExpenseSummaryByCategory,
  ExpenseFixedVsVariable,
  ExpenseMonthlyTrend,
  SellerPerformance,
  FinancialKpis,
  TrialBalanceRow,
} from './interface/reporting.interface';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // -------------------------------------------------------
  // 1. PROFITABILITY BY PRODUCT
  // -------------------------------------------------------

  async getProfitabilityByProduct(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<ProductProfitability[]> {
    const { rows } = await this.db.query(
      reportingQueries.profitabilityByProduct,
      [tenantId, startDate, endDate],
    );
    return rows;
  }

  // -------------------------------------------------------
  // 2. PROFITABILITY BY SALE
  // -------------------------------------------------------

  async getProfitabilityBySale(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<SaleProfitability[]> {
    const { rows } = await this.db.query(reportingQueries.profitabilityBySale, [
      tenantId,
      startDate,
      endDate,
    ]);
    return rows;
  }

  // -------------------------------------------------------
  // 3. P&L — INCOME STATEMENT
  // -------------------------------------------------------

  async getIncomeStatement(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<IncomeStatementResult> {
    const { rows } = await this.db.query(reportingQueries.incomeStatement, [
      tenantId,
      startDate,
      endDate,
    ]);

    const allRows: IncomeStatementRow[] = rows;

    const income = allRows.filter((r) => r.type_name === 'Ingreso');
    const expenses = allRows.filter((r) => r.type_name === 'Gasto');
    const costs = allRows.filter((r) => r.type_name === 'Costo');

    const totalIncome = income.reduce((s, r) => s + Number(r.balance), 0);
    const totalExpenses = expenses.reduce((s, r) => s + Number(r.balance), 0);
    const totalCosts = costs.reduce((s, r) => s + Number(r.balance), 0);
    const grossProfit = totalIncome - totalCosts;
    const netIncome = grossProfit - totalExpenses;

    return {
      period: { startDate, endDate },
      income,
      expenses,
      costs,
      totals: {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        netIncome: Math.round(netIncome * 100) / 100,
      },
    };
  }

  // -------------------------------------------------------
  // 4. EXPENSE REPORTS
  // -------------------------------------------------------

  async getExpenseSummaryByCategory(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<ExpenseSummaryByCategory[]> {
    const { rows } = await this.db.query(
      reportingQueries.expenseSummaryByCategory,
      [tenantId, startDate, endDate],
    );
    return rows;
  }

  async getExpenseFixedVsVariable(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<ExpenseFixedVsVariable[]> {
    const { rows } = await this.db.query(
      reportingQueries.expenseSummaryFixedVsVariable,
      [tenantId, startDate, endDate],
    );
    return rows;
  }

  async getExpenseMonthlyTrend(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<ExpenseMonthlyTrend[]> {
    const { rows } = await this.db.query(reportingQueries.expenseMonthlyTrend, [
      tenantId,
      startDate,
      endDate,
    ]);
    return rows;
  }

  // -------------------------------------------------------
  // 5. SALES BY SELLER
  // -------------------------------------------------------

  async getSalesBySeller(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<SellerPerformance[]> {
    const { rows } = await this.db.query(reportingQueries.salesBySeller, [
      tenantId,
      startDate,
      endDate,
    ]);
    return rows;
  }

  // -------------------------------------------------------
  // 6. FINANCIAL KPIs / DASHBOARD
  // -------------------------------------------------------

  async getFinancialKpis(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<FinancialKpis> {
    const { rows } = await this.db.query(reportingQueries.financialKpis, [
      tenantId,
      startDate,
      endDate,
    ]);
    return rows[0];
  }

  // -------------------------------------------------------
  // 7. TRIAL BALANCE
  // -------------------------------------------------------

  async getTrialBalance(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<TrialBalanceRow[]> {
    const { rows } = await this.db.query(reportingQueries.trialBalance, [
      tenantId,
      startDate,
      endDate,
    ]);
    return rows;
  }
}
