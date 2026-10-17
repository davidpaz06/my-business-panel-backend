import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { expenseQueries } from './expense.queries';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreateFiscalPeriodDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto';
import {
  CategoryAnalytic,
  ExpenseCategoryFromDb,
  ExpenseFromDb,
  ExpenseHistoryRow,
  FixedVsVariableAnalytic,
  FiscalPeriodFromDb,
  PaginatedExpenses,
  PayrollAnalytic,
  SalesVsExpensesAnalytic,
} from './interface/expense.interface';
import { AccountingJournalService } from '../accounting/accounting-journal.service';

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly journalService: AccountingJournalService,
  ) {}

  // -------------------------------------------------------
  // EXPENSE CATEGORIES
  // -------------------------------------------------------

  async getCategoriesByTenant(
    tenantId: string,
  ): Promise<ExpenseCategoryFromDb[]> {
    const { rows } = await this.db.query(expenseQueries.getCategoriesByTenant, [
      tenantId,
    ]);
    return rows;
  }

  async searchCategories(
    tenantId: string,
    search: string,
  ): Promise<ExpenseCategoryFromDb[]> {
    const { rows } = await this.db.query(
      expenseQueries.searchCategoriesByTenant,
      [tenantId, search || null],
    );
    return rows;
  }

  async getCategoryById(
    categoryId: string,
    tenantId: string,
  ): Promise<ExpenseCategoryFromDb> {
    const { rows } = await this.db.query(expenseQueries.getCategoryById, [
      categoryId,
      tenantId,
    ]);
    if (!rows.length) throw new NotFoundException('Categoría no encontrada');
    return rows[0];
  }

  async createCategory(data: CreateExpenseCategoryDto): Promise<string> {
    const { rows } = await this.db.query(expenseQueries.createCategory, [
      data.tenant_id,
      data.name,
      data.account_code ?? null,
      data.parent_category_id ?? null,
      data.is_fixed ?? true,
    ]);
    return rows[0].category_id;
  }

  async updateCategory(
    categoryId: string,
    tenantId: string,
    data: UpdateExpenseCategoryDto,
  ): Promise<string> {
    const { rows } = await this.db.query(expenseQueries.updateCategory, [
      categoryId,
      tenantId,
      data.name ?? null,
      data.account_code ?? null,
      data.is_fixed ?? null,
      data.is_active ?? null,
    ]);
    if (!rows.length) throw new NotFoundException('Categoría no encontrada');
    return rows[0].category_id;
  }

  async provisionCategories(tenantId: string): Promise<number> {
    const { rows } = await this.db.query(
      expenseQueries.provisionTenantExpenseCategories,
      [tenantId],
    );
    return rows.length;
  }

  // -------------------------------------------------------
  // EXPENSES
  // -------------------------------------------------------

  async getExpensesByTenant(tenantId: string): Promise<ExpenseFromDb[]> {
    const { rows } = await this.db.query(expenseQueries.getExpensesByTenant, [
      tenantId,
    ]);
    return rows;
  }

  async getExpensesByBranch(
    tenantId: string,
    branchId: string,
  ): Promise<ExpenseFromDb[]> {
    const { rows } = await this.db.query(expenseQueries.getExpensesByBranch, [
      tenantId,
      branchId,
    ]);
    return rows;
  }

  async getExpenseById(
    expenseId: string,
    tenantId: string,
  ): Promise<ExpenseFromDb> {
    const { rows } = await this.db.query(expenseQueries.getExpenseById, [
      expenseId,
      tenantId,
    ]);
    if (!rows.length) throw new NotFoundException('Gasto no encontrado');
    return rows[0];
  }

  async getExpensesPaginated(
    tenantId: string,
    options: {
      branchId?: string | null;
      start?: string | null;
      end?: string | null;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedExpenses> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const branchId = options.branchId || null;
    const start = options.start || null;
    const end = options.end || null;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(expenseQueries.getExpensesPaginated, [
        tenantId,
        branchId,
        start,
        end,
        limit,
        offset,
      ]),
      this.db.query(expenseQueries.countExpensesPaginated, [
        tenantId,
        branchId,
        start,
        end,
      ]),
    ]);

    return {
      results: rows as ExpenseHistoryRow[],
      total: countRows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getExpensesByDateRange(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<ExpenseFromDb[]> {
    const { rows } = await this.db.query(
      expenseQueries.getExpensesByDateRange,
      [tenantId, startDate, endDate],
    );
    return rows;
  }

  async createExpense(
    data: CreateExpenseDto,
  ): Promise<{ expenseId: string; entryId?: string }> {
    // FNZ-GA-08: el total se deriva en el servidor.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const amount = round2(Number(data.amount));
    const taxAmount = round2(Number(data.tax_amount ?? 0));
    const totalAmount = round2(amount + taxAmount);
    if (
      data.total_amount !== undefined &&
      Math.abs(Number(data.total_amount) - totalAmount) > 0.01
    ) {
      throw new BadRequestException(
        'El total del gasto debe ser igual al monto mas el IVA',
      );
    }

    const category = await this.getCategoryById(
      data.category_id,
      data.tenant_id,
    );

    // FNZ-GA-09: no se registran gastos en un periodo fiscal cerrado.
    const { rows: closed } = await this.db.query(
      expenseQueries.getClosedPeriodForDate,
      // expense_date llega como fecha (00:00 UTC): se pasa como YYYY-MM-DD.
      [data.tenant_id, new Date(data.expense_date).toISOString().slice(0, 10)],
    );
    if (closed.length) {
      throw new BadRequestException(
        `El periodo fiscal "${closed[0].name}" esta cerrado: no se pueden registrar gastos con esa fecha`,
      );
    }

    const txn = await this.db.transaction();
    try {
      const { rows } = await txn.query(expenseQueries.createExpense, [
        data.tenant_id,
        data.branch_id,
        data.category_id,
        data.description ?? null,
        amount,
        taxAmount,
        totalAmount,
        data.currency_id,
        new Date(data.expense_date),
        data.payment_method ?? 'CASH',
        data.reference_number ?? null,
        data.notes ?? null,
        data.created_by ?? null,
      ]);
      const expenseId = rows[0].expense_id;

      // FNZ-GA-09: el gasto y su asiento son atomicos. Si el asiento falla,
      // el gasto no se guarda (antes quedaba registrado sin asiento y
      // contabilidad y reportes no cuadraban).
      let entryId: string;
      try {
        entryId = await this.journalService.generateExpenseJournal(
          {
            tenantId: data.tenant_id,
            expenseId,
            accountCode: category.account_code,
            subtotalAmount: amount,
            taxAmount,
            totalAmount,
            paymentMethod: data.payment_method ?? 'CASH',
            currencyId: data.currency_id,
            entryDate: new Date(data.expense_date),
            description: data.description,
          },
          txn,
        );
      } catch (journalError) {
        this.logger.error(
          `Error generating journal for expense ${expenseId}: ${(journalError as Error).message}`,
        );
        throw new BadRequestException(
          'No se pudo registrar el asiento contable del gasto: ' +
            (journalError as Error).message,
        );
      }

      await txn.commit();
      return { expenseId, entryId };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error creating expense:', error);
      throw new BadRequestException('Error al registrar el gasto');
    }
  }

  // -------------------------------------------------------
  // ANALYTICS
  // -------------------------------------------------------

  async getAnalyticsFixedVsVariable(
    tenantId: string,
    start: string,
    end: string,
    branchId?: string | null,
  ): Promise<FixedVsVariableAnalytic[]> {
    const { rows } = await this.db.query(
      expenseQueries.analyticsFixedVsVariable,
      [tenantId, start, end, branchId ?? null],
    );
    return rows;
  }

  async getAnalyticsFixedBreakdown(
    tenantId: string,
    start: string,
    end: string,
    branchId?: string | null,
  ): Promise<CategoryAnalytic[]> {
    const { rows } = await this.db.query(
      expenseQueries.analyticsFixedBreakdown,
      [tenantId, start, end, branchId ?? null],
    );
    return rows;
  }

  async getAnalyticsVariableBreakdown(
    tenantId: string,
    start: string,
    end: string,
    branchId?: string | null,
  ): Promise<CategoryAnalytic[]> {
    const { rows } = await this.db.query(
      expenseQueries.analyticsVariableBreakdown,
      [tenantId, start, end, branchId ?? null],
    );
    return rows;
  }

  async getAnalyticsSalesVsExpenses(
    tenantId: string,
    start: string,
    end: string,
    branchId?: string | null,
  ): Promise<SalesVsExpensesAnalytic[]> {
    const { rows } = await this.db.query(
      expenseQueries.analyticsSalesVsExpenses,
      [tenantId, start, end, branchId ?? null],
    );
    return rows;
  }

  async getAnalyticsPayroll(
    tenantId: string,
    start: string,
    end: string,
    branchId?: string | null,
  ): Promise<PayrollAnalytic> {
    const { rows } = await this.db.query(expenseQueries.analyticsPayroll, [
      tenantId,
      start,
      end,
      branchId ?? null,
    ]);
    return rows[0] as PayrollAnalytic;
  }

  // -------------------------------------------------------
  // FISCAL PERIODS
  // -------------------------------------------------------

  async getFiscalPeriods(tenantId: string): Promise<FiscalPeriodFromDb[]> {
    const { rows } = await this.db.query(
      expenseQueries.getFiscalPeriodsByTenant,
      [tenantId],
    );
    return rows;
  }

  async createFiscalPeriod(data: CreateFiscalPeriodDto): Promise<string> {
    const { rows } = await this.db.query(expenseQueries.createFiscalPeriod, [
      data.tenant_id,
      data.name,
      new Date(data.start_date),
      new Date(data.end_date),
    ]);
    return rows[0].period_id;
  }

  async closeFiscalPeriod(periodId: string, tenantId: string): Promise<string> {
    const { rows } = await this.db.query(expenseQueries.closeFiscalPeriod, [
      periodId,
      tenantId,
    ]);
    if (!rows.length)
      throw new BadRequestException('Período no encontrado o ya está cerrado');
    return rows[0].period_id;
  }
}
