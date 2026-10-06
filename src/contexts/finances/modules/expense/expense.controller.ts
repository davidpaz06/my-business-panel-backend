import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExpenseService } from './expense.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreateFiscalPeriodDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto';
import {
  getCategoriesByTenantDoc,
  getCategoryByIdDoc,
  createCategoryDoc,
  updateCategoryDoc,
  provisionCategoriesDoc,
  getExpensesByTenantDoc,
  getExpensesByBranchDoc,
  getExpenseByIdDoc,
  getExpensesByDateRangeDoc,
  createExpenseDoc,
  getFiscalPeriodsDoc,
  createFiscalPeriodDoc,
  closeFiscalPeriodDoc,
  getFixedVsVariableDoc,
  getFixedBreakdownDoc,
  getVariableBreakdownDoc,
  getSalesVsExpensesDoc,
} from '@/docs/contexts/finances/expense';
import {
  ExpenseFixedVsVariableAnalytic,
  ExpenseCategoryAnalytic,
  SalesVsExpensesPoint,
} from './interface/expense.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Expense')
@UseGuards(AuthenticationGuard)
@Controller('expense')
export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  // -------------------------------------------------------
  // EXPENSE CATEGORIES
  // -------------------------------------------------------

  @ApiOperation(getCategoriesByTenantDoc.operation)
  @ApiResponse(getCategoriesByTenantDoc.responses[200])
  @Get('categories/:tenantId')
  getCategoriesByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('search') search?: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    if (search !== undefined && search.trim() !== '') {
      return this.expenseService.searchCategories(tenantId, search.trim());
    }
    return this.expenseService.getCategoriesByTenant(tenantId);
  }

  @ApiOperation(getCategoryByIdDoc.operation)
  @ApiResponse(getCategoryByIdDoc.responses[200])
  @ApiResponse(getCategoryByIdDoc.responses[404])
  @Get('categories/:tenantId/:categoryId')
  getCategoryById(
    @Session() session: IUserSession,
    @Param('categoryId') categoryId: string,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getCategoryById(categoryId, tenantId);
  }

  @ApiOperation(createCategoryDoc.operation)
  @ApiResponse(createCategoryDoc.responses[201])
  @Post('categories')
  createCategory(
    @Session() session: IUserSession,
    @Body() data: CreateExpenseCategoryDto,
  ) {
    data.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      data.tenant_id,
    );
    return this.expenseService.createCategory(data);
  }

  @ApiOperation(updateCategoryDoc.operation)
  @ApiResponse(updateCategoryDoc.responses[200])
  @ApiResponse(updateCategoryDoc.responses[404])
  @Patch('categories/:tenantId/:categoryId')
  updateCategory(
    @Session() session: IUserSession,
    @Param('categoryId') categoryId: string,
    @Param('tenantId') tenantId: string,
    @Body() data: UpdateExpenseCategoryDto,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.updateCategory(categoryId, tenantId, data);
  }

  @ApiOperation(provisionCategoriesDoc.operation)
  @ApiResponse(provisionCategoriesDoc.responses[201])
  @Post('categories/provision/:tenantId')
  provisionCategories(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.provisionCategories(tenantId);
  }

  // -------------------------------------------------------
  // ANALYTICS
  // -------------------------------------------------------

  @Get('analytics/fixed-vs-variable/:tenantId')
  getAnalyticsFixedVsVariable(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getAnalyticsFixedVsVariable(
      tenantId,
      start,
      end,
    );
  }

  @Get('analytics/fixed-breakdown/:tenantId')
  getAnalyticsFixedBreakdown(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getAnalyticsFixedBreakdown(tenantId, start, end);
  }

  @Get('analytics/variable-breakdown/:tenantId')
  getAnalyticsVariableBreakdown(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getAnalyticsVariableBreakdown(
      tenantId,
      start,
      end,
    );
  }

  @Get('analytics/sales-vs-expenses/:tenantId')
  getAnalyticsSalesVsExpenses(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('branchId') branchId?: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getAnalyticsSalesVsExpenses(
      tenantId,
      start,
      end,
      branchId,
    );
  }

  // -------------------------------------------------------
  // EXPENSES
  // -------------------------------------------------------

  // ANALYTICS (deben estar ANTES de @Get(':tenantId') para evitar conflicto de rutas)

  @ApiOperation(getFixedVsVariableDoc.operation)
  @ApiResponse(getFixedVsVariableDoc.responses[200])
  @Get('analytics/fixed-vs-variable/:tenantId')
  getFixedVsVariableSummary(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<ExpenseFixedVsVariableAnalytic[]> {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getFixedVsVariableSummary(tenantId, start, end);
  }

  @ApiOperation(getFixedBreakdownDoc.operation)
  @ApiResponse(getFixedBreakdownDoc.responses[200])
  @Get('analytics/fixed-breakdown/:tenantId')
  getFixedCategoryBreakdown(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<ExpenseCategoryAnalytic[]> {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getFixedCategoryBreakdown(tenantId, start, end);
  }

  @ApiOperation(getVariableBreakdownDoc.operation)
  @ApiResponse(getVariableBreakdownDoc.responses[200])
  @Get('analytics/variable-breakdown/:tenantId')
  getVariableCategoryBreakdown(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<ExpenseCategoryAnalytic[]> {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getVariableCategoryBreakdown(
      tenantId,
      start,
      end,
    );
  }

  @ApiOperation(getSalesVsExpensesDoc.operation)
  @ApiResponse(getSalesVsExpensesDoc.responses[200])
  @Get('analytics/sales-vs-expenses/:tenantId')
  getSalesVsExpenses(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('branchId') branchId?: string,
  ): Promise<SalesVsExpensesPoint[]> {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getSalesVsExpenses(
      tenantId,
      start,
      end,
      branchId ?? null,
    );
  }

  @ApiOperation({
    summary:
      'Historial de gastos paginado, filtrable por sucursal y rango de fechas',
  })
  @ApiResponse({ status: 200, description: 'Historial de gastos obtenido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get('history')
  getExpensesHistory(
    @Session() user: IUserSession,
    @Query('branchId') branchId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.expenseService.getExpensesPaginated(user.tenant_id, {
      branchId: branchId ?? null,
      start: start ?? null,
      end: end ?? null,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @ApiOperation(getExpensesByTenantDoc.operation)
  @ApiResponse(getExpensesByTenantDoc.responses[200])
  @Get(':tenantId')
  getExpensesByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getExpensesByTenant(tenantId);
  }

  @ApiOperation(getExpensesByBranchDoc.operation)
  @ApiResponse(getExpensesByBranchDoc.responses[200])
  @Get(':tenantId/branch/:branchId')
  getExpensesByBranch(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('branchId') branchId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getExpensesByBranch(tenantId, branchId);
  }

  @ApiOperation(getExpenseByIdDoc.operation)
  @ApiResponse(getExpenseByIdDoc.responses[200])
  @ApiResponse(getExpenseByIdDoc.responses[404])
  @Get(':tenantId/detail/:expenseId')
  getExpenseById(
    @Session() session: IUserSession,
    @Param('expenseId') expenseId: string,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getExpenseById(expenseId, tenantId);
  }

  @ApiOperation(getExpensesByDateRangeDoc.operation)
  @ApiResponse(getExpensesByDateRangeDoc.responses[200])
  @Get(':tenantId/range')
  getExpensesByDateRange(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getExpensesByDateRange(tenantId, start, end);
  }

  @ApiOperation(createExpenseDoc.operation)
  @ApiResponse(createExpenseDoc.responses[201])
  @ApiResponse(createExpenseDoc.responses[400])
  @ApiResponse(createExpenseDoc.responses[404])
  @Post()
  async createExpense(
    @Session() session: IUserSession,
    @Body() data: CreateExpenseDto,
  ) {
    data.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      data.tenant_id,
    );
    await this.tenantScope.assertOwnedByTenant(
      'branch',
      data.branch_id,
      data.tenant_id,
    );
    // el autor del gasto es quien tiene la sesion, no lo que diga el cliente
    data.created_by = session.user_id;
    return this.expenseService.createExpense(data);
  }

  // -------------------------------------------------------
  // FISCAL PERIODS
  // -------------------------------------------------------

  @ApiOperation(getFiscalPeriodsDoc.operation)
  @ApiResponse(getFiscalPeriodsDoc.responses[200])
  @Get('fiscal-periods/:tenantId')
  getFiscalPeriods(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.getFiscalPeriods(tenantId);
  }

  @ApiOperation(createFiscalPeriodDoc.operation)
  @ApiResponse(createFiscalPeriodDoc.responses[201])
  @Post('fiscal-periods')
  createFiscalPeriod(
    @Session() session: IUserSession,
    @Body() data: CreateFiscalPeriodDto,
  ) {
    data.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      data.tenant_id,
    );
    return this.expenseService.createFiscalPeriod(data);
  }

  @ApiOperation(closeFiscalPeriodDoc.operation)
  @ApiResponse(closeFiscalPeriodDoc.responses[200])
  @ApiResponse(closeFiscalPeriodDoc.responses[400])
  @Patch('fiscal-periods/:tenantId/:periodId/close')
  closeFiscalPeriod(
    @Session() session: IUserSession,
    @Param('periodId') periodId: string,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.expenseService.closeFiscalPeriod(periodId, tenantId);
  }
}
