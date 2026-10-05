import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';
const TENANT_C = 'c0000000-0000-4000-8000-000000000003';

// El MISMO documento existe en dos empresas. El mock aplica el filtro de
// tenant que declaran los queries (segundo parametro de getInfo).
const rowsByTenant: Record<string, any> = {
  [TENANT_A]: {
    customer_id: 'ca',
    tenant_id: TENANT_A,
    document_number: '123',
  },
  [TENANT_B]: {
    customer_id: 'cb',
    tenant_id: TENANT_B,
    document_number: '123',
  },
};

describe('CustomerService - aislamiento por tenant', () => {
  const query = jest.fn();
  // createQueries entrega objetos { sql }; las consultas dinamicas, strings.
  const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
  const service = new CustomerService({
    query: (q: any, params: any[]) => query(toSql(q), params),
  } as any);

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('WHERE tc.document_number = $1')) {
        const row = rowsByTenant[params[1]];
        return Promise.resolve({ rows: row ? [row] : [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('la busqueda por documento devuelve solo el cliente del tenant propio', async () => {
    const a = await service.findCustomerByDocumentId('123', TENANT_A);
    expect((a as any).customer_id).toBe('ca');
    const b = await service.findCustomerByDocumentId('123', TENANT_B);
    expect((b as any).customer_id).toBe('cb');
  });

  it('un documento de otra empresa responde 404 en un tercer tenant', async () => {
    await expect(
      service.findCustomerByDocumentId('123', TENANT_C),
    ).rejects.toThrow(NotFoundException);
  });

  it('la consulta por documento siempre lleva el tenant', async () => {
    await service.findCustomerByDocumentId('123', TENANT_A);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tc.tenant_id = $2');
    expect(params).toEqual(['123', TENANT_A]);
  });

  it('findCustomerById pasa el tenant de alcance (null = superusuario)', async () => {
    query.mockResolvedValueOnce({ rows: [{ customer_id: 'ca' }] });
    await service.findCustomerById('ca', TENANT_A);
    expect(query.mock.calls[0][1]).toEqual(['ca', TENANT_A]);

    query.mockResolvedValueOnce({ rows: [{ customer_id: 'ca' }] });
    await service.findCustomerById('ca', null);
    expect(query.mock.calls[1][1]).toEqual(['ca', null]);
  });

  it('cliente de otro tenant por id: 404', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.findCustomerById('cb', TENANT_A)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete de cliente ajeno: 404 y el DELETE lleva el tenant', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.deleteCustomer('cb', TENANT_A)).rejects.toThrow(
      NotFoundException,
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_id = $2');
    expect(params).toEqual(['cb', TENANT_A]);
  });

  it('update de cliente ajeno: el UPDATE lleva el tenant y responde 404', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.updateCustomer('cb', { phone: '0414' } as any, TENANT_A),
    ).rejects.toThrow(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('UPDATE general_schema.tenant_customer');
    expect(sql).toMatch(/tenant_id = \$\d+/);
    expect(params[params.length - 1]).toBe(TENANT_A);
  });

  it('historial de ventas de cliente ajeno: 404 antes de consultar ventas', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.getCustomerSalesHistory('cb', TENANT_A),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('createCustomer usa el tenant de la sesion', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: sql.includes('ident_code')
          ? [{ ident_code: 'V' }]
          : [{ customer_id: 'new' }],
      }),
    );
    await service.createCustomer(TENANT_A, {
      first_name: 'Ana',
      last_name: 'Perez',
      document_type_id: 1,
      document_number: '999',
      address: 'Calle 1',
    } as any);
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO general_schema.tenant_customer'),
    );
    expect(insert![1][0]).toBe(TENANT_A);
  });
});
