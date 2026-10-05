import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { ROLES_KEY } from '@/common/decorators/role_metadata.decorator';
import { InvoiceNotFound } from '@/common/errors/invoice_not_found.error';
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

/* eslint-disable @typescript-eslint/unbound-method */
describe('Invoice - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const service = new InvoiceService(db);
  const controller = new InvoiceController(service, tenantScope);

  beforeEach(() => query.mockReset());

  it('el controller exige AuthenticationGuard a nivel de clase', () => {
    const guards: unknown[] = Reflect.getMetadata(
      GUARDS_METADATA,
      InvoiceController,
    );
    expect(guards).toContain(AuthenticationGuard);
  });

  it('borrar una factura exige rol admin o superuser', () => {
    const required = Reflect.getMetadata(
      ROLES_KEY,
      InvoiceController.prototype.deleteInvoice,
    );
    expect(required).toEqual(['admin', 'superuser']);
  });

  it('factura por venta: el query recibe el tenant de la sesion', async () => {
    query.mockResolvedValue({ rows: [{ invoice_id: 'i1' }] });
    await controller.getInvoiceBySaleId(session(3), 'sale-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('b.tenant_id = $2');
    expect(params).toEqual(['sale-1', TENANT_A]);
  });

  it('factura por venta de otro tenant: sin filas, devuelve null', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.getInvoiceBySaleId(session(3), 'sale-de-B'),
    ).resolves.toBeNull();
  });

  it('el superusuario consulta sin filtro de tenant', async () => {
    query.mockResolvedValue({ rows: [{ invoice_id: 'i1' }] });
    await controller.getInvoiceBySaleId(session(1), 'sale-1');
    expect(query.mock.calls[0][1]).toEqual(['sale-1', null]);
  });

  it('detalle de factura ajena: 404', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.getInvoiceById(session(3), 'sale-de-B'),
    ).rejects.toThrow(InvoiceNotFound);
    expect(query.mock.calls[0][1]).toEqual(['sale-de-B', TENANT_A]);
  });

  it('listar facturas de otro tenant por URL: 404 sin consultar', async () => {
    await expect(
      controller.getTenantInvoices(session(3), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('facturas por documento: tenant pedido distinto al de la sesion, 404', async () => {
    await expect(
      controller.getCustomerInvoices(session(3), TENANT_B, '123'),
    ).rejects.toThrow(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('borrar factura ajena: 404 y el DELETE lleva el tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      controller.deleteInvoice(session(3), 'inv-de-B'),
    ).rejects.toThrow(InvoiceNotFound);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM pos_schema.invoice');
    expect(sql).toContain('b.tenant_id = $2');
    expect(params).toEqual(['inv-de-B', TENANT_A]);
  });
});
