/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SaleService } from './sale.service';
import { SaleController } from './sale.controller';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { PAGINATE_METADATA_KEY } from '@/common/decorators/paginator.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const CUSTOMER_A = 'ca000000-0000-4000-8000-000000000001';
const USER_A = 'ea000000-0000-4000-8000-000000000001';

const session: IUserSession = {
  user_id: USER_A,
  email: 'u@test.com',
  tenant_id: TENANT_A,
  role_id: 3,
};

// Todo lo "-A" es del tenant A; lo demas es de otra empresa.
const OWNED: Record<string, Set<string>> = {
  branch: new Set(['branch-A']),
  cashRegister: new Set(['reg-A']),
  cashRegisterSession: new Set(['ses-A']),
  user: new Set(['seller-A']),
  promotion: new Set(['promo-A']),
  royaltyRule: new Set(['rule-A']),
  royaltyOption: new Set(['opt-A']),
};

describe('Sale - aislamiento por tenant', () => {
  const query = jest.fn();
  const db = { query, transaction: jest.fn() } as any;
  const tenantScope = {
    assertOwnedByTenant: jest.fn(
      (resource: string, id: string, tenant: string) => {
        if (tenant !== TENANT_A || !OWNED[resource]?.has(id)) {
          return Promise.reject(new NotFoundException('Recurso no encontrado'));
        }
        return Promise.resolve();
      },
    ),
  } as unknown as TenantScopeService;

  const service = new SaleService(
    db,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    tenantScope,
  );

  const baseSale = (over: Record<string, unknown> = {}) =>
    ({
      branch_id: 'branch-A',
      currency_id: 1,
      tenant_customer_id: CUSTOMER_A,
      sale_condition: '01',
      sale_date: new Date().toISOString(),
      total_amount: 10,
      subtotal_amount: 10,
      tax_amount: 0,
      is_completed: true,
      items: [
        {
          // un tenant_id enviado por el cliente debe ser ignorado
          tenant_id: 'b0000000-0000-4000-8000-00000000000b',
          product_variant_id: 'pv-1',
          quantity: 1,
          unit_price: 10,
          total_price: 10,
        },
      ],
      payments: [
        {
          tenant_customer_id: CUSTOMER_A,
          payment_method_id: 1,
          payment_amount: 10,
        },
      ],
      ...over,
    }) as any;

  const scope = (raw: any) => (service as any).scopeSaleToSession(raw, session);

  beforeEach(() => query.mockReset());

  it('normaliza tenant de la venta y de cada linea al de la sesion', async () => {
    const out = await scope(baseSale({ tenant_id: 'otro' }));
    expect(out.tenant_id).toBe(TENANT_A);
    expect(out.items.every((i: any) => i.tenant_id === TENANT_A)).toBe(true);
  });

  it('sin vendedor usa el usuario de la sesion', async () => {
    const out = await scope(baseSale());
    expect(out.seller_user_id).toBe(USER_A);
  });

  it('vendedor de otro tenant: 404', async () => {
    await expect(
      scope(baseSale({ seller_user_id: 'seller-B' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('vendedor del mismo tenant: ok', async () => {
    const out = await scope(baseSale({ seller_user_id: 'seller-A' }));
    expect(out.seller_user_id).toBe('seller-A');
  });

  it('sucursal ajena: 404', async () => {
    await expect(scope(baseSale({ branch_id: 'branch-B' }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('caja ajena: 404', async () => {
    await expect(
      scope(baseSale({ cash_register_id: 'reg-B' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('sesion de caja ajena: 404', async () => {
    await expect(
      scope(baseSale({ cash_register_session_id: 'ses-B' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('promocion o regalia de otro tenant en una linea: 404', async () => {
    const withItem = (extra: Record<string, unknown>) =>
      baseSale({
        items: [
          {
            product_variant_id: 'pv-1',
            quantity: 1,
            unit_price: 1,
            total_price: 1,
            ...extra,
          },
        ],
      });
    await expect(scope(withItem({ promotion_id: 'promo-B' }))).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      scope(withItem({ royalty_rule_id: 'rule-B' })),
    ).rejects.toThrow(NotFoundException);
    await expect(
      scope(withItem({ royalty_option_id: 'opt-B' })),
    ).rejects.toThrow(NotFoundException);
    await expect(
      scope(withItem({ promotion_id: 'promo-A', royalty_rule_id: 'rule-A' })),
    ).resolves.toBeDefined();
  });

  it('pago a nombre de otro cliente: 400', async () => {
    await expect(
      scope(
        baseSale({
          payments: [
            { tenant_customer_id: 'cliente-de-B', payment_amount: 10 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('pago sin cliente hereda el de la venta', async () => {
    const out = await scope(
      baseSale({ payments: [{ payment_amount: 10, payment_method_id: 1 }] }),
    );
    expect(out.payments[0].tenant_customer_id).toBe(CUSTOMER_A);
  });

  it('crear venta en sucursal ajena falla ANTES de tocar la base', async () => {
    await expect(
      service.createFullSale(baseSale({ branch_id: 'branch-B' }), session),
    ).rejects.toThrow(NotFoundException);
    expect(query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('el listado paginado por sucursal filtra siempre por el tenant de la sesion', () => {
    const config = Reflect.getMetadata(
      PAGINATE_METADATA_KEY,
      SaleController.prototype.getAllSalesByBranch,
    );
    expect(config.tenantField).toBe('tenant_id');
    expect(config.table).toContain('b.tenant_id');
  });
});
