// Roles con acceso a Finanzas (role_name de seeds/catalog/general/005-insert-roles.sql).
// Se usan con @RequiredRole(...ROLES) + RoleAuthorizationGuard; un
// @RequiredRole a nivel de metodo reemplaza al de la clase.

/** Lectura de Finanzas: mismo alcance que el menu (modules.ts, rolesAllowed [1, 2, 3]). */
export const FINANCE_READ_ROLES = ['superuser', 'admin', 'manager'];

/** Registro de gastos y consulta de categorias: tambien el empleado, desde el POS (/app/pos/expenses). */
export const EXPENSE_CAPTURE_ROLES = [...FINANCE_READ_ROLES, 'employee'];

/** Operaciones contables sensibles: cierre de periodo, provision, asientos manuales. */
export const FINANCE_ADMIN_ROLES = ['superuser', 'admin'];
