import { NotFoundException } from '@nestjs/common';
import { PromosController } from './promos.controller';
import { PromosService } from './promos.service';
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

describe('Promos - aislamiento por tenant', () => {
  const query = jest.fn();
  const txnQuery = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const txn = {
    query: (q: any, params: any[]) => txnQuery(toSql(q), params),
    rawQuery: (q: string, params: any[]) => txnQuery(q, params),
    commit: jest.fn(),
    rollback: jest.fn(),
  };
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
    transaction: () => Promise.resolve(txn),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new PromosController(new PromosService(db), tenantScope);

  beforeEach(() => {
    query.mockReset();
    txnQuery.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('SELECT 1 FROM pos_schema.promotion')) {
        return Promise.resolve({
          rows: params[0] === 'promo-A' ? [{ ok: 1 }] : [],
        });
      }
      if (sql.includes('SELECT 1 FROM general_schema.branch')) {
        return Promise.resolve({
          rows: params[0] === 'branch-A' ? [{ ok: 1 }] : [],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    txnQuery.mockResolvedValue({ rows: [] });
  });

  it('promociones de otro tenant por URL: 404 sin consultar', () => {
    expect(() => controller.getTenantPromos(session(3), TENANT_B)).toThrow(
      NotFoundException,
    );
    expect(() => controller.getActiveDefaults(session(3), TENANT_B)).toThrow(
      NotFoundException,
    );
    expect(() =>
      controller.getApplicable(session(3), TENANT_B, 'variant-1'),
    ).toThrow(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('promociones propias usan el tenant de la sesion', async () => {
    await controller.getTenantPromos(session(3), TENANT_A);
    expect(query.mock.calls[0][1]).toEqual([TENANT_A]);
  });

  it('analiticas de otro tenant o con sucursal ajena: 404', async () => {
    await expect(controller.getAnalytics(session(3), TENANT_B)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      controller.getAnalytics(
        session(3),
        TENANT_A,
        '30d',
        undefined,
        'branch-B',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('detalle y objetivos de promocion ajena: 404 sin leer', async () => {
    await expect(
      controller.getPromoInfo(session(3), 'promo-B'),
    ).rejects.toThrow(NotFoundException);
    await expect(controller.getTargets(session(3), 'promo-B')).rejects.toThrow(
      NotFoundException,
    );
    expect(
      query.mock.calls.some(
        ([sql]) =>
          !sql.startsWith('\n    SELECT 1') && !sql.includes('SELECT 1 FROM'),
      ),
    ).toBe(false);
  });

  it('crear promocion usa el tenant de la sesion', async () => {
    txnQuery.mockResolvedValueOnce({ rows: [{ promotion_id: 'p1' }] });
    await controller.createPromoWithRule(session(3), {
      promotion_name: 'x',
      promotion_code: 'X',
      promotion_type_id: 1,
      promotion_start_date: new Date(),
      promotion_end_date: new Date(),
      is_active: true,
    } as any);
    const [sql, params] = txnQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO pos_schema.promotion');
    expect(params[0]).toBe(TENANT_A);
  });

  it('editar promocion ajena: 404, el UPDATE lleva el tenant y no cambia tenant_id', async () => {
    txnQuery.mockResolvedValue({ rows: [] });
    await expect(
      controller.updatePromotion(session(3), 'promo-B', {
        promotion_name: 'x',
        // un tenant_id colado en el body no debe poder reasignar la promocion
        ...({ tenant_id: TENANT_B } as object),
      } as any),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = txnQuery.mock.calls[0];
    expect(sql).toContain('UPDATE pos_schema.promotion');
    expect(sql).toContain('$2::uuid IS NULL OR tenant_id = $2');
    expect(sql).not.toMatch(/SET\s+tenant_id/);
    expect(params[1]).toBe(TENANT_A);
    expect(txn.rollback).toHaveBeenCalled();
  });

  it('borrar promocion ajena: 404 y el DELETE lleva el tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.deletePromotion(session(3), 'promo-B'),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM pos_schema.promotion');
    expect(params).toEqual(['promo-B', TENANT_A]);
  });

  it('el superusuario edita/borra sin filtro de tenant', async () => {
    query.mockResolvedValue({ rows: [{ promotion_id: 'p' }] });
    await controller.deletePromotion(session(1), 'p');
    expect(query.mock.calls[0][1]).toEqual(['p', null]);
  });
});
