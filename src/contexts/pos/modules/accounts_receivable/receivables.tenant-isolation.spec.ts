import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsReceivableService } from './accounts-receivable.service';
import { CollectionAlertsService } from '../collection_alerts/collection-alerts.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';

// role_hierarchy 1 = employee, 4 = superuser (seeds/catalog/general/005).
// El codigo anterior trataba hierarchy === 1 como superusuario, es decir, a
// los employees.
const roles: Record<number, { role_name: string; role_hierarchy: number }> = {
  1: { role_name: 'superuser', role_hierarchy: 4 },
  4: { role_name: 'employee', role_hierarchy: 1 },
};
const session = (role_id: number): IUserSession => ({
  user_id: 'u1',
  email: 'u@test.com',
  tenant_id: TENANT_A,
  role_id,
});

describe('CxC y alertas de cobro - quien es superusuario', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const receivables = new AccountsReceivableService(db, tenantScope, {} as any);
  const alerts = new CollectionAlertsService(db, tenantScope);

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('un employee lista solo las cuentas por cobrar de su tenant', async () => {
    await receivables.getAccountsReceivable(session(4));
    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toBe('');
    expect(params[0]).toBe(TENANT_A);
  });

  it('el superusuario lista las cuentas por cobrar globales', async () => {
    await receivables.getAccountsReceivable(session(1));
    // getAllGlobal recibe (limit, offset), sin tenant
    expect(query.mock.calls[0][1]).toEqual([50, 0]);
  });

  it('un employee no cobra una cuenta de otro tenant', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          sale_account_receivable_id: 'sar-B',
          sale_id: 's-B',
          tenant_id: TENANT_B,
        },
      ],
    });
    await expect(
      receivables.registerCollection(
        { sale_account_receivable_id: 'sar-B', amount_paid: 1 } as any,
        session(4),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un employee no puede pedir las alertas de otro tenant', async () => {
    await expect(alerts.getPendingAlerts(session(4), TENANT_B)).rejects.toThrow(
      ForbiddenException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('un employee no resuelve una alerta de otro tenant', async () => {
    query.mockResolvedValueOnce({
      rows: [{ collection_alert_id: 'al-B', tenant_id: TENANT_B }],
    });
    await expect(alerts.resolve('al-B', session(4))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('una alerta inexistente sigue siendo 404', async () => {
    await expect(alerts.resolve('nada', session(4))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('el superusuario si puede pedir las alertas de otro tenant', async () => {
    await alerts.getPendingAlerts(session(1), TENANT_B);
    expect(query.mock.calls[0][1]).toEqual([TENANT_B]);
  });
});
