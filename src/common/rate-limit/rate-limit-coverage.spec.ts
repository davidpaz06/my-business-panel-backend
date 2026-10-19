import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';
import { RATE_LIMIT_KEY, RateLimitMetadata } from './rate-limit.decorator';
import { AuthController } from '@/contexts/general/modules/auth/auth.controller';
import { UserController } from '@/contexts/general/modules/user/user.controller';
import { TenantController } from '@/contexts/general/modules/tenant/tenant.controller';
import { SpecialCodeController } from '@/contexts/general/modules/special_code/special_code.controller';
import { SubscriptionController } from '@/contexts/general/modules/subscription/subscription.controller';
import { CustomerController } from '@/contexts/general/modules/customer/customer.controller';
import { CustomerPaymentController } from '@/contexts/general/modules/customer_payment/customer-payment.controller';
import { RegionController } from '@/contexts/general/modules/region/region.controller';
import { ReturnsController } from '@/contexts/pos/modules/returns/returns.controller';
import { CreditDebitNoteController } from '@/contexts/pos/modules/credit-debit-note/credit-debit-note.controller';
import { InvoiceController } from '@/contexts/pos/modules/invoice/invoice.controller';
import { SaleItemController } from '@/contexts/pos/modules/sale-item/sale-item.controller';
import { CollectionAlertsController } from '@/contexts/pos/modules/collection_alerts/collection-alerts.controller';
import { SuppliersController } from '@/contexts/purchase/modules/suppliers/suppliers.controller';
import { PaymentAlertsController } from '@/contexts/purchase/modules/payment_alerts/payment-alerts.controller';
import { WarehouseController } from '@/contexts/inventory/modules/warehouse/warehouse.controller';
import { PayrollController } from '@/contexts/hr/modules/payroll/payroll.controller';
import { SeveranceController } from '@/contexts/hr/modules/severance/severance.controller';
import { VacationsController } from '@/contexts/hr/modules/vacations/vacations.controller';
import { ProfitSharingController } from '@/contexts/hr/modules/profit-sharing/profit-sharing.controller';
import { SettlementController } from '@/contexts/hr/modules/settlement/settlement.controller';
import { EmployeeController } from '@/contexts/hr/modules/employee/employee.controller';
import { ReportingController } from '@/contexts/hr/modules/reporting/reporting.controller';
import { AccountingController } from '@/contexts/finances/modules/accounting/accounting.controller';
import { AccountsController } from '@/contexts/finances/modules/accounts/accounts.controller';
import { CashFlowController } from '@/contexts/finances/modules/cash-flow/cash-flow.controller';
import { ExpenseController } from '@/contexts/finances/modules/expense/expense.controller';
import { IvaWithholdingController } from '@/contexts/finances/modules/iva/iva-withholding.controller';
import { IvaController } from '@/contexts/finances/modules/iva/iva.controller';
import { LoyaltyController } from '@/contexts/finances/modules/loyalty/loyalty.controller';
import { ProfitabilityController } from '@/contexts/finances/modules/profitability/profitability.controller';
import { AppController } from '@/app/app.controller';

/**
 * Candado de cobertura del limitador. TODO controller de la aplicacion debe
 * tener `RateLimitGuard` en TODAS sus rutas y, si la ruta exige sesion,
 * declarado DESPUES de `AuthenticationGuard` (el cubo por usuario sale de
 * request.user, que llena ese guard). Un controller nuevo sin el guard hace
 * fallar este test.
 */

const SRC = join(__dirname, '..', '..');
const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

const controllerFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) ?? [];

const calls = (node: ts.Node) =>
  decoratorsOf(node).map((d) =>
    ts.isCallExpression(d.expression)
      ? {
          name: d.expression.expression.getText(),
          args: d.expression.arguments.map((a) => a.getText()),
        }
      : { name: d.expression.getText(), args: [] as string[] },
  );

const guardsOf = (node: ts.Node): string[] =>
  calls(node)
    .filter((c) => c.name === 'UseGuards')
    .flatMap((c) => c.args);

interface Route {
  file: string;
  route: string;
  guards: string[];
}

const routesOf = (file: string): Route[] => {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const out: Route[] = [];
  sf.forEachChild((n) => {
    if (!ts.isClassDeclaration(n)) return;
    const classCalls = calls(n);
    const ctl = classCalls.find((c) => c.name === 'Controller');
    if (!ctl) return;
    const classGuards = guardsOf(n);
    for (const m of n.members) {
      if (!ts.isMethodDeclaration(m)) continue;
      const route = calls(m).find((c) => HTTP_METHODS.includes(c.name));
      if (!route) continue;
      out.push({
        file: relative(SRC, file).split(sep).join('/'),
        route: `${route.name.toUpperCase()} ${ctl.args[0] ?? ''}${route.args[0] ?? ''} (${m.name.getText()})`,
        // orden de ejecucion en Nest: primero los de clase, luego los del metodo
        guards: [...classGuards, ...guardsOf(m)],
      });
    }
  });
  return out;
};

describe('Limitador de solicitudes: cobertura de controllers', () => {
  const routes = controllerFiles(SRC).flatMap(routesOf);

  it('encuentra rutas que revisar', () => {
    expect(routes.length).toBeGreaterThan(450);
  });

  it('toda ruta tiene RateLimitGuard', () => {
    const missing = routes
      .filter((r) => !r.guards.includes('RateLimitGuard'))
      .map((r) => `${r.route}  (${r.file})`);
    expect(missing).toEqual([]);
  });

  it('en rutas con sesion, RateLimitGuard va despues de AuthenticationGuard', () => {
    const wrongOrder = routes
      .filter((r) => r.guards.includes('AuthenticationGuard'))
      .filter(
        (r) =>
          r.guards.indexOf('RateLimitGuard') <
          r.guards.indexOf('AuthenticationGuard'),
      )
      .map((r) => `${r.route}  (${r.file})`);
    expect(wrongOrder).toEqual([]);
  });
});

describe('Limitador de solicitudes: tipo de cupo de las rutas sensibles', () => {
  const meta = (proto: object, method: string): RateLimitMetadata | undefined =>
    Reflect.getMetadata(RATE_LIMIT_KEY, (proto as any)[method]);

  const expectations: Array<[string, object, string, string]> = [
    ['login', AuthController.prototype, 'login', 'login'],
    ['refresh', AuthController.prototype, 'refresh', 'refresh'],
    [
      'cambio de clave',
      AuthController.prototype,
      'changePassword',
      'sensitive',
    ],
    [
      'reset de clave de empleado',
      UserController.prototype,
      'resetEmployeePassword',
      'sensitive',
    ],
    [
      'carga masiva de usuarios',
      UserController.prototype,
      'createUsersBulk',
      'bulk',
    ],
    [
      'disponibilidad de correo',
      UserController.prototype,
      'checkAvailability',
      'lookup',
    ],
    [
      'alta de tenant publica',
      TenantController.prototype,
      'createTenant',
      'sensitive',
    ],
    [
      'alta de tenant de plataforma',
      TenantController.prototype,
      'createBareTenant',
      'sensitive',
    ],
    [
      'borrado de tenant',
      TenantController.prototype,
      'deleteTenant',
      'sensitive',
    ],
    [
      'disponibilidad del onboarding',
      TenantController.prototype,
      'checkOnboardingAvailability',
      'lookup',
    ],
    [
      'validar codigo especial',
      SpecialCodeController.prototype,
      'validate',
      'sensitive',
    ],
    [
      'crear suscripcion',
      SubscriptionController.prototype,
      'createSubscription',
      'sensitive',
    ],
    [
      'webhook de Stripe',
      SubscriptionController.prototype,
      'handleWebhook',
      'webhook',
    ],
    [
      'disponibilidad de cliente',
      CustomerController.prototype,
      'checkAvailability',
      'lookup',
    ],
    [
      'cobros masivos',
      CustomerPaymentController.prototype,
      'bulkInsert',
      'bulk',
    ],
    [
      'devolucion',
      ReturnsController.prototype,
      'createReturnTransaction',
      'sensitive',
    ],
    [
      'reembolso total',
      ReturnsController.prototype,
      'processFullRefund',
      'sensitive',
    ],
    [
      'nota de credito/debito',
      CreditDebitNoteController.prototype,
      'create',
      'sensitive',
    ],
    [
      'anular nota',
      CreditDebitNoteController.prototype,
      'voidNote',
      'sensitive',
    ],
    [
      'borrar factura',
      InvoiceController.prototype,
      'deleteInvoice',
      'sensitive',
    ],
    [
      'borrar item de venta',
      SaleItemController.prototype,
      'deleteItem',
      'sensitive',
    ],
    [
      'generar alertas de cobro',
      CollectionAlertsController.prototype,
      'generate',
      'bulk',
    ],
    [
      'alta masiva de proveedores',
      SuppliersController.prototype,
      'createSuppliersBulk',
      'bulk',
    ],
    [
      'generar alertas de pago',
      PaymentAlertsController.prototype,
      'generate',
      'bulk',
    ],
    [
      'carga masiva de inventario',
      WarehouseController.prototype,
      'bulkInsertInventory',
      'bulk',
    ],
    [
      'conteo de almacen',
      WarehouseController.prototype,
      'countAllProductsInWarehouse',
      'bulk',
    ],
    [
      'reporte de discrepancias',
      WarehouseController.prototype,
      'generateDiscrepancyReport',
      'bulk',
    ],
    [
      'aplicar ajuste de discrepancia',
      WarehouseController.prototype,
      'applyDiscrepancyAdjustment',
      'sensitive',
    ],
    [
      'borrar almacen',
      WarehouseController.prototype,
      'deleteWarehouse',
      'sensitive',
    ],
    ['crear planilla', PayrollController.prototype, 'createPaysheet', 'bulk'],
    ['procesar nomina', PayrollController.prototype, 'processPayroll', 'bulk'],
    [
      'generar depositos de prestaciones',
      SeveranceController.prototype,
      'generateDeposits',
      'bulk',
    ],
    [
      'generar intereses de prestaciones',
      SeveranceController.prototype,
      'generateInterest',
      'bulk',
    ],
    [
      'generar periodos vacacionales',
      VacationsController.prototype,
      'generatePeriods',
      'bulk',
    ],
    [
      'calcular utilidades',
      ProfitSharingController.prototype,
      'calculate',
      'bulk',
    ],
    [
      'cerrar periodo de utilidades',
      ProfitSharingController.prototype,
      'close',
      'sensitive',
    ],
    [
      'anular liquidacion',
      SettlementController.prototype,
      'void_',
      'sensitive',
    ],
    [
      'borrar empleado',
      EmployeeController.prototype,
      'deleteEmployee',
      'sensitive',
    ],
    [
      'provisionar cuentas contables',
      AccountingController.prototype,
      'provisionAccounts',
      'bulk',
    ],
    [
      'anular asiento',
      AccountingController.prototype,
      'voidJournalEntry',
      'sensitive',
    ],
    [
      'provisionar categorias de gasto',
      ExpenseController.prototype,
      'provisionCategories',
      'bulk',
    ],
    [
      'cerrar periodo fiscal',
      ExpenseController.prototype,
      'closeFiscalPeriod',
      'sensitive',
    ],
    [
      'anular retencion de IVA',
      IvaWithholdingController.prototype,
      'void',
      'sensitive',
    ],
    [
      'resumen de cuentas',
      AccountsController.prototype,
      'getAccountsOverview',
      'report',
    ],
    [
      'analitica de gastos',
      ExpenseController.prototype,
      'getAnalyticsPayroll',
      'report',
    ],
    ['resumen de IVA', IvaController.prototype, 'getSummary', 'report'],
    ['flujo de caja', CashFlowController.prototype, 'getCashFlow', 'report'],
    [
      'proyecciones de caja',
      CashFlowController.prototype,
      'getProjections',
      'report',
    ],
    [
      'rentabilidad',
      ProfitabilityController.prototype,
      'getProfitability',
      'report',
    ],
    [
      'resumen de lealtad',
      LoyaltyController.prototype,
      'getOverview',
      'report',
    ],
    ['chequeo de salud', AppController.prototype, 'getHello', 'health'],
  ];

  it.each(expectations)('%s', (_label, proto, method, tier) => {
    expect(meta(proto, method)?.tier).toBe(tier);
  });

  it('el login limita ademas por correo y el refresh por hash del token', () => {
    expect(typeof meta(AuthController.prototype, 'login')?.identity).toBe(
      'function',
    );
    expect(typeof meta(AuthController.prototype, 'refresh')?.identity).toBe(
      'function',
    );
  });

  it('los reportes de RRHH usan el cupo de reportes en todo el controller', () => {
    const classMeta: RateLimitMetadata | undefined = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      ReportingController,
    );
    expect(classMeta?.tier).toBe('report');
  });

  it('el catalogo publico de regiones usa el cupo publico por IP', () => {
    const classMeta: RateLimitMetadata | undefined = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      RegionController,
    );
    expect(classMeta?.tier).toBe('public');
  });
});
