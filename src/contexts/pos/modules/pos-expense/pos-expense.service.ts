import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { posExpenseQueries } from './pos-expense.queries';
import { CreateExpenseDto, CreateExpenseTypeDto } from './dto/pos-expense.dto';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@Injectable()
export class PosExpenseService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async listTypesByTenant(tenantId: string) {
    const { rows } = await this.db.query(posExpenseQueries.listTypesByTenant, [
      tenantId,
    ]);
    return rows;
  }

  async createType(tenantId: string, data: CreateExpenseTypeDto) {
    const { rows } = await this.db.query(posExpenseQueries.createType, [
      tenantId,
      data.expense_type_name,
      data.expense_type_detail ?? null,
    ]);
    return rows[0];
  }

  async listByBranch(branchId: string, session: IUserSession) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    const { rows } = await this.db.query(posExpenseQueries.listByBranch, [
      branchId,
    ]);
    return rows;
  }

  async create(data: CreateExpenseDto, session: IUserSession) {
    // Sucursal y tipo de gasto deben ser del tenant de la sesion.
    await this.tenantScope.assertOwnedByTenant(
      'branch',
      data.branch_id,
      session.tenant_id,
    );
    await this.tenantScope.assertOwnedByTenant(
      'expenseType',
      data.expense_type_id,
      session.tenant_id,
    );
    const status = session.role_id === 4 ? 'pending' : 'approved';
    const { rows } = await this.db.query(posExpenseQueries.create, [
      data.expense_type_id,
      data.expense_amount,
      data.branch_id,
      session.user_id,
      status,
    ]);

    const { rows: fullRecord } = await this.db.query(
      posExpenseQueries.getById,
      [rows[0].expense_id],
    );
    return fullRecord[0];
  }

  async updateStatus(
    expenseId: string,
    status: 'approved' | 'rejected' | 'cancelled',
    session: IUserSession,
    rejectionReason?: string,
  ) {
    // El gasto debe ser del tenant de la sesion (404 si no).
    await this.tenantScope.assertOwns('expense', expenseId, session);

    // Basic validation
    if (status === 'cancelled') {
      // Employees can only cancel their own pending requests
      const { rows: current } = await this.db.query(
        'SELECT user_id, status FROM pos_schema.expense WHERE expense_id = $1',
        [expenseId],
      );
      if (!current[0]) throw new BadRequestException('Expense not found');
      if (current[0].user_id !== session.user_id && session.role_id === 4) {
        throw new ForbiddenException('Not authorized to cancel this expense');
      }
      if (current[0].status !== 'pending') {
        throw new BadRequestException('Can only cancel pending expenses');
      }
    } else {
      // Admin roles (1, 2, 3) can approve/reject
      if (session.role_id === 4) {
        throw new ForbiddenException(
          'Not authorized to approve/reject expenses',
        );
      }
    }

    const { rows } = await this.db.query(posExpenseQueries.updateStatus, [
      expenseId,
      status,
      rejectionReason ?? null,
    ]);

    const { rows: fullRecord } = await this.db.query(
      posExpenseQueries.getById,
      [expenseId],
    );
    return fullRecord[0];
  }
}
