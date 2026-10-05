import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';
const SALE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SALE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ITEM_A = 'a1111111-0000-4000-8000-000000000001';
const ITEM_B = 'b1111111-0000-4000-8000-000000000002';

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

// Dos ventas, una por tenant. El mock aplica el filtro de tenant que declara
// getSaleContext (segundo parametro).
const saleCtx = (sale_id: string, tenant_id: string) => ({
  sale_id,
  tenant_id,
  tenant_customer_id: null,
  invoice_id: `inv-${sale_id}`,
  total_amount: '10',
  subtotal_amount: '10',
  tax_amount: '0',
});
const salesById: Record<string, any> = {
  [SALE_A]: saleCtx(SALE_A, TENANT_A),
  [SALE_B]: saleCtx(SALE_B, TENANT_B),
};

describe('Returns - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new ReturnsController(
    new ReturnsService(db, tenantScope),
    tenantScope,
  );

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      if (
        sql.includes('FROM pos_schema.sale s') &&
        sql.includes('inv.invoice_id')
      ) {
        const row = salesById[params[0]];
        const scope = params[1];
        const visible = row && (scope === null || row.tenant_id === scope);
        return Promise.resolve({ rows: visible ? [row] : [] });
      }
      if (sql.includes('COUNT(*)::int AS total')) {
        // lineas pedidas que pertenecen a la venta
        const [saleId, ids] = params as [string, string[]];
        const own = saleId === SALE_A ? [ITEM_A] : [ITEM_B];
        return Promise.resolve({
          rows: [{ total: ids.filter((i) => own.includes(i)).length }],
        });
      }
      return Promise.resolve({ rows: [{ return_transaction_id: 'rt1' }] });
    });
  });

  it('exige AuthenticationGuard a nivel de clase', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReturnsController)).toContain(
      AuthenticationGuard,
    );
  });

  it('contexto de reembolso de venta ajena: 404', async () => {
    await expect(
      controller.getSaleRefundContext(session(3), SALE_B),
    ).rejects.toThrow(NotFoundException);
  });

  it('contexto de reembolso de venta propia: ok', async () => {
    const res = await controller.getSaleRefundContext(session(3), SALE_A);
    expect(res.sale.sale_id).toBe(SALE_A);
  });

  it('reembolso completo de venta ajena: 404 y no escribe nada', async () => {
    await expect(
      controller.processFullRefund(session(3), SALE_B, { description: 'x' }),
    ).rejects.toThrow(NotFoundException);
    const wrote = query.mock.calls.some(([sql]) =>
      /INSERT INTO pos_schema.return_transaction|UPDATE pos_schema.sale/.test(
        sql,
      ),
    );
    expect(wrote).toBe(false);
  });

  it('reembolso parcial de venta ajena: 404', async () => {
    await expect(
      controller.createReturnTransaction(session(3), {
        sale_id: SALE_B,
        description: 'x',
        return_products: [
          { sale_item_id: ITEM_B, quantity: 1, unit_price: 10 },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('reembolso parcial con lineas de otra venta: 400 y no escribe', async () => {
    await expect(
      controller.createReturnTransaction(session(3), {
        sale_id: SALE_A,
        description: 'x',
        return_products: [
          { sale_item_id: ITEM_B, quantity: 1, unit_price: 10 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    const wrote = query.mock.calls.some(([sql]) =>
      /INSERT INTO pos_schema.return/.test(sql),
    );
    expect(wrote).toBe(false);
  });

  it('listado de devoluciones: el query lleva el tenant de la sesion', async () => {
    query.mockResolvedValue({ rows: [] });
    await controller.findReturns(session(3), {});
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('b.tenant_id = $7');
    expect(params[6]).toBe(TENANT_A);
  });

  it('el superusuario lista sin filtro de tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    await controller.findReturns(session(1), {});
    expect(query.mock.calls[0][1][6]).toBeNull();
  });

  it('detalle de devolucion ajena: 404 y no lee los productos', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.getReturnDetail(session(3), 'rt-de-B'),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['rt-de-B', TENANT_A]);
  });
});
