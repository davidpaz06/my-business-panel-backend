import { NotFoundException } from '@nestjs/common';
import { PosExpenseController } from './pos-expense.controller';
import { PosExpenseService } from './pos-expense.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';

const roles: Record<number, { role_name: string; role_hierarchy: number }> = {
  1: { role_name: 'superuser', role_hierarchy: 4 },
  3: { role_name: 'manager', role_hierarchy: 2 },
};
const session = (role_id: number): IUserSession => ({
  user_id: 'u1',
  email: 'u@test.com',
  tenant_id: TENANT_A,
  role_id,
});

const OWN = {
  branch: new Set(['branch-A']),
  expenseType: new Set(['type-A']),
  expense: new Set(['exp-A']),
};

describe('PosExpense - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new PosExpenseController(
    new PosExpenseService(db, tenantScope),
    tenantScope,
  );

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('SELECT 1 FROM general_schema.branch')) {
        return Promise.resolve({
          rows: OWN.branch.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      if (sql.includes('SELECT 1 FROM pos_schema.expense_type')) {
        return Promise.resolve({
          rows: OWN.expenseType.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      if (sql.includes('SELECT 1 FROM pos_schema.expense e')) {
        return Promise.resolve({
          rows: OWN.expense.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      return Promise.resolve({ rows: [{ expense_id: 'x' }] });
    });
  });

  const wrote = () =>
    query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(sql));

  it('tipos de gasto de otro tenant por URL: 404 sin consultar', () => {
    expect(() => controller.listTypes(session(3), TENANT_B)).toThrow(
      NotFoundException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('crear tipo de gasto usa el tenant de la sesion', async () => {
    await controller.createType(session(3), {
      expense_type_name: 'Luz',
    } as any);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO pos_schema.expense_type');
    expect(params[0]).toBe(TENANT_A);
  });

  it('gastos de una sucursal ajena: 404 sin listar', async () => {
    await expect(
      controller.listByBranch(session(3), 'branch-B'),
    ).rejects.toThrow(NotFoundException);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes('FROM pos_schema.expense e') &&
          sql.includes('e.branch_id = $1'),
      ),
    ).toBe(false);
  });

  it('crear gasto en sucursal ajena: 404 y no escribe', async () => {
    await expect(
      controller.create(
        {
          branch_id: 'branch-B',
          expense_type_id: 'type-A',
          expense_amount: 5,
        },
        session(3),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(wrote()).toBe(false);
  });

  it('crear gasto con tipo de otro tenant: 404 y no escribe', async () => {
    await expect(
      controller.create(
        {
          branch_id: 'branch-A',
          expense_type_id: 'type-B',
          expense_amount: 5,
        },
        session(3),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(wrote()).toBe(false);
  });

  it('aprobar un gasto ajeno: 404 y no escribe', async () => {
    await expect(
      controller.updateStatus('exp-B', { status: 'approved' }, session(3)),
    ).rejects.toThrow(NotFoundException);
    expect(wrote()).toBe(false);
  });

  it('aprobar un gasto propio si actualiza', async () => {
    await controller.updateStatus('exp-A', { status: 'approved' }, session(3));
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('UPDATE pos_schema.expense'),
      ),
    ).toBe(true);
  });
});
