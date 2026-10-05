import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { SaleItemController } from './sale-item.controller';
import { SaleItemService } from './sale-item.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { ROLES_KEY } from '@/common/decorators/role_metadata.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';

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

/* eslint-disable @typescript-eslint/unbound-method */
describe('SaleItem - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new SaleItemController(
    new SaleItemService(db),
    tenantScope,
  );

  beforeEach(() => query.mockReset());

  it('exige AuthenticationGuard a nivel de clase', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SaleItemController)).toContain(
      AuthenticationGuard,
    );
  });

  it('ya no expone la insercion masiva por POST', () => {
    const proto = SaleItemController.prototype as any;
    const verbs = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .map((n) => Reflect.getMetadata(METHOD_METADATA, proto[n]));
    // RequestMethod.POST === 1
    expect(verbs).not.toContain(1);
  });

  it('borrar una linea exige admin o superuser', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, SaleItemController.prototype.deleteItem),
    ).toEqual(['admin', 'superuser']);
  });

  it('lineas de una venta: el query lleva el tenant de la sesion', async () => {
    query.mockResolvedValue({ rows: [] });
    await controller.getItems(session(3), 'sale-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('si.tenant_id = $2');
    expect(params).toEqual(['sale-1', TENANT_A]);
  });

  it('linea de otro tenant: 404', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(controller.getItem(session(3), 'item-de-B')).rejects.toThrow(
      NotFoundException,
    );
    expect(query.mock.calls[0][1]).toEqual(['item-de-B', TENANT_A]);
  });

  it('borrar linea ajena: 404 y el DELETE lleva el tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.deleteItem(session(3), 'item-de-B'),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM pos_schema.sale_item');
    expect(sql).toContain('tenant_id = $2');
    expect(params).toEqual(['item-de-B', TENANT_A]);
  });

  it('el superusuario opera sin filtro de tenant', async () => {
    query.mockResolvedValue({ rows: [{ sale_item_id: 'x' }] });
    await controller.deleteItem(session(1), 'x');
    expect(query.mock.calls[0][1]).toEqual(['x', null]);
  });
});
