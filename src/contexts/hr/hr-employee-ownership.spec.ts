/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { LEVELS_KEY } from '@/common/decorators/level_metadata.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { SeveranceDepositService } from './modules/severance/severance-deposit.service';
import { SeveranceInterestService } from './modules/severance/severance-interest.service';
import { SeveranceAdvanceService } from './modules/severance/severance-advance.service';
import { DeductionsService } from './modules/deductions/deductions.service';
import { ProfitSharingService } from './modules/profit-sharing/profit-sharing.service';
import { JourneyService } from './modules/journey/journey.service';
import { DutiesTypeController } from './modules/duties-type/duties-type.controller';
import { ProductCategoryController } from '@/contexts/general/modules/product_category/product-category.controller';

/**
 * Aislamiento entre tenants en rutas que reciben employeeId, contractId o
 * dutiesTypeId: el tenant A pide un recurso del tenant B y debe recibir 404
 * SIN que se consulte ningun dato del recurso ajeno.
 */
const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';
const OWN = 'own-employee';
const FOREIGN = 'foreign-employee';

const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
const calls: string[] = [];

// Responde solo a la busqueda de pertenencia; cualquier otra consulta queda
// registrada en `calls` para poder afirmar que no se ejecuto.
const db: any = {
  query: jest.fn((q: any, params: any[]) => {
    const sql = toSql(q);
    if (sql.includes('FROM hr_schema.employee e')) {
      const tenant = params[0] === OWN ? TENANT_A : TENANT_B;
      return Promise.resolve({
        rows: [
          {
            employee_id: params[0],
            tenant_id: tenant,
            hire_date: '2024-01-01',
            journey_type: 'diurna',
            weekly_hours: '40',
          },
        ],
      });
    }
    if (sql.includes('FROM hr_schema.contract')) {
      return Promise.resolve({
        rows: [
          {
            contract_id: params[0],
            tenant_id: params[0] === 'own-contract' ? TENANT_A : TENANT_B,
            journey_type: 'diurna',
            weekly_hours: 40,
          },
        ],
      });
    }
    calls.push(sql);
    return Promise.resolve({ rows: [{ total: '0' }] });
  }),
};

const stub = (): any => new Proxy({}, { get: () => jest.fn() });
const deposits = new SeveranceDepositService(db, stub(), stub());
const interest = new SeveranceInterestService(db, stub(), deposits);
const advances = new SeveranceAdvanceService(db, stub(), deposits, interest);
const deductions = new DeductionsService(db, stub());
const profitSharing = new ProfitSharingService(db, stub(), stub());
const journey = new JourneyService(db, stub());

beforeEach(() => {
  calls.length = 0;
});

const notFound = async (p: Promise<unknown>) => {
  await expect(p).rejects.toBeInstanceOf(NotFoundException);
  expect(calls).toEqual([]);
};

describe('Prestaciones sociales: employeeId de otro tenant responde 404', () => {
  it('intereses: listar y liquidar', async () => {
    await notFound(
      interest.listByEmployee(TENANT_A, FOREIGN, '2024-01-01', '2024-12-31'),
    );
    await notFound(
      interest.settle(TENANT_A, {
        employee_id: FOREIGN,
        year: 2024,
        capitalize: true,
      }),
    );
  });

  it('anticipos: listar, disponible, crear y resumen de saldo', async () => {
    await notFound(advances.listByEmployee(TENANT_A, FOREIGN));
    await notFound(advances.available(TENANT_A, FOREIGN, '2024-06-01'));
    await notFound(
      advances.create(TENANT_A, {
        employee_id: FOREIGN,
        requested_amount: 100,
        reason: 'vivienda',
      } as any),
    );
    await notFound(advances.summary(TENANT_A, FOREIGN));
  });

  it('el empleado propio sigue funcionando', async () => {
    await expect(advances.listByEmployee(TENANT_A, OWN)).resolves.toEqual([
      { total: '0' },
    ]);
    await expect(
      interest.listByEmployee(TENANT_A, OWN, '2024-01-01', '2024-12-31'),
    ).resolves.toBeDefined();
  });
});

describe('Descuentos: employeeId de otro tenant responde 404', () => {
  it('listar, margen disponible y crear', async () => {
    await notFound(deductions.listByEmployee(TENANT_A, FOREIGN));
    await notFound(deductions.availableMargin(TENANT_A, FOREIGN, '2024-06-01'));
    await notFound(
      deductions.create(TENANT_A, {
        employee_id: FOREIGN,
        kind: 'alimentaria',
        description: 'x',
        total_amount: 10,
        start_date: '2024-06-01',
      } as any),
    );
  });

  it('compensacion en liquidacion: el empleado debe ser el de la liquidacion', async () => {
    const original = db.query.getMockImplementation();
    db.query.mockImplementationOnce(() =>
      Promise.resolve({
        rows: [
          {
            tenant_id: TENANT_A,
            employee_id: OWN,
            subtotal: '100',
            total: '100',
          },
        ],
      }),
    );
    await notFound(
      deductions.settlementCompensation(TENANT_A, FOREIGN, 'settlement-1'),
    );
    db.query.mockImplementation(original);
  });

  it('el empleado propio sigue funcionando', async () => {
    await expect(deductions.listByEmployee(TENANT_A, OWN)).resolves.toEqual([
      { total: '0' },
    ]);
  });
});

describe('Bono de fin de anio: employeeId de otro tenant responde 404', () => {
  it('vista previa y pago', async () => {
    await notFound(profitSharing.yearEndBonusPreview(TENANT_A, FOREIGN, 2024));
    await notFound(
      profitSharing.payYearEndBonus(TENANT_A, {
        fiscal_year: 2024,
        employee_id: FOREIGN,
        amount: 100,
        paid_at: '2024-12-15',
      }),
    );
  });
});

describe('Jornada: contrato de otro tenant responde 404', () => {
  it('limites por contrato', async () => {
    await expect(
      journey.getLimitsByContract(TENANT_A, 'foreign-contract'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      journey.getLimitsByContract(TENANT_A, 'own-contract'),
    ).resolves.toMatchObject({ contractId: 'own-contract' });
  });
});

describe('Tipos de cargo: crear, editar y borrar solo en el tenant propio', () => {
  const session = (role_id: number): IUserSession => ({
    user_id: 'user-A',
    email: 'u@test.com',
    tenant_id: TENANT_A,
    role_id,
  });
  const roles: Record<number, any> = {
    1: { role_name: 'superuser', role_hierarchy: 4 },
    2: { role_name: 'admin', role_hierarchy: 3 },
  };
  // Los ids de tipo de cargo propios son 1 y 2; el resto es de otro tenant.
  const scopeDb: any = {
    query: jest.fn((_q: any, params: any[]) =>
      Promise.resolve({ rows: [1, 2].includes(params[0]) ? [{ ok: 1 }] : [] }),
    ),
  };
  const tenantScope = new TenantScopeService(scopeDb, {
    getRole: (id: number) => roles[id],
  } as any);
  const service: any = {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  };
  const controller = new DutiesTypeController(service, tenantScope);

  beforeEach(() => jest.clearAllMocks());

  it('crear con el tenant_id de otro tenant responde 404', async () => {
    await expect(
      controller.create({ tenant_id: TENANT_B, name: 'Cajero' }, session(2)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('crear sin tenant_id usa el de la sesion', async () => {
    await controller.create({ name: 'Cajero' }, session(2));
    expect(service.create).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  it('el superusuario puede crear en otro tenant', async () => {
    await controller.create(
      { tenant_id: TENANT_B, name: 'Cajero' },
      session(1),
    );
    expect(service.create).toHaveBeenCalledWith(TENANT_B, expect.anything());
  });

  it('editar y borrar un tipo de cargo ajeno responde 404', async () => {
    await expect(
      controller.update(99, { name: 'x' }, session(2)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.remove(99, session(2))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.update).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('editar y borrar el propio funciona', async () => {
    await controller.update(1, { name: 'x' }, session(2));
    await controller.remove(2, session(2));
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledTimes(1);
  });

  it('crear, editar y borrar exigen nivel manager o superior', () => {
    for (const m of ['create', 'update', 'remove'] as const) {
      expect(
        Reflect.getMetadata(LEVELS_KEY, DutiesTypeController.prototype[m]),
      ).toBe(2);
    }
  });
});

describe('Categorias de producto: catalogo global solo editable por superusuario', () => {
  it('crear, editar y borrar exigen nivel 4; leer no exige nivel', () => {
    const proto = ProductCategoryController.prototype;
    for (const m of [
      'createCategory',
      'updateCategory',
      'deleteCategory',
    ] as const) {
      expect(Reflect.getMetadata(LEVELS_KEY, proto[m])).toBe(4);
    }
    expect(Reflect.getMetadata(LEVELS_KEY, proto.getAll)).toBeUndefined();
  });
});
