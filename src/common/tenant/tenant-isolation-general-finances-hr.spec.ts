/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { TenantScopeService } from './tenant-scope.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { ROLES_KEY } from '@/common/decorators/role_metadata.decorator';
import { TenantController } from '@/contexts/general/modules/tenant/tenant.controller';
import { CustomerSegmentMarginController } from '@/contexts/general/modules/customer_segment_margin/customer_segment_margin.controller';
import { CustomerPaymentController } from '@/contexts/general/modules/customer_payment/customer-payment.controller';
import { ProductController } from '@/contexts/general/modules/product/product.controller';
import { BranchController } from '@/contexts/general/modules/branch/branch.controller';
import { SegmentController } from '@/contexts/general/modules/segment/segment.controller';
import { SubscriptionController } from '@/contexts/general/modules/subscription/subscription.controller';
import { ExpenseController } from '@/contexts/finances/modules/expense/expense.controller';
import { IvaController } from '@/contexts/finances/modules/iva/iva.controller';
import { ConceptController } from '@/contexts/hr/modules/concept/concept.controller';
import { EmployeeController } from '@/contexts/hr/modules/employee/employee.controller';
import { TurnsController } from '@/contexts/hr/modules/turns/turns.controller';
import { FoulController } from '@/contexts/hr/modules/foul/foul.controller';
import { ClockingController } from '@/contexts/hr/modules/clocking/clocking.controller';
import { PaysheetController } from '@/contexts/hr/modules/paysheet/paysheet.controller';
import { PayrollMovementsController } from '@/contexts/hr/modules/payroll_movements/payroll-movements.controller';
import { PaymentAlertsService } from '@/contexts/purchase/modules/payment_alerts/payment-alerts.service';

const TENANT_A = 'a0000000-0000-4000-8000-000000000001';
const TENANT_B = 'b0000000-0000-4000-8000-000000000002';

// role_hierarchy: superuser 4, admin 3, manager 2, employee 1 (seeds/catalog/general/005)
const roles: Record<number, { role_name: string; role_hierarchy: number }> = {
  1: { role_name: 'superuser', role_hierarchy: 4 },
  2: { role_name: 'admin', role_hierarchy: 3 },
  4: { role_name: 'employee', role_hierarchy: 1 },
};
const session = (role_id: number): IUserSession => ({
  user_id: 'user-A',
  email: 'u@test.com',
  tenant_id: TENANT_A,
  role_id,
});
const SUPER = 1;
const ADMIN = 2;
const EMPLOYEE = 4;

// Un id "own-..." pertenece al tenant A; cualquier otro es de otro tenant.
const query = jest.fn();
const toSql = (q: any): string => (typeof q === 'string' ? q : q.sql);
const db = {
  query: (q: any, params: any[]) => query(toSql(q), params),
} as any;
const tenantScope = new TenantScopeService(db, {
  getRole: (id: number) => roles[id],
} as any);

const spies = () => new Proxy({}, { get: (t: any, k) => (t[k] ??= jest.fn()) });

const rolesOf = (proto: object, method: string): string[] | undefined =>
  Reflect.getMetadata(ROLES_KEY, (proto as any)[method]);

beforeEach(() => {
  query.mockReset();
  query.mockImplementation((sql: string, params: any[]) => {
    if (sql.includes('SELECT 1 FROM')) {
      return Promise.resolve({
        rows: String(params[0]).startsWith('own-') ? [{ ok: 1 }] : [],
      });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe('Tenant: solo plataforma lista/borra; el admin edita lo suyo', () => {
  const tenantService: any = spies();
  const userService: any = spies();
  const controller = new TenantController(
    tenantService,
    userService,
    tenantScope,
  );

  it('listar todos y borrar exigen superusuario', () => {
    expect(rolesOf(TenantController.prototype, 'getAllTenants')).toEqual([
      'superuser',
    ]);
    expect(rolesOf(TenantController.prototype, 'deleteTenant')).toEqual([
      'superuser',
    ]);
    expect(rolesOf(TenantController.prototype, 'createBareTenant')).toEqual([
      'superuser',
    ]);
  });

  it('un tenant ajeno responde 404 en detalle y usuarios', async () => {
    await expect(
      controller.getSingleTenant(session(ADMIN), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getUsersByTenant(session(ADMIN), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    expect(tenantService.getTenantById).not.toHaveBeenCalled();
    expect(userService.getUsersByTenant).not.toHaveBeenCalled();
  });

  it('el tenant propio y el superusuario si pasan', async () => {
    await controller.getSingleTenant(session(ADMIN), TENANT_A);
    expect(tenantService.getTenantById).toHaveBeenCalledWith(TENANT_A);
    await controller.getSingleTenant(session(SUPER), TENANT_B);
    expect(tenantService.getTenantById).toHaveBeenLastCalledWith(TENANT_B);
  });

  it('editar tenant ajeno: 404; el admin no toca suscripcion ni region', async () => {
    await expect(
      controller.updateTenant(session(ADMIN), TENANT_B, {
        tenant_name: 'x',
      } as any),
    ).rejects.toThrow(NotFoundException);

    await controller.updateTenant(session(ADMIN), TENANT_A, {
      tenant_name: 'Nueva',
      is_subscribed: true,
      region_id: 9,
    } as any);
    expect(tenantService.updateTenant).toHaveBeenCalledWith(TENANT_A, {
      tenant_name: 'Nueva',
    });

    await controller.updateTenant(session(SUPER), TENANT_B, {
      is_subscribed: false,
    } as any);
    expect(tenantService.updateTenant).toHaveBeenLastCalledWith(TENANT_B, {
      is_subscribed: false,
    });
  });

  it('el alta publica exige el flujo de onboarding completo', async () => {
    await expect(
      controller.createTenant({ tenant_name: 'x' } as any, {} as any),
    ).rejects.toThrow(BadRequestException);
    expect(tenantService.createTenant).not.toHaveBeenCalled();
  });
});

describe('Catalogos globales y suscripcion', () => {
  it('crear/borrar segmentos y borrar tipos de documento: solo superusuario', () => {
    expect(rolesOf(SegmentController.prototype, 'newSegment')).toEqual([
      'superuser',
    ]);
    expect(rolesOf(SegmentController.prototype, 'deleteSegment')).toEqual([
      'superuser',
    ]);
  });

  it('cobrar una suscripcion exige admin y valida el tenant', async () => {
    expect(
      rolesOf(SubscriptionController.prototype, 'createSubscription'),
    ).toEqual(['superuser', 'admin']);
    const svc: any = spies();
    const controller = new SubscriptionController(svc, tenantScope);
    await expect(
      controller.createSubscription(session(ADMIN), {
        tenant_id: TENANT_B,
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(svc.createSubscription).not.toHaveBeenCalled();
  });
});

describe('Margenes por segmento', () => {
  const svc: any = spies();
  const controller = new CustomerSegmentMarginController(svc, tenantScope);

  it('el listado global es de superusuario', () => {
    expect(
      rolesOf(CustomerSegmentMarginController.prototype, 'getMarginsInfo'),
    ).toEqual(['superuser']);
  });

  it('margenes de otro tenant por URL, body o id: 404 sin escribir', async () => {
    await expect(
      controller.getMarginsByTenant(session(ADMIN), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.createNewMargin(session(ADMIN), {
        tenant_id: TENANT_B,
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.updateMargin(session(ADMIN), 'foreign-1', {} as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.deleteMargin(session(ADMIN), 'foreign-1'),
    ).rejects.toThrow(NotFoundException);
    expect(svc.createMargins).not.toHaveBeenCalled();
    expect(svc.updateMargins).not.toHaveBeenCalled();
    expect(svc.deleteMargin).not.toHaveBeenCalled();
  });

  it('editar un margen propio no puede reasignar el tenant', async () => {
    const body: any = { spending_threshold: 5, tenant_id: TENANT_B };
    await controller.updateMargin(session(ADMIN), 'own-1', body);
    expect(svc.updateMargins).toHaveBeenCalledWith('own-1', {
      spending_threshold: 5,
    });
  });
});

describe('Pagos de clientes', () => {
  const svc: any = spies();
  const controller = new CustomerPaymentController(svc, tenantScope);

  it('el listado se filtra por el tenant de la sesion (null = plataforma)', async () => {
    await controller.getAllPayments(session(EMPLOYEE));
    expect(svc.getEveryPayment).toHaveBeenLastCalledWith(TENANT_A);
    await controller.getAllPayments(session(SUPER));
    expect(svc.getEveryPayment).toHaveBeenLastCalledWith(null);
  });

  it('crear, borrar o listar con venta, cliente o pago ajeno: 404', async () => {
    await expect(
      controller.newPayment(session(EMPLOYEE), {
        sale_id: 'foreign-sale',
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.newPayment(session(EMPLOYEE), {
        sale_id: 'own-sale',
        tenant_customer_id: 'foreign-customer',
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.bulkInsert(session(EMPLOYEE), {
        sale_id: 'own-sale',
        payments: [{ tenant_customer_id: 'foreign-customer' }],
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.deleteCustomerPayment(session(EMPLOYEE), 'foreign-pay'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getCustomerPayments(session(EMPLOYEE), 'foreign-customer'),
    ).rejects.toThrow(NotFoundException);
    expect(svc.createCustomerPayment).not.toHaveBeenCalled();
    expect(svc.bulkInsert).not.toHaveBeenCalled();
    expect(svc.deleteCustomerPayment).not.toHaveBeenCalled();
  });
});

describe('Productos', () => {
  const svc: any = spies();
  const controller = new ProductController(svc, tenantScope);

  it('el listado global es de superusuario', () => {
    expect(
      rolesOf(ProductController.prototype, 'getAllProductsGlobal'),
    ).toEqual(['superuser']);
  });

  it('el SKU solo se busca dentro del tenant de la sesion', async () => {
    await controller.getProductBySku(session(EMPLOYEE), 'SKU-1');
    expect(svc.getProductBySku).toHaveBeenLastCalledWith('SKU-1', TENANT_A);
    await controller.getProductBySku(session(SUPER), 'SKU-1');
    expect(svc.getProductBySku).toHaveBeenLastCalledWith('SKU-1', null);
  });

  it('listar productos de otro tenant por URL: 404', async () => {
    await expect(
      controller.getAllProductsByTenant(session(EMPLOYEE), TENANT_B),
    ).rejects.toThrow(NotFoundException);
  });

  it('editar o borrar un producto ajeno: 404 sin escribir', async () => {
    await expect(
      controller.updateProduct(session(ADMIN), 'foreign-pv', {} as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.deleteProduct(session(ADMIN), 'foreign-pv'),
    ).rejects.toThrow(NotFoundException);
    expect(svc.updateProduct).not.toHaveBeenCalled();
    expect(svc.deleteProduct).not.toHaveBeenCalled();
  });

  it('crear productos en un tenant ajeno: 404; los propios usan la sesion', async () => {
    await expect(
      controller.createNewProduct(session(ADMIN), {
        products: [{ tenant_id: TENANT_B, sku: 'x' }],
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(svc.createProduct).not.toHaveBeenCalled();
  });
});

describe('Sucursales', () => {
  const svc: any = spies();
  const controller = new BranchController(svc, tenantScope);

  it('un employee ya no ve las sucursales de todas las empresas', async () => {
    await controller.findAll(session(EMPLOYEE));
    expect(svc.findAllGlobal).not.toHaveBeenCalled();
    expect(svc.findByTenantPaginated).toHaveBeenLastCalledWith(
      TENANT_A,
      1,
      100,
    );
    await controller.findAll(session(SUPER));
    expect(svc.findAllGlobal).toHaveBeenCalled();
  });

  it('una sucursal, o la lista de un tenant, ajenas: 404', async () => {
    await expect(
      controller.findById(session(ADMIN), 'foreign-branch'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.findByTenant(session(ADMIN), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.deleteBranch(session(ADMIN), 'foreign-branch'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.updateBranch(session(ADMIN), 'foreign-branch', {} as any),
    ).rejects.toThrow(NotFoundException);
    expect(svc.deleteBranch).not.toHaveBeenCalled();
    expect(svc.updateBranch).not.toHaveBeenCalled();
  });

  it('un admin no crea sucursales en otro tenant; el tenant_id no se reasigna', async () => {
    await expect(
      controller.createBranch({ tenant_id: TENANT_B } as any, session(ADMIN)),
    ).rejects.toThrow(NotFoundException);
    const body: any = { branch_name: 'x', tenant_id: TENANT_B };
    await controller.updateBranch(session(ADMIN), 'own-branch', body);
    expect(svc.updateBranch).toHaveBeenCalledWith('own-branch', {
      branch_name: 'x',
    });
  });
});

describe('Finanzas: gastos e IVA', () => {
  const svc: any = spies();
  const controller = new ExpenseController(svc, tenantScope);

  it('toda ruta :tenantId de otro tenant responde 404 sin consultar', () => {
    const calls: Array<() => unknown> = [
      () => controller.getCategoriesByTenant(session(ADMIN), TENANT_B),
      () => controller.provisionCategories(session(ADMIN), TENANT_B),
      () => controller.getExpensesByTenant(session(ADMIN), TENANT_B),
      () => controller.getFiscalPeriods(session(ADMIN), TENANT_B),
      () =>
        controller.closeFiscalPeriod(session(ADMIN), 'period-1', TENANT_B),
      () =>
        controller.getAnalyticsFixedVsVariable(
          session(ADMIN),
          TENANT_B,
          '2026-01-01',
          '2026-02-01',
        ),
    ];
    for (const call of calls) expect(call).toThrow(NotFoundException);
    expect(Object.keys(svc)).toEqual([]);
  });

  it('crear gasto/categoria/periodo con tenant ajeno en el body: 404', async () => {
    await expect(
      controller.createExpense(session(ADMIN), {
        tenant_id: TENANT_B,
        branch_id: 'own-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(() =>
      controller.createCategory(session(ADMIN), { tenant_id: TENANT_B } as any),
    ).toThrow(NotFoundException);
    expect(() =>
      controller.createFiscalPeriod(session(ADMIN), {
        tenant_id: TENANT_B,
      } as any),
    ).toThrow(NotFoundException);
    expect(svc.createExpense).not.toHaveBeenCalled();
  });

  it('un gasto con sucursal ajena se rechaza y el autor es el de la sesion', async () => {
    await expect(
      controller.createExpense(session(ADMIN), {
        tenant_id: TENANT_A,
        branch_id: 'foreign-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);

    const data: any = {
      tenant_id: TENANT_A,
      branch_id: 'own-branch',
      created_by: 'someone-else',
    };
    await controller.createExpense(session(ADMIN), data);
    expect(svc.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'user-A' }),
    );
  });

  it('el resumen de IVA de otro tenant responde 404', () => {
    const iva = new IvaController(spies() as any, tenantScope);
    expect(() => iva.getSummary(session(ADMIN), TENANT_B, 'a', 'b')).toThrow(
      NotFoundException,
    );
  });
});

describe('RRHH', () => {
  it('conceptos de nomina: ids ajenos y tenant ajeno en el body: 404', async () => {
    const svc: any = spies();
    const controller = new ConceptController(svc, tenantScope);
    await expect(
      controller.createConcept(session(ADMIN), { tenantId: TENANT_B } as any),
    ).rejects.toThrow(NotFoundException);
    for (const call of [
      () => controller.updateConcept(session(ADMIN), 99, {} as any),
      () => controller.softDeleteConcept(session(ADMIN), 99),
      () => controller.reactivateConcept(session(ADMIN), 99),
      () => controller.deleteConcept(session(ADMIN), 99),
    ]) {
      await expect(call()).rejects.toThrow(NotFoundException);
    }
    expect(Object.keys(svc)).toEqual([]);
  });

  it('turnos: sucursal o turno ajeno: 404 y no escribe', async () => {
    const svc: any = spies();
    const controller = new TurnsController(svc, tenantScope);
    await expect(
      controller.createTurn(session(ADMIN), { branchId: 'foreign' } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getTurnsByBranch(session(ADMIN), 'foreign'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.updateTurn(session(ADMIN), 7, {} as any),
    ).rejects.toThrow(NotFoundException);
    await expect(controller.deleteTurn(session(ADMIN), 7)).rejects.toThrow(
      NotFoundException,
    );
    expect(Object.keys(svc)).toEqual([]);
  });

  it('empleados: lectura/escritura sobre uno ajeno y alta en tenant ajeno: 404', async () => {
    const svc: any = spies();
    const controller = new EmployeeController(svc, tenantScope);
    await expect(
      controller.getEmployeesByTenant(session(ADMIN), TENANT_B),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getEmployeeById(session(ADMIN), 'foreign-emp'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.deleteEmployee(session(ADMIN), 'foreign-emp'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.createEmployee(session(ADMIN), {
        tenant_id: TENANT_B,
        branch_id: 'own-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.createEmployee(session(ADMIN), {
        tenant_id: TENANT_A,
        branch_id: 'foreign-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(Object.keys(svc)).toEqual([]);
  });

  it('empleado propio: no puede cambiarse de empresa por PATCH', async () => {
    const svc: any = spies();
    const controller = new EmployeeController(svc, tenantScope);
    const body: any = { first_name: 'x', tenant_id: TENANT_B };
    await controller.updateEmployee(session(ADMIN), 'own-emp', body);
    expect(svc.updateEmployeeInfo).toHaveBeenCalledWith('own-emp', {
      first_name: 'x',
    });
  });

  it('faltas: empleado/sucursal ajenos 404; el periodo se filtra por tenant', async () => {
    const svc: any = spies();
    const controller = new FoulController(svc, tenantScope);
    await expect(
      controller.getFoulsByEmployee(session(ADMIN), 'foreign-emp'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getFoulsByBranch(session(ADMIN), 'foreign-branch'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.createFoul(session(ADMIN), {
        employee_id: 'own-emp',
        branch_id: 'foreign-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(svc.registerFoul).not.toHaveBeenCalled();

    await controller.getFoulsByPeriod(session(ADMIN), 'a', 'b');
    expect(svc.getFoulsByPeriod).toHaveBeenLastCalledWith('a', 'b', TENANT_A);
  });

  it('marcaje: empleado, sucursal o registro ajeno: 404 y no escribe', async () => {
    const svc: any = spies();
    const controller = new ClockingController(svc, tenantScope);
    await expect(
      controller.clockIn(session(EMPLOYEE), {
        employeeId: 'foreign-emp',
        branchId: 'own-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.clockOut(session(EMPLOYEE), { employeeId: 'foreign-emp' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.manualClockOut(session(ADMIN), {
        clockingId: 5,
        clockOut: 'x',
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(Object.keys(svc)).toEqual([]);
  });

  it('nomina: hoja, detalle y movimientos ajenos: 404', async () => {
    const svc: any = spies();
    const paysheet = new PaysheetController(svc, tenantScope);
    await expect(
      paysheet.getPaysheetById(session(ADMIN), 'foreign-ps'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      paysheet.getPaysheetDetails(session(ADMIN), 'foreign-ps'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      paysheet.getPaysheetByBranch(session(ADMIN), 'foreign-branch'),
    ).rejects.toThrow(NotFoundException);
    const movements = new PayrollMovementsController(svc, tenantScope);
    await expect(
      movements.getPayrollMovementsByDetail(session(ADMIN), 'foreign-d'),
    ).rejects.toThrow(NotFoundException);
    expect(Object.keys(svc)).toEqual([]);
  });
});

describe('Compras: un employee no es superusuario', () => {
  // role_hierarchy 1 es employee; antes se trataba como superusuario.
  const stateService: any = {
    getRole: (id: number) => roles[id],
  };
  const service = new PaymentAlertsService(
    { query: jest.fn().mockResolvedValue({ rows: [] }) } as any,
    stateService,
  );

  it('un employee no consulta alertas de otro tenant', async () => {
    await expect(
      service.getPendingAlerts(session(EMPLOYEE), TENANT_B),
    ).rejects.toThrow(ForbiddenException);
  });

  it('el superusuario si puede', async () => {
    await expect(
      service.getPendingAlerts(session(SUPER), TENANT_B),
    ).resolves.toBeDefined();
  });
});
