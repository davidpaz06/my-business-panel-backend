import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import {
  getProfitabilityByProductDoc,
  getProfitabilityBySaleDoc,
  getIncomeStatementDoc,
  getExpenseSummaryByCategoryDoc,
  getExpenseFixedVsVariableDoc,
  getExpenseMonthlyTrendDoc,
  getSalesBySellerDoc,
  getFinancialKpisDoc,
  getTrialBalanceDoc,
} from '@/docs/contexts/hr/reporting';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Reporting')
@Controller('reporting')
@UseGuards(AuthenticationGuard)
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  // -------------------------------------------------------
  // 1. PROFITABILITY BY PRODUCT
  // -------------------------------------------------------

  @ApiOperation(getProfitabilityByProductDoc.operation)
  @ApiResponse(getProfitabilityByProductDoc.responses[200])
  @ApiResponse(getProfitabilityByProductDoc.responses[401])
  @Get('profitability/product/:tenantId')
  getProfitabilityByProduct(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getProfitabilityByProduct(
      tenantId,
      start,
      end,
    );
  }

  // -------------------------------------------------------
  // 2. PROFITABILITY BY SALE
  // -------------------------------------------------------

  @ApiOperation(getProfitabilityBySaleDoc.operation)
  @ApiResponse(getProfitabilityBySaleDoc.responses[200])
  @ApiResponse(getProfitabilityBySaleDoc.responses[401])
  @Get('profitability/sale/:tenantId')
  getProfitabilityBySale(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getProfitabilityBySale(tenantId, start, end);
  }

  // -------------------------------------------------------
  // 3. P&L — INCOME STATEMENT
  // -------------------------------------------------------

  @ApiOperation(getIncomeStatementDoc.operation)
  @ApiResponse(getIncomeStatementDoc.responses[200])
  @ApiResponse(getIncomeStatementDoc.responses[401])
  @Get('income-statement/:tenantId')
  getIncomeStatement(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getIncomeStatement(tenantId, start, end);
  }

  // -------------------------------------------------------
  // 4. EXPENSE REPORTS
  // -------------------------------------------------------

  @ApiOperation(getExpenseSummaryByCategoryDoc.operation)
  @ApiResponse(getExpenseSummaryByCategoryDoc.responses[200])
  @ApiResponse(getExpenseSummaryByCategoryDoc.responses[401])
  @Get('expenses/by-category/:tenantId')
  getExpenseSummaryByCategory(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getExpenseSummaryByCategory(
      tenantId,
      start,
      end,
    );
  }

  @ApiOperation(getExpenseFixedVsVariableDoc.operation)
  @ApiResponse(getExpenseFixedVsVariableDoc.responses[200])
  @ApiResponse(getExpenseFixedVsVariableDoc.responses[401])
  @Get('expenses/fixed-vs-variable/:tenantId')
  getExpenseFixedVsVariable(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getExpenseFixedVsVariable(
      tenantId,
      start,
      end,
    );
  }

  @ApiOperation(getExpenseMonthlyTrendDoc.operation)
  @ApiResponse(getExpenseMonthlyTrendDoc.responses[200])
  @ApiResponse(getExpenseMonthlyTrendDoc.responses[401])
  @Get('expenses/monthly-trend/:tenantId')
  getExpenseMonthlyTrend(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getExpenseMonthlyTrend(tenantId, start, end);
  }

  // -------------------------------------------------------
  // 5. SALES BY SELLER
  // -------------------------------------------------------

  @ApiOperation(getSalesBySellerDoc.operation)
  @ApiResponse(getSalesBySellerDoc.responses[200])
  @ApiResponse(getSalesBySellerDoc.responses[401])
  @Get('sales-by-seller/:tenantId')
  getSalesBySeller(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getSalesBySeller(tenantId, start, end);
  }

  // -------------------------------------------------------
  // 6. FINANCIAL KPIs / DASHBOARD
  // -------------------------------------------------------

  @ApiOperation(getFinancialKpisDoc.operation)
  @ApiResponse(getFinancialKpisDoc.responses[200])
  @ApiResponse(getFinancialKpisDoc.responses[401])
  @Get('kpis/:tenantId')
  getFinancialKpis(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getFinancialKpis(tenantId, start, end);
  }

  // -------------------------------------------------------
  // 7. TRIAL BALANCE
  // -------------------------------------------------------

  @ApiOperation(getTrialBalanceDoc.operation)
  @ApiResponse(getTrialBalanceDoc.responses[200])
  @ApiResponse(getTrialBalanceDoc.responses[401])
  @Get('trial-balance/:tenantId')
  getTrialBalance(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.reportingService.getTrialBalance(tenantId, start, end);
  }
}
