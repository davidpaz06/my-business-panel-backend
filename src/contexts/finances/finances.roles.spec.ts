import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@/common/decorators/role_metadata.decorator';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { AccountingController } from './modules/accounting/accounting.controller';
import { AccountsController } from './modules/accounts/accounts.controller';
import { CashFlowController } from './modules/cash-flow/cash-flow.controller';
import { ExpenseController } from './modules/expense/expense.controller';
import { IvaController } from './modules/iva/iva.controller';
import { IvaWithholdingController } from './modules/iva/iva-withholding.controller';
import { LoyaltyController } from './modules/loyalty/loyalty.controller';
import { ProfitabilityController } from './modules/profitability/profitability.controller';

// Candado de FNZ-X-03: ningun controlador de Finanzas queda abierto a
// cualquier usuario autenticado; el empleado solo entra a lo que usa el POS.

type Ctor = new (...args: never[]) => object;

const reflector = new Reflector();

/** Roles efectivos de un handler (el del metodo reemplaza al de la clase). */
function rolesOf(controller: Ctor, method: string): string[] | undefined {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  return reflector.getAllAndOverride<string[]>(ROLES_KEY, [
    handler as () => void,
    controller,
  ]);
}

const CONTROLLERS: Ctor[] = [
  AccountingController,
  AccountsController,
  CashFlowController,
  ExpenseController,
  IvaController,
  IvaWithholdingController,
  LoyaltyController,
  ProfitabilityController,
];

describe('Finanzas: autorizacion por rol', () => {
  it.each(CONTROLLERS.map((c) => [c.name, c]))(
    '%s usa RoleAuthorizationGuard y exige roles de Finanzas',
    (_name, controller) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
      expect(guards).toContain(RoleAuthorizationGuard);
      expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([
        'superuser',
        'admin',
        'manager',
      ]);
    },
  );

  it('el empleado no lee flujo de caja, rentabilidad, IVA ni cuentas', () => {
    for (const [controller, method] of [
      [CashFlowController, 'getCashFlow'],
      [ProfitabilityController, 'getProfitability'],
      [IvaController, 'getSummary'],
      [AccountsController, 'getAccountsOverview'],
      [ExpenseController, 'getAnalyticsFixedVsVariable'],
    ] as [Ctor, string][]) {
      expect(rolesOf(controller, method)).not.toContain('employee');
    }
  });

  it('el empleado registra gastos y consulta categorias desde el POS', () => {
    expect(rolesOf(ExpenseController, 'createExpense')).toContain('employee');
    expect(rolesOf(ExpenseController, 'getCategoriesByTenant')).toContain(
      'employee',
    );
    expect(rolesOf(ExpenseController, 'createCategory')).not.toContain(
      'employee',
    );
  });

  it('cierre de periodo, provision y asientos manuales son solo de admin', () => {
    for (const [controller, method] of [
      [ExpenseController, 'closeFiscalPeriod'],
      [ExpenseController, 'createFiscalPeriod'],
      [ExpenseController, 'provisionCategories'],
      [AccountingController, 'createJournalEntry'],
      [AccountingController, 'voidJournalEntry'],
      [AccountingController, 'provisionAccounts'],
      [IvaWithholdingController, 'setAgent'],
      [IvaWithholdingController, 'setSupplierPercentage'],
      [IvaWithholdingController, 'issue'],
      [IvaWithholdingController, 'void'],
    ] as [Ctor, string][]) {
      expect(rolesOf(controller, method)).toEqual(['superuser', 'admin']);
    }
  });
});
