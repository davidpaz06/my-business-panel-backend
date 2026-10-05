import { NotFoundException } from '@nestjs/common';
import { CashRegisterService } from './cash_register.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';

const roles: Record<number, { role_name: string; role_hierarchy: number }> = {
  1: { role_name: 'superuser', role_hierarchy: 4 },
  2: { role_name: 'admin', role_hierarchy: 3 },
  3: { role_name: 'manager', role_hierarchy: 2 },
  4: { role_name: 'employee', role_hierarchy: 1 },
};
const session = (role_id: number): IUserSession => ({
  user_id: 'u1',
  email: 'u@test.com',
  tenant_id: TENANT_A,
  role_id,
});

// Recursos del tenant A; todo lo demas es de otra empresa.
const OWN = {
  cashRegister: new Set(['reg-A']),
  cashRegisterSession: new Set(['ses-A']),
  branch: new Set(['branch-A']),
};

describe('CashRegister - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const stateService = { getRole: (id: number) => roles[id] } as any;
  const tenantScope = new TenantScopeService(db, stateService);
  const branchService = { validateBranch: jest.fn() } as any;
  const service = new CashRegisterService(
    db,
    branchService,
    stateService,
    tenantScope,
  );

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      // Consultas de pertenencia del TenantScopeService
      if (sql.includes('SELECT 1 FROM pos_schema.cash_register_session')) {
        return Promise.resolve({
          rows: OWN.cashRegisterSession.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      if (sql.includes('SELECT 1 FROM pos_schema.cash_register cr')) {
        return Promise.resolve({
          rows: OWN.cashRegister.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      if (sql.includes('SELECT 1 FROM general_schema.branch')) {
        return Promise.resolve({
          rows: OWN.branch.has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  const wroteSomething = () =>
    query.mock.calls.some(([sql]) =>
      /^\s*(INSERT|UPDATE|DELETE)|close_cash_register_session/.test(sql),
    );

  describe('listados', () => {
    const rowWithKey = {
      cash_register_id: 'reg-A',
      cash_register_key: 'secreta',
    };

    it('findAll lleva el tenant de la sesion (ya no devuelve todas las empresas)', async () => {
      query.mockResolvedValue({ rows: [rowWithKey] });
      await service.findAll(session(3));
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('b.tenant_id = $1');
      expect(params).toEqual([TENANT_A]);
    });

    it('findAllPaginated y su conteo llevan el tenant', async () => {
      query.mockResolvedValue({ rows: [{ total: 0 }] });
      await service.findAllPaginated(session(3));
      const calls = query.mock.calls;
      expect(calls[0][0]).toContain('b.tenant_id = $5');
      expect(calls[0][1][4]).toBe(TENANT_A);
      expect(calls[1][0]).toContain('b.tenant_id = $3');
      expect(calls[1][1][2]).toBe(TENANT_A);
    });

    it('findByBranch lleva el tenant', async () => {
      query.mockResolvedValue({ rows: [] });
      await service.findByBranch(session(3), 'branch-B');
      expect(query.mock.calls[0][1]).toEqual(['branch-B', TENANT_A]);
    });

    it('el superusuario lista sin filtro de tenant', async () => {
      query.mockResolvedValue({ rows: [] });
      await service.findAll(session(1));
      expect(query.mock.calls[0][1]).toEqual([null]);
    });

    it('oculta la clave de caja a employee y manager, con requires_key', async () => {
      query.mockResolvedValue({ rows: [rowWithKey] });
      for (const role of [4, 3]) {
        const { results } = await service.findAll(session(role));
        expect(results[0].cash_register_key).toBeNull();
        expect(results[0].requires_key).toBe(true);
      }
    });

    it('el admin y el superusuario si ven la clave', async () => {
      query.mockResolvedValue({ rows: [rowWithKey] });
      for (const role of [2, 1]) {
        const { results } = await service.findAll(session(role));
        expect(results[0].cash_register_key).toBe('secreta');
      }
    });

    it('caja de otro tenant por id: error y sin devolver datos', async () => {
      query.mockResolvedValue({ rows: [] });
      await expect(service.findById(session(3), 'reg-B')).rejects.toThrow();
      expect(query.mock.calls[0][1]).toEqual(['reg-B', TENANT_A]);
    });
  });

  describe('escrituras y operaciones sobre recursos ajenos', () => {
    it('abrir sesion en caja ajena: 404 y no escribe', async () => {
      await expect(
        service.startSession(session(2), {
          cash_register_id: 'reg-B',
          opened_at: new Date(),
          opening_amount: 0,
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(wroteSomething()).toBe(false);
    });

    it('cerrar sesion ajena: 404 y no cierra', async () => {
      await expect(
        service.closeSession(session(2), {
          cash_register_session_id: 'ses-B',
          closing_amount: 0,
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(wroteSomething()).toBe(false);
    });

    it('reporte de sesion ajena: 404', async () => {
      await expect(
        service.getSessionReport(session(3), 'ses-B'),
      ).rejects.toThrow(NotFoundException);
    });

    it('metodos de pago de sesion ajena: 404', async () => {
      await expect(
        service.getSessionPaymentMethods(session(3), 'ses-B'),
      ).rejects.toThrow(NotFoundException);
    });

    it('editar caja ajena: 404 y no escribe', async () => {
      await expect(
        service.update(session(2), {
          cash_register_id: 'reg-B',
          register_name: 'x',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(wroteSomething()).toBe(false);
    });

    it('mover una caja propia a una sucursal ajena: 404 y no escribe', async () => {
      await expect(
        service.update(session(2), {
          cash_register_id: 'reg-A',
          branch_id: 'branch-B',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(wroteSomething()).toBe(false);
    });

    it('borrar caja ajena: 404 y no escribe', async () => {
      await expect(service.remove(session(2), 'reg-B')).rejects.toThrow(
        NotFoundException,
      );
      expect(wroteSomething()).toBe(false);
    });

    it('borrar caja propia si ejecuta el DELETE', async () => {
      await service.remove(session(2), 'reg-A');
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('DELETE FROM pos_schema.cash_register'),
        ),
      ).toBe(true);
    });
  });
});
