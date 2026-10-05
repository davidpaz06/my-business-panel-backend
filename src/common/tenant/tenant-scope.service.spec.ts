import { NotFoundException } from '@nestjs/common';
import { TenantScopeService } from './tenant-scope.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';

const session = (role_id: number, tenant_id = TENANT_A): IUserSession => ({
  user_id: 'u1',
  email: 'u@test.com',
  tenant_id,
  role_id,
});

describe('TenantScopeService', () => {
  const roles: Record<number, { role_name: string; role_hierarchy: number }> = {
    1: { role_name: 'superuser', role_hierarchy: 4 },
    3: { role_name: 'manager', role_hierarchy: 2 },
    4: { role_name: 'employee', role_hierarchy: 1 },
  };
  const stateService = {
    getRole: (id: number) => {
      if (!roles[id]) throw new Error('rol desconocido');
      return roles[id];
    },
  } as any;
  const query = jest.fn();
  const service = new TenantScopeService({ query } as any, stateService);

  beforeEach(() => query.mockReset());

  it('solo el rol superuser es superusuario (hierarchy 1 es employee)', () => {
    expect(service.isSuperuser(session(1))).toBe(true);
    expect(service.isSuperuser(session(3))).toBe(false);
    expect(service.isSuperuser(session(4))).toBe(false);
  });

  it('un rol desconocido no es superusuario', () => {
    expect(service.isSuperuser(session(99))).toBe(false);
  });

  describe('resolveRequestedTenant', () => {
    it('sin tenant pedido usa el de la sesion', () => {
      expect(service.resolveRequestedTenant(session(4))).toBe(TENANT_A);
    });

    it('acepta el propio tenant', () => {
      expect(service.resolveRequestedTenant(session(4), TENANT_A)).toBe(
        TENANT_A,
      );
    });

    it('un usuario normal pidiendo otro tenant recibe 404', () => {
      expect(() =>
        service.resolveRequestedTenant(session(3), TENANT_B),
      ).toThrow(NotFoundException);
    });

    it('el superusuario puede pedir otro tenant', () => {
      expect(service.resolveRequestedTenant(session(1), TENANT_B)).toBe(
        TENANT_B,
      );
    });
  });

  describe('scopeFor', () => {
    it('usuario normal: su tenant', () => {
      expect(service.scopeFor(session(4))).toBe(TENANT_A);
    });

    it('superusuario: sin filtro', () => {
      expect(service.scopeFor(session(1))).toBeNull();
    });
  });

  describe('assertOwns', () => {
    it('pasa si hay fila para el tenant de la sesion', async () => {
      query.mockResolvedValue({ rows: [{ ok: 1 }] });
      await expect(
        service.assertOwns('customer', 'c1', session(4)),
      ).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledWith(expect.any(String), ['c1', TENANT_A]);
    });

    it('404 si el recurso es de otro tenant', async () => {
      query.mockResolvedValue({ rows: [] });
      await expect(
        service.assertOwns('branch', 'b1', session(4)),
      ).rejects.toThrow(NotFoundException);
    });

    it('el superusuario no consulta pertenencia', async () => {
      await service.assertOwns('branch', 'b1', session(1));
      expect(query).not.toHaveBeenCalled();
    });
  });
});
