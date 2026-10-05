import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { LoyalProgramController } from './loyalty-program.controller';
import { LoyalProgramService } from './loyalty-program.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
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

describe('LoyalProgram - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new LoyalProgramController(
    new LoyalProgramService(db),
    tenantScope,
  );

  beforeEach(() => query.mockReset());

  it('exige AuthenticationGuard a nivel de clase', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LoyalProgramController),
    ).toContain(AuthenticationGuard);
  });

  it('listar programas de otro tenant por URL: 404 sin consultar', async () => {
    await expect(
      controller.getLoyalProgramsByTenant(session(3), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('listar programas propios usa el tenant de la sesion', async () => {
    query.mockResolvedValue({ rows: [] });
    await controller.getLoyalProgramsByTenant(session(3), TENANT_A);
    expect(query.mock.calls[0][1]).toEqual([TENANT_A]);
  });

  it('crear programa usa el tenant de la sesion', async () => {
    query.mockResolvedValue({ rows: [] });
    await controller.createLoyalProgram(session(3), {
      points_earned_per_currency_unit: 1,
      points_redeemed_per_currency_unit: 1,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO pos_schema.loyalty_program');
    expect(params[0]).toBe(TENANT_A);
  });

  it('programa de otro tenant por id: 404', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.getLoyalProgramById(session(3), 'prog-de-B'),
    ).rejects.toThrow(NotFoundException);
    expect(query.mock.calls[0][1]).toEqual(['prog-de-B', TENANT_A]);
  });

  it('editar programa ajeno: 404 y el UPDATE lleva el tenant', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      controller.updateLoyalProgram(session(3), 'prog-de-B', {
        is_active: false,
      } as any),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('$6::uuid IS NULL OR tenant_id = $6');
    expect(params[params.length - 1]).toBe(TENANT_A);
  });

  it('borrar programa ajeno: 404 y el DELETE lleva el tenant', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      controller.deleteLoyalProgram(session(3), 'prog-de-B'),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM pos_schema.loyalty_program');
    expect(params).toEqual(['prog-de-B', TENANT_A]);
  });

  it('el superusuario opera sin filtro de tenant', async () => {
    query.mockResolvedValue({ rows: [{}], rowCount: 1 });
    await controller.deleteLoyalProgram(session(1), 'prog-x');
    expect(query.mock.calls[0][1]).toEqual(['prog-x', null]);
  });
});
