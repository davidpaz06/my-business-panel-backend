import { NotFoundException } from '@nestjs/common';
import { PosRoyaltyController } from './pos-royalty.controller';
import { PosRoyaltyService } from './pos-royalty.service';
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

// id -> tabla de pertenencia; todo "-A" es del tenant A.
const OWN: Array<[RegExp, Set<string>]> = [
  [/FROM pos_schema\.royalty_rule\b/, new Set(['rule-A'])],
  [/FROM pos_schema\.royalty_option\b/, new Set(['opt-A'])],
  [/FROM general_schema\.tenant_product_group_type/, new Set(['type-A'])],
  [/FROM general_schema\.tenant_product_group\b/, new Set(['group-A'])],
  [/FROM general_schema\.branch/, new Set(['branch-A'])],
];

describe('PosRoyalty - aislamiento por tenant', () => {
  const query = jest.fn();
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const db = {
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any;
  const tenantScope = new TenantScopeService(db, {
    getRole: (id: number) => roles[id],
  } as any);
  const controller = new PosRoyaltyController(
    new PosRoyaltyService(db),
    tenantScope,
  );

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('SELECT 1 FROM')) {
        const match = OWN.find(([re]) => re.test(sql));
        return Promise.resolve({
          rows: match && match[1].has(params[0]) ? [{ ok: 1 }] : [],
        });
      }
      return Promise.resolve({ rows: [{ royalty_rule_id: 'rule-A' }] });
    });
  });

  const wrote = () =>
    query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(sql));

  it('listar reglas de otro tenant por URL: 404 sin consultar', () => {
    expect(() => controller.listRules(session(3), TENANT_B)).toThrow(
      NotFoundException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('crear regla usa el tenant de la sesion', async () => {
    await controller.createRule(session(3), { min_amount: 10 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO pos_schema.royalty_rule');
    expect(params[0]).toBe(TENANT_A);
  });

  it('detalle, edicion y borrado de regla ajena: 404 y no escribe', async () => {
    await expect(controller.getRule(session(3), 'rule-B')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      controller.updateRule(session(3), 'rule-B', { min_amount: 5 }),
    ).rejects.toThrow(NotFoundException);
    await expect(controller.deleteRule(session(3), 'rule-B')).rejects.toThrow(
      NotFoundException,
    );
    expect(wrote()).toBe(false);
  });

  it('dimensiones con tipo de agrupacion ajeno: 404 y no escribe', async () => {
    await expect(
      controller.setRuleDimensions(session(3), 'rule-A', {
        tenant_product_group_type_ids: ['type-A', 'type-B'],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(wrote()).toBe(false);
  });

  it('crear opcion en regla ajena o con grupo ajeno: 404 y no escribe', async () => {
    await expect(
      controller.createOption(session(3), {
        royalty_rule_id: 'rule-B',
        tenant_product_group_id: 'group-A',
        quantity: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.createOption(session(3), {
        royalty_rule_id: 'rule-A',
        tenant_product_group_id: 'group-B',
        quantity: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(wrote()).toBe(false);
  });

  it('editar y borrar opcion ajena: 404 y no escribe', async () => {
    await expect(
      controller.updateOption(session(3), 'opt-B', { quantity: 2 }),
    ).rejects.toThrow(NotFoundException);
    await expect(controller.deleteOption(session(3), 'opt-B')).rejects.toThrow(
      NotFoundException,
    );
    expect(wrote()).toBe(false);
  });

  it('productos regalables de un grupo ajeno: 404 sin consultar productos', async () => {
    await expect(
      controller.getGiftableProducts(session(3), 'group-B'),
    ).rejects.toThrow(NotFoundException);
    expect(
      query.mock.calls.some(([sql]) => sql.includes('WITH RECURSIVE')),
    ).toBe(false);
  });

  it('reglas aplicables de otro tenant: 404', () => {
    expect(() =>
      controller.getApplicableRules(session(3), TENANT_B, '100'),
    ).toThrow(NotFoundException);
  });

  it('analiticas de otro tenant: 404; con sucursal ajena propia: 404', async () => {
    await expect(
      controller.getRoyaltyAnalytics(session(3), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getRoyaltyAnalytics(session(3), TENANT_A, '30d', 'branch-B'),
    ).rejects.toThrow(NotFoundException);
  });

  it('operaciones sobre recursos propios si llegan al servicio', async () => {
    await controller.deleteRule(session(3), 'rule-A');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('DELETE FROM pos_schema.royalty_rule'),
      ),
    ).toBe(true);
  });
});
