# Matriz de autorizacion y aislamiento por tenant (backend)

Generada el 2026-10-19 a partir del codigo de `src/` (467 rutas en 76 controllers). Todas las rutas cuelgan del prefijo global `/api/v1`.

Objetivo: verificar que cada tenant solo accede a su informacion, que cada perfil solo llega a las rutas de su alcance segun la jerarquia de roles y que solo el superuser tiene acceso total.

## 1. Resumen

| Indicador | Valor |
|---|---|
| Rutas totales | 467 |
| Publicas (sin sesion) | 8 |
| Con control de rol o nivel | 115 |
| Solo exigen sesion (cualquier rol autenticado, incluido employee) | 344 (74%) |
| Rutas con alcance de rol por debajo de lo que muestra el menu del frontend (R1) | 309 (146 de escritura) |
| Rutas que tenian brecha de aislamiento entre tenants (T1 a T5), ya corregidas | 19 |
| Rutas con brecha de autorizacion por rol confirmada (R2) | 1 |

**Conclusion.** Con las excepciones que siguen, el aislamiento entre tenants es solido en POS, general, finanzas, compras e inventario: el tenant sale de la sesion y los recursos por id se validan con `TenantScopeService` o en el servicio. Se encontraron cinco brechas de aislamiento (T1 a T5), concentradas en RRHH (`employeeId` sin validar) y en dos catalogos; las cinco estan corregidas y cubiertas por tests de dos tenants. Sigue abierta una brecha de rol (R2, un employee aprueba su propio traslado). Ver seccion 4. La autorizacion por rol es la parte debil: el backend casi no la aplica y delega en el menu del frontend, que se salta llamando a la API directamente.

## 2. Modelo de autorizacion

**Jerarquia de roles** (`general_schema.role`, seed `005-insert-roles.sql`):

| Rol | `role_hierarchy` | `role_id` |
|---|---|---|
| superuser | 4 | 1 |
| admin | 3 | 2 |
| manager | 2 | 3 |
| employee | 1 | 4 |

**Mecanismos** (siempre despues de `AuthenticationGuard`, que valida la cookie `auth_token` y carga `user_id`, `tenant_id`, `role_id`):

| Mecanismo | Semantica | Aplicacion |
|---|---|---|
| `@RequiredRole(...nombres)` + `RoleAuthorizationGuard` | Coincidencia **exacta** de nombre; no usa la jerarquia. `@RequiredRole("admin")` deja fuera al superuser salvo que se liste. | 67 rutas |
| `@RequiredLevel(n)` + `LevelAuthorizationGuard` | Jerarquia: `role_hierarchy >= n`. Es el mecanismo que respeta "el permiso se define por la jerarquia". | 48 rutas |
| `TenantScopeService` | Aislamiento por tenant: `assertOwns` (404 si el recurso es de otro tenant), `scopeFor`, `resolveRequestedTenant`. El superuser queda exento por diseno. | Controllers y servicios |
| `@Paginate({ tenantField })` | Filtra siempre por el tenant de la sesion. | Listados paginados |

**Reglas verificadas**

- No hay guards globales (`APP_GUARD`): una ruta sin `@UseGuards` es publica. Solo `controller-guards.spec.ts` lo previene, y unicamente exige `AuthenticationGuard`, no un rol.
- Todo `@RequiredRole` o `@RequiredLevel` esta acompanado de su guard correspondiente (0 casos de decorador sin guard, que no se aplicaria).
- Un recurso de otro tenant responde 404, no 403, para no revelar que existe.
- Escalada de privilegios en usuarios: `UserService.assertCanGrantRole` impide asignar un rol superior al propio y `resetEmployeePassword` solo opera sobre employees.
- Endpoints globales (`GET /customers/all`, `GET /product/all`, `GET /tenant`, `DELETE /tenant/:id`, `GET /margin`, `special-code`) exigen superuser; el unico con acceso global en compras es `GET /purchase` y `GET /purchase/payables`, que devuelven todo solo si el rol es superuser.

## 3. Leyenda de las tablas

- **Rol / nivel requerido**: lo que hoy hace cumplir el backend. "Cualquier autenticado" significa que un employee puede llamar a la ruta.
- **Aislamiento por tenant**: `TenantScope en el controller` (verificado en el controller), `Sesion; verificacion de pertenencia en el servicio` y `Sesion; tenant llega al SQL` (deteccion estatica: el tenant de la sesion llega al servicio y al SQL; no revisado linea por linea), `Plataforma (solo superuser)`, `No aplica` (publica, catalogo global o calculo sin datos) y `GAP Tn` (brecha confirmada).
- **Hallazgo**: `T1` a `T5` brechas de aislamiento entre tenants y `R2` brecha de rol (seccion 4). `R1` el rol exigido es menor que el que el menu del frontend permite ver; la columna se explica en la seccion 5.

## 4. Brechas confirmadas leyendo el codigo

| ID | Severidad | Brecha | Rutas | Estado |
|---|---|---|---|---|
| T1 | Critica | Tipos de cargo (RRHH) sin aislamiento por tenant | 3 | Corregida |
| T2 | Alta | Prestaciones sociales: employeeId sin validar contra el tenant | 6 | Corregida |
| T3 | Alta | Descuentos y bono de fin de ano: employeeId sin validar contra el tenant | 6 | Corregida |
| T4 | Media | Limites de jornada por contrato sin validar tenant | 1 | Corregida |
| T5 | Media | Categorias de producto: tabla global modificable por cualquier admin/manager | 3 | Corregida |
| R2 | Alta | Un employee puede aprobar su propia solicitud de traslado entre almacenes | 1 | Abierta |

### T1 (Critica, corregida): Tipos de cargo (RRHH) sin aislamiento por tenant

DutiesTypeController solo usa AuthenticationGuard. POST toma tenant_id del cuerpo (crea registros en cualquier tenant) y PATCH/DELETE operan por id (`WHERE duties_type_id = $n`) sin validar el tenant. Cualquier usuario autenticado, incluido un employee, puede modificar o dar de baja tipos de cargo ajenos.

Rutas: `POST /duties-type`, `PATCH /duties-type/:id`, `DELETE /duties-type/:id`

**Correccion aplicada**: Tomar tenant_id de la sesion en create; en update/remove llamar a una verificacion de pertenencia (agregar `dutiesType` a OWNERSHIP_QUERIES) y exigir nivel >= 2.

### T2 (Alta, corregida): Prestaciones sociales: employeeId sin validar contra el tenant

Estas rutas reciben employeeId (URL o cuerpo) y consultan solo por ese id. Un usuario autenticado de otro tenant puede leer saldos, intereses y anticipos de prestaciones de empleados ajenos, y POST interest/settle y POST advances escriben sobre empleados ajenos.

Rutas: `GET /severance/interest/:employeeId`, `GET /severance/advances/:employeeId`, `GET /severance/balance/:employeeId`, `GET /severance/advances/:employeeId/available`, `POST /severance/advances`, `POST /severance/interest/settle`

**Correccion aplicada**: Llamar a `getEmployee(employeeId, tenantId)` (o `tenantScope.assertOwns("employee", id, session)`) al inicio de cada metodo, como ya hacen deposits/generate, deposits/:employeeId/pending y calculate.

### T3 (Alta, corregida): Descuentos y bono de fin de ano: employeeId sin validar contra el tenant

DeductionsService.listByEmployee, availableMargin y settlementCompensation consultan por employeeId sin verificar el tenant (settlementCompensation valida la liquidacion pero no que el empleado sea el de esa liquidacion). DeductionsService.create inserta un descuento para dto.employee_id sin comprobar que sea del tenant. ProfitSharing year-end-bonus (preview y POST) tampoco valida el empleado: POST escribe un anticipo para un empleado ajeno.

Rutas: `GET /deductions/:employeeId`, `GET /deductions/:employeeId/available-margin`, `GET /deductions/:employeeId/settlement-compensation`, `POST /deductions`, `GET /profit-sharing/year-end-bonus/preview/:employeeId`, `POST /profit-sharing/year-end-bonus`

**Correccion aplicada**: Validar el empleado con la misma verificacion de pertenencia antes de consultar o escribir.

### T4 (Media, corregida): Limites de jornada por contrato sin validar tenant

GET /journey/limits/:contractId lee el contrato por id y devuelve journey_type y weekly_hours de un contrato de otro tenant.

Rutas: `GET /journey/limits/:contractId`

**Correccion aplicada**: Usar `tenantScope.assertOwns("contract", contractId, session)`.

### T5 (Media, corregida): Categorias de producto: tabla global modificable por cualquier admin/manager

general_schema.product_category no tiene tenant_id (catalogo compartido por todos los tenants), pero crear, renombrar y borrar exige solo nivel >= 2. Un manager de cualquier empresa puede renombrar o eliminar categorias que usan todas las demas (el borrado es en cascada sobre las subcategorias).

Rutas: `POST /category`, `PUT /category/:id`, `DELETE /category/:id`

**Correccion aplicada**: Exigir superuser (nivel 4) para POST/PUT/DELETE, o agregar tenant_id a la tabla si deben ser por empresa.

### R2 (Alta, abierta): Un employee puede aprobar su propia solicitud de traslado entre almacenes

POST /warehouse/transfer crea una solicitud pendiente cuando el rol es employee (`role_id === 4`) y mueve el inventario directamente para los demas roles. Pero PATCH /warehouse/transfer-request/:id/status, que aprueba o rechaza la solicitud, solo exige sesion: el propio employee puede aprobar lo que acaba de solicitar y saltarse el flujo de aprobacion. El comentario del controller lo admite ("let it pass for now").

Rutas: `PATCH /warehouse/transfer-request/:id/status`

**Correccion propuesta**: Exigir `@UseGuards(LevelAuthorizationGuard) @RequiredLevel(2)` en la ruta (y que quien aprueba no sea quien solicito).

## 5. Brecha de alcance por rol (R1)

El menu del frontend (`my-business-panel-frontend/src/config/modules.ts`, `rolesAllowed`) oculta modulos enteros a los employees, pero el backend acepta esas mismas llamadas de cualquier usuario autenticado. Un employee con un token valido puede, por ejemplo, crear contratos, procesar nominas, registrar pagos a proveedores, borrar almacenes o ver finanzas llamando a la API directamente.

La columna "Hallazgo" marca `R1` cuando el nivel que exige el backend es menor que el minimo que implica el menu para esa pantalla. El minimo esperado por controller se detalla en la tabla siguiente (lectura / escritura). Es una propuesta derivada del menu, no una regla de negocio confirmada; conviene revisarla antes de aplicarla.

| Controller | Rutas | Con R1 | De escritura | Minimo esperado (lectura / escritura) | Fuente |
|---|---|---|---|---|---|
| AccountingController | 16 | 13 | 7 | manager / manager | Menu Finanzas: superuser, admin, manager |
| AccountsController | 5 | 5 | 0 | manager / manager | Menu Finanzas: superuser, admin, manager |
| CashFlowController | 2 | 2 | 0 | manager / manager | Menu Finanzas: superuser, admin, manager |
| ExpenseController | 19 | 19 | 6 | manager / manager | Menu Finanzas: superuser, admin, manager |
| IvaWithholdingController | 7 | 7 | 4 | manager / manager | Menu Finanzas: superuser, admin, manager |
| IvaController | 1 | 1 | 0 | manager / manager | Menu Finanzas: superuser, admin, manager |
| LoyaltyController | 1 | 1 | 0 | manager / manager | Menu Finanzas: superuser, admin, manager |
| ProfitabilityController | 1 | 1 | 0 | manager / manager | Menu Finanzas: superuser, admin, manager |
| AttributeValueController | 5 | 5 | 3 | manager / manager | Menu Administracion |
| BranchController | 6 | 3 | 0 | manager / manager | Menu Administracion: superuser, admin, manager |
| CustomerSegmentMarginController | 5 | 4 | 3 | manager / manager | Administracion |
| ProductCompositionController | 6 | 1 | 1 | employee / manager | Lectura la usa el POS; edicion en Administracion |
| TenantAttributeController | 6 | 6 | 3 | manager / manager | Menu Administracion |
| TenantProductGroupController | 7 | 7 | 3 | manager / manager | Menu Administracion |
| TenantProductGroupTypeController | 5 | 5 | 3 | manager / manager | Menu Administracion |
| BeneficiariesController | 5 | 5 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| ClockingController | 6 | 6 | 4 | manager / manager | Menu RRHH: superuser, admin, manager |
| ConceptController | 7 | 7 | 6 | manager / manager | Menu RRHH: superuser, admin, manager |
| ContractController | 3 | 2 | 1 | manager / manager | Menu RRHH: superuser, admin, manager |
| DeductionsController | 7 | 6 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| DutiesTypeController | 4 | 1 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| EmployeeController | 10 | 10 | 6 | manager / manager | Menu RRHH: superuser, admin, manager |
| FoulController | 4 | 4 | 1 | manager / manager | Menu RRHH: superuser, admin, manager |
| HolidaysController | 4 | 4 | 1 | manager / manager | Menu RRHH: superuser, admin, manager |
| IncapacityController | 5 | 5 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| JourneyController | 6 | 4 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| OvertimeController | 4 | 4 | 2 | manager / manager | Menu RRHH: superuser, admin, manager |
| MoraController | 3 | 2 | 2 | manager / manager | Menu RRHH: superuser, admin, manager |
| ParametersController | 4 | 3 | 0 | manager / admin | Menu RRHH parametros: superuser, admin |
| PayrollController | 2 | 2 | 2 | manager / manager | Menu RRHH: superuser, admin, manager |
| PayrollMovementsController | 2 | 2 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| PaysheetController | 5 | 5 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| ProfitSharingController | 14 | 14 | 6 | manager / manager | Menu RRHH: superuser, admin, manager |
| ReportingController | 9 | 9 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| SalaryHistoryController | 2 | 2 | 1 | manager / manager | Menu RRHH: superuser, admin, manager |
| SalaryController | 2 | 2 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| SettlementController | 8 | 7 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| SeveranceController | 18 | 15 | 7 | manager / manager | Menu RRHH: superuser, admin, manager |
| SuspentionController | 5 | 5 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| TardinessController | 3 | 3 | 0 | manager / manager | Menu RRHH: superuser, admin, manager |
| TurnsController | 4 | 4 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| VacationsController | 13 | 10 | 3 | manager / manager | Menu RRHH: superuser, admin, manager |
| WarehouseController | 24 | 13 | 13 | employee / manager | Inventario lo ven todos; almacenes y reportes: superuser, admin, manager |
| AccountsReceivableController | 4 | 1 | 0 | manager / manager | Menu Cuentas por cobrar: superuser, admin, manager |
| CollectionAlertsController | 6 | 6 | 3 | manager / manager | Menu Alertas de cobro: superuser, admin, manager |
| CreditDebitNoteController | 4 | 4 | 2 | manager / manager | Notas desde historial/devoluciones |
| LoyalProgramController | 5 | 5 | 3 | manager / manager | Menu POS |
| PosRoyaltyController | 12 | 12 | 7 | admin / admin | Menu Regalias: superuser, admin |
| ReturnsController | 5 | 5 | 2 | manager / manager | Menu Devoluciones: superuser, admin, manager |
| SaleController | 4 | 2 | 0 | manager / employee | Nueva venta: todos; historial de ventas: admin, manager |
| DisputesController | 3 | 3 | 2 | manager / manager | Menu Compras: superuser, admin, manager |
| PaymentAlertsController | 6 | 6 | 3 | manager / manager | Menu Compras: superuser, admin, manager |
| PurchaseController | 24 | 23 | 14 | manager / manager | Menu Compras: superuser, admin, manager |
| SuppliersController | 6 | 6 | 4 | manager / manager | Menu Compras: superuser, admin, manager |

## 6. Otras observaciones

- **O1. Ruta inalcanzable**: `GET /user/:email` queda tapada por `GET /user/:userId` (misma forma, declarada despues). Nunca se ejecuta; si se necesita buscar por correo, usar otra ruta (`/user/by-email/:email`).
- **O2. Rol exacto vs jerarquia**: `PATCH /user/:userId/password` usa `@RequiredRole("admin")` y excluye al superuser a proposito (comentario del controller). Las rutas con `@RequiredRole` de varios nombres (`admin`, `manager`, `superuser`) se comportan como un nivel pero no se actualizan solas si cambia la jerarquia; conviene migrarlas a `@RequiredLevel`.
- **O3. Candado de pruebas incompleto**: `controller-guards.spec.ts` solo verifica `AuthenticationGuard`. Propuesta: exigir tambien `@RequiredLevel` o una lista explicita `AUTH_ONLY_BY_DESIGN`, de modo que una ruta nueva sin alcance de rol falle el test.
- **O4. Limitador de solicitudes (resuelta)**: todas las rutas pasan por `RateLimitGuard`, que cuenta por IP, por usuario y, en login y refresh, por correo o por hash del refresh token. Los tipos de cupo (`read`, `write`, `bulk`, `report`, `lookup`, `sensitive`, `public`, `login`, `refresh`, `webhook`, `health`) estan en `src/common/rate-limit/rate-limit.config.ts` y `rate-limit-coverage.spec.ts` falla si un controller queda sin el guard. Limites: los contadores son por proceso (no se comparten entre instancias) y las requests con sesion invalida no se cuentan porque el guard va despues de `AuthenticationGuard`.
- **O5. Sin RLS en PostgreSQL**: ningun script de `my-business-panel-database` define `ROW LEVEL SECURITY` ni `CREATE POLICY`. El aislamiento depende por completo de que cada consulta del backend filtre por tenant; un fallo de aplicacion (como T1 a T4) expone datos sin una segunda barrera.
- **O7. Roles fijos por `role_id === 4`**: `warehouse.controller.ts:349`, `pos-expense.service.ts:57,90,98` deciden el flujo de aprobacion comparando contra el `role_id` numerico del employee. Ese id depende del orden del seed; mejor comparar por `role_name` o por `role_hierarchy`.
- **O6. Superuser**: tras `TenantScopeService.isSuperuser` el superuser opera sobre cualquier tenant en todo endpoint con `assertOwns`/`scopeFor`, ademas de los endpoints exclusivos. Es consistente con "solo el superuser tiene acceso total"; ningun otro rol tiene bypass.

## 7. Rutas por modulo

### Aplicacion

#### App (`/`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/` | getHello | Publico: Health check | No aplica (publica) | - |

### General

#### AttributeValue (`/attribute-value`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/attribute-value/:tenantId/by-attribute/:tenantAttributeId` | getByTenantAttribute | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/attribute-value/:tenantId/:id` | getById | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/attribute-value` | create | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/attribute-value/:tenantId/:id` | update | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/attribute-value/:tenantId/:id` | delete | Cualquier autenticado | TenantScope en el controller | R1 |

#### Auth (`/auth`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/auth/login` | login | Publico: Inicio de sesion | No aplica (publica) | - |
| POST | `/auth/refresh` | refresh | Publico: Se autentica con la cookie de refresh (RefreshTokenGuard) | No aplica (publica) | - |
| POST | `/auth/change-password` | changePassword | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| POST | `/auth/logout` | logout | Cualquier autenticado | Sesion; tenant llega al SQL | - |

#### Branch (`/branch`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/branch/:id` | findById | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/branch` | findAll | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/branch/tenant/:tenantId` | findByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/branch` | createBranch | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |
| DELETE | `/branch/:id` | deleteBranch | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |
| PATCH | `/branch/:id` | updateBranch | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |

#### Currency (`/currency`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/currency` | getAll | Cualquier autenticado | No aplica (catalogo global) | - |
| GET | `/currency/:id` | getById | Cualquier autenticado | No aplica (catalogo global) | - |

#### Customer (`/customers`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/customers/all` | getAllCustomersGlobal | Rol exacto: superuser | Plataforma (solo superuser) | - |
| GET | `/customers/availability` | checkAvailability | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/customers/tenant/:tenantId` | getAllCustomersForTenant | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/customers/tenant/:tenantId/search` | searchCustomers | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/customers/doc/:documentId` | getOneCustomer | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/customers/:id/detail` | getCustomerDetail | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/customers/:id/sales` | getCustomerSalesHistory | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/customers/:id` | getOneCustomerById | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/customers` | createCustomer | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| PATCH | `/customers/:id` | updateCustomer | Cualquier autenticado | TenantScope en el controller | - |
| DELETE | `/customers/:id` | deleteCustomer | Cualquier autenticado | TenantScope en el controller | - |

#### CustomerPayment (`/payment`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/payment` | getAllPayments | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/payment/:id` | getCustomerPayments | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/payment` | newPayment | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/payment/bulk` | bulkInsert | Cualquier autenticado | TenantScope en el controller | - |
| DELETE | `/payment/:id` | deleteCustomerPayment | Cualquier autenticado | TenantScope en el controller | - |

#### CustomerSegmentMargin (`/margin`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/margin` | getMarginsInfo | Rol exacto: superuser | Plataforma (solo superuser) | - |
| GET | `/margin/:tenantId` | getMarginsByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/margin` | createNewMargin | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/margin/:id` | updateMargin | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/margin/:id` | deleteMargin | Cualquier autenticado | TenantScope en el controller | R1 |

#### ExchangeRate (`/exchange-rate`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/exchange-rate/effective` | getEffective | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/exchange-rate/ledger` | getLedger | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/exchange-rate/base` | getBase | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/exchange-rate/base` | setBase | Nivel >= 4 (superuser) | Plataforma (solo superuser) | - |
| POST | `/exchange-rate/delta` | setDelta | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| PUT | `/exchange-rate/auto-update` | setAutoUpdate | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| POST | `/exchange-rate/manual` | setManualRate | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |

#### GlobalAttribute (`/global-attribute`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/global-attribute` | getAll | Cualquier autenticado | No aplica (catalogo global) | - |
| GET | `/global-attribute/:id` | getById | Cualquier autenticado | No aplica (catalogo global) | - |

#### IdentificationType (`/document`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/document` | getAll | Cualquier autenticado | No aplica (catalogo global) | - |
| GET | `/document/:id` | getOne | Cualquier autenticado | No aplica (catalogo global) | - |
| DELETE | `/document/:id` | delete | Rol exacto: superuser | Plataforma (solo superuser) | - |

#### Product (`/product`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/product/all` | getAllProductsGlobal | Rol exacto: superuser | Plataforma (solo superuser) | - |
| GET | `/product/sku/:sku` | getProductBySku | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product/:tenantId/search` | searchProductsByTenant | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product/:tenantId/:id/with-attributes` | getProductByIdWithAttributes | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product/:tenantId` | getAllProductsByTenant | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/product` | createNewProduct | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |
| PATCH | `/product/:id` | updateProduct | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |
| DELETE | `/product/:id` | deleteProduct | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |

#### ProductCategory (`/category`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/category` | getAll | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/category` | createCategory | Nivel >= 4 (superuser) | Corregido T5 (validado en servicio/controller) | T5 |
| PUT | `/category/:id` | updateCategory | Nivel >= 4 (superuser) | Corregido T5 (validado en servicio/controller) | T5 |
| DELETE | `/category/:id` | deleteCategory | Nivel >= 4 (superuser) | Corregido T5 (validado en servicio/controller) | T5 |

#### ProductComposition (`/product-composition`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/product-composition/:tenantId/parent/:parentId` | byParent | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product-composition/:tenantId/child/:childId` | byChild | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product-composition/:tenantId/availability/:parentId/:warehouseId` | availability | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/product-composition` | replace | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |
| PATCH | `/product-composition/:tenantId/parent/:parentId/component/:childId` | updateQuantity | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/product-composition/:tenantId/parent/:parentId` | clear | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |

#### ProductVariantGroupAssignment (`/product-variant-group`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/product-variant-group/:tenantId/variant/:variantId` | getByVariant | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/product-variant-group/:tenantId/group/:groupId/variants` | getVariantsByGroup | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/product-variant-group` | replace | Nivel >= 2 (manager, admin, superuser) | TenantScope en el controller | - |

#### Region (`/region`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/region` | getAllRegions | Publico: Catalogo del formulario de registro | No aplica (publica) | - |

#### Segment (`/segment`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/segment` | getSegments | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/segment` | newSegment | Rol exacto: superuser | Plataforma (solo superuser) | - |
| DELETE | `/segment/:id` | deleteSegment | Rol exacto: superuser | Plataforma (solo superuser) | - |

#### SpecialCode (`/special-code`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/special-code` | listAll | Nivel >= 4 (superuser) | Plataforma (solo superuser) | - |
| POST | `/special-code` | create | Nivel >= 4 (superuser) | Plataforma (solo superuser) | - |
| DELETE | `/special-code/:id` | remove | Nivel >= 4 (superuser) | Plataforma (solo superuser) | - |
| GET | `/special-code/validate` | validate | Publico: Valida un codigo antes del registro | No aplica (publica) | - |

#### Subscription (`/subscription`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/subscription/create` | createSubscription | Rol exacto: superuser o admin | TenantScope en el controller | - |
| POST | `/subscription/webhook` | handleWebhook | Publico: Webhook de Stripe, autenticado por firma | No aplica (publica) | - |

#### Tenant (`/tenant`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/tenant` | getAllTenants | Rol exacto: superuser | Plataforma (solo superuser) | - |
| GET | `/tenant/availability` | checkOnboardingAvailability | Publico: Sonda del onboarding | No aplica (publica) | - |
| GET | `/tenant/:id` | getSingleTenant | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/tenant/:id/users` | getUsersByTenant | Rol exacto: superuser o admin o manager | TenantScope en el controller | - |
| POST | `/tenant` | createTenant | Publico: Alta de onboarding; el cuerpo exige user y subscription | No aplica (publica) | - |
| POST | `/tenant/bare` | createBareTenant | Rol exacto: superuser | Plataforma (solo superuser) | - |
| PATCH | `/tenant/:id` | updateTenant | Rol exacto: superuser o admin | TenantScope en el controller | - |
| DELETE | `/tenant/:id` | deleteTenant | Rol exacto: superuser | Plataforma (solo superuser) | - |

#### TenantAttribute (`/tenant-attribute`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/tenant-attribute/:tenantId/search` | searchUnified | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-attribute/:tenantId` | getByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-attribute/:tenantId/:id` | getById | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/tenant-attribute` | create | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/tenant-attribute/:tenantId/:id` | update | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/tenant-attribute/:tenantId/:id` | delete | Cualquier autenticado | TenantScope en el controller | R1 |

#### TenantProductGroup (`/tenant-product-group`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/tenant-product-group/:tenantId` | list | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-product-group/:tenantId/tree` | tree | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-product-group/:tenantId/:id` | getById | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-product-group/:tenantId/:id/descendants` | descendants | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/tenant-product-group` | create | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/tenant-product-group/:tenantId/:id` | update | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/tenant-product-group/:tenantId/:id` | delete | Cualquier autenticado | TenantScope en el controller | R1 |

#### TenantProductGroupType (`/tenant-product-group-type`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/tenant-product-group-type/:tenantId` | getByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tenant-product-group-type/:tenantId/:id` | getById | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/tenant-product-group-type` | create | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/tenant-product-group-type/:tenantId/:id` | update | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/tenant-product-group-type/:tenantId/:id` | delete | Cualquier autenticado | TenantScope en el controller | R1 |

#### User (`/user`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/user` | createUser | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| POST | `/user/bulk` | createUsersBulk | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| PUT | `/user` | assignRole | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| GET | `/user/roles` | getUserRoles | Nivel >= 1 (employee, manager, admin, superuser) | No aplica (catalogo global) | - |
| GET | `/user/availability` | checkAvailability | Nivel >= 3 (admin, superuser) | No aplica (catalogo global) | - |
| GET | `/user` | getSelfInfo | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/user/:userId` | getUserById | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| GET | `/user/:email` | getUserByEmail | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| PATCH | `/user/:userId/password` | resetEmployeePassword | Rol exacto: admin | Sesion; tenant llega al SQL | - |
| PATCH | `/user/:userId` | updateUser | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| DELETE | `/user/:userId` | deleteUser | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |

### Punto de venta (POS)

#### AccountsReceivable (`/pos/receivables`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/pos/receivables` | findAll | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/pos/receivables/catalogs` | getCatalogs | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/pos/receivables/collection` | registerCollection | Nivel >= 2 (manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| PATCH | `/pos/receivables/collection/:id` | updateCollection | Nivel >= 2 (manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |

#### CashRegister (`/cash-register`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/cash-register` | create | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| GET | `/cash-register` | find | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/cash-register/all/paginated` | findPaginated | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/cash-register/sessions/all` | findSessions | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; tenant llega al SQL | - |
| POST | `/cash-register/start` | startSession | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| POST | `/cash-register/close` | closeSession | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/cash-register/sessions/:sessionId/report` | getSessionReport | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/cash-register/sessions/:sessionId/payment-methods` | getPaymentMethods | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/cash-register/:id` | findOne | Nivel >= 1 (employee, manager, admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| PUT | `/cash-register/:id` | update | Nivel >= 3 (admin, superuser) | Sesion; verificacion de pertenencia en el servicio | - |
| DELETE | `/cash-register/:id` | remove | Nivel >= 4 (superuser) | Plataforma (solo superuser) | - |

#### CollectionAlerts (`/pos/collection-alerts`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/pos/collection-alerts` | findAll | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/pos/collection-alerts/stats` | getStats | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/pos/collection-alerts/config` | getConfig | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/pos/collection-alerts/config` | upsertConfig | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/pos/collection-alerts/generate` | generate | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/pos/collection-alerts/:id/resolve` | resolve | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### CreditDebitNote (`/credit-debit-notes`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/credit-debit-notes` | create | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/credit-debit-notes/invoice/:invoiceId` | listByInvoice | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/credit-debit-notes` | listByTenant | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/credit-debit-notes/:noteId/void` | voidNote | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Invoice (`/invoice`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/invoice/:id` | getTenantInvoices | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/invoice/details/:id` | getInvoiceById | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/invoice/sale/:saleId` | getInvoiceBySaleId | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/invoice` | getCustomerInvoices | Cualquier autenticado | TenantScope en el controller | - |
| DELETE | `/invoice/:id` | deleteInvoice | Rol exacto: admin o superuser | TenantScope en el controller | - |

#### LoyalProgram (`/loyal-program`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/loyal-program/:tenant_id` | getLoyalProgramsByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/loyal-program/program/:id` | getLoyalProgramById | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/loyal-program` | createLoyalProgram | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/loyal-program/:id` | updateLoyalProgram | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/loyal-program/:id` | deleteLoyalProgram | Cualquier autenticado | TenantScope en el controller | R1 |

#### PosExpense (`/pos-expense`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/pos-expense/types/:tenantId` | listTypes | Cualquier autenticado | TenantScope en el controller | - |
| POST | `/pos-expense/types` | createType | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/pos-expense/branch/:branchId` | listByBranch | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | - |
| POST | `/pos-expense` | create | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | - |
| PATCH | `/pos-expense/:expenseId/status` | updateStatus | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | - |

#### PosRoyalty (`/pos-royalty`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/pos-royalty/rules/:tenantId` | listRules | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/pos-royalty/rules/detail/:royaltyRuleId` | getRule | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/pos-royalty/rules` | createRule | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PUT | `/pos-royalty/rules/:royaltyRuleId` | updateRule | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/pos-royalty/rules/:royaltyRuleId` | deleteRule | Cualquier autenticado | TenantScope en el controller | R1 |
| PUT | `/pos-royalty/rules/:royaltyRuleId/dimensions` | setRuleDimensions | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/pos-royalty/options` | createOption | Cualquier autenticado | TenantScope en el controller | R1 |
| PUT | `/pos-royalty/options/:royaltyOptionId` | updateOption | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/pos-royalty/options/:royaltyOptionId` | deleteOption | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/pos-royalty/applicable` | getApplicableRules | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/pos-royalty/giftable-products/:tenantProductGroupId` | getGiftableProducts | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/pos-royalty/analytics/:tenantId` | getRoyaltyAnalytics | Cualquier autenticado | TenantScope en el controller | R1 |

#### Promos (`/promos`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/promos/analytics/:tenantId` | getAnalytics | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/promos/:tenantId` | getTenantPromos | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/promos/defaults/:tenantId` | getActiveDefaults | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/promos/info/:promo` | getPromoInfo | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/promos` | getPromoTypes | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/promos` | createPromoWithRule | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |
| PATCH | `/promos/:id` | updatePromotion | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| DELETE | `/promos/:id` | deletePromotion | Nivel >= 3 (admin, superuser) | TenantScope en el controller | - |
| GET | `/promos/:promoId/targets` | getTargets | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/promos/applicable/:tenantId/:variantId` | getApplicable | Cualquier autenticado | TenantScope en el controller | - |

#### Returns (`/returns`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/returns` | createReturnTransaction | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/returns` | findReturns | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/returns/:id/detail` | getReturnDetail | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/returns/sale/:saleId` | getSaleRefundContext | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/returns/sale/:saleId/full-refund` | processFullRefund | Cualquier autenticado | TenantScope en el controller | R1 |

#### Sale (`/sale`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/sale` | getSaleConditions | Cualquier autenticado | No aplica (catalogo global) | - |
| POST | `/sale` | createFullSale | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | - |
| GET | `/sale/tenant/all` | getAllSalesByTenant | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/sale/:branch_id` | getAllSalesByBranch | Cualquier autenticado | Paginador con tenantField (tenant de la sesion) | R1 |

#### SaleItem (`/items`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/items/:sale_id` | getItems | Cualquier autenticado | TenantScope en el controller | - |
| GET | `/items/item/:id` | getItem | Cualquier autenticado | TenantScope en el controller | - |
| DELETE | `/items/:id` | deleteItem | Rol exacto: admin o superuser | TenantScope en el controller | - |

### Compras

#### Disputes (`/purchase/disputes`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/purchase/disputes` | create | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/disputes` | listByOrder | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/disputes/:id/resolve` | resolve | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### PaymentAlerts (`/payment-alerts`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/payment-alerts` | findAll | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/payment-alerts/stats` | getStats | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/payment-alerts/config` | getConfig | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/payment-alerts/config` | upsertConfig | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/payment-alerts/generate` | generate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/payment-alerts/:id/resolve` | resolve | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### Purchase (`/purchase`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/purchase` | createPurchaseOrder | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/twm` | threeWayMatching | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/payment` | registerPayment | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/payment/:id` | updatePayment | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase` | getAllPurchaseOrders | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/purchase/catalogs` | getPurchaseCatalogs | Cualquier autenticado | No aplica (catalogo global) | - |
| GET | `/purchase/exchange-rate` | getExchangeRate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/purchase/payables` | getAccountsPayable | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/purchase/supplier-credits` | listSupplierCredits | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/supplier-credits/:id/apply` | applySupplierCredit | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/:id/goods-receipt` | startGoodsReceipt | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/goods-receipt/:goodsReceiptId` | getGoodsReceipt | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/goods-receipt/:goodsReceiptId` | updateGoodsReceiptItems | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/goods-receipt/:goodsReceiptId/confirm` | confirmGoodsReceipt | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| DELETE | `/purchase/goods-receipt/:goodsReceiptId` | cancelGoodsReceipt | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/purchase/disputes` | createDispute | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/disputes` | listDisputesByQuery | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/:id/disputes` | listDisputes | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/disputes/:disputeId/resolve` | resolveDispute | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/:id/matching` | getThreeWayMatching | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/purchase/:id` | getPurchaseOrderById | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/:id/status` | updateOrderStatus | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/invoices/:invoiceId` | updateSupplierInvoice | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/purchase/:id` | update | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### Suppliers (`/suppliers`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/suppliers` | createSupplier | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/suppliers/bulk` | createSuppliersBulk | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/suppliers` | getAllSuppliers | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/suppliers/:id` | getSupplierById | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/suppliers/:id` | updateSupplier | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| DELETE | `/suppliers/:id` | deleteSupplier | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

### Inventario

#### Warehouse (`/warehouse`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/warehouse` | createWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| DELETE | `/warehouse/:warehouse_id` | deleteWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/warehouse/:warehouse_id` | updateWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/warehouse/inventory/:warehouse_id/aggregated` | listInventoryAggregated | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/inventory/:warehouse_id` | listInventoryByWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| PATCH | `/warehouse/inventory/:inventory_id` | updateInventoryItem | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| DELETE | `/warehouse/inventory/:inventory_id` | deleteInventoryItem | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/warehouse/inventory/bulk` | bulkInsertInventory | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/warehouse/transfer-request` | listTransferRequests | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/transfer` | listTransfers | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/transfer/:id` | getTransferDetail | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/transfer-request/:id` | getTransferRequestDetail | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| POST | `/warehouse/product` | addProductToWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/warehouse/tenant` | getAllWarehouses | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/expiring` | getExpiringProducts | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/:warehouse_id/stock` | getStockByWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| POST | `/warehouse/count` | countAllProductsInWarehouse | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/warehouse/discrepancy-report` | generateDiscrepancyReport | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/warehouse/discrepancy-report/:warehouse_id` | getAllDiscrepancyReports | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| GET | `/warehouse/discrepancy-report/id/:report_id` | getDiscrepancyReportById | Cualquier autenticado | Sesion; tenant llega al SQL | - |
| PATCH | `/warehouse/discrepancy-report/:report_id/apply` | applyDiscrepancyAdjustment | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/warehouse/transfer-request/:id/status` | updateTransferRequestStatus | Cualquier autenticado | Sesion; tenant llega al SQL | R2, R1 |
| POST | `/warehouse/disaggregate` | disaggregateLote | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/warehouse/transfer` | transferInventoryBetweenWarehouses | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

### Recursos humanos

#### Beneficiaries (`/beneficiaries`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/beneficiaries` | create | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/beneficiaries/:beneficiaryId/validate` | validate | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/beneficiaries/:employeeId/claim-window` | claimWindow | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/beneficiaries/:employeeId/distribute` | distribute | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/beneficiaries/:employeeId` | list | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Clocking (`/clocking`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/clocking/branch/:branchId` | getClockingByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/clocking/employee/:employeeId` | getClockingByEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/clocking` | clockIn | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/clocking` | clockOut | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/clocking/manual-in` | manualClockIn | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/clocking/manual-out` | manualClockOut | Cualquier autenticado | TenantScope en el controller | R1 |

#### Concept (`/concept`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/concept/:tenantId` | getConceptsByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/concept/provision` | provisionDefaults | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/concept` | createConcept | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/concept/:conceptId` | updateConcept | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/concept/:conceptId/soft-delete` | softDeleteConcept | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/concept/:conceptId/reactivate` | reactivateConcept | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/concept/:conceptId` | deleteConcept | Cualquier autenticado | TenantScope en el controller | R1 |

#### Contract (`/contract`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/contract/schedules` | getPaymentSchedules | Cualquier autenticado | No aplica (catalogo global) | - |
| GET | `/contract/:id` | getContractById | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/contract/:id` | updateContractTerms | Cualquier autenticado | TenantScope en el controller | R1 |

#### Deductions (`/deductions`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/deductions` | create | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| GET | `/deductions/union-remittance` | unionRemittance | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/deductions/:employeeId/available-margin` | availableMargin | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| GET | `/deductions/:employeeId/settlement-compensation` | settlementCompensation | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| GET | `/deductions/:employeeId` | listByEmployee | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| PATCH | `/deductions/:id` | update | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/deductions/:id/apply` | apply | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### DutiesType (`/duties-type`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/duties-type` | listByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/duties-type` | create | Nivel >= 2 (manager, admin, superuser) | Corregido T1 (validado en servicio/controller) | T1 |
| PATCH | `/duties-type/:id` | update | Nivel >= 2 (manager, admin, superuser) | Corregido T1 (validado en servicio/controller) | T1 |
| DELETE | `/duties-type/:id` | remove | Nivel >= 2 (manager, admin, superuser) | Corregido T1 (validado en servicio/controller) | T1 |

#### Employee (`/employee`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/employee/user/:user_id` | getEmployeeByUserId | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/employee/availability` | checkAvailability | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/employee/:tenant_id` | getEmployeesByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/employee/detail/:id` | getEmployeeById | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/employee` | createEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/employee/:id` | updateEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/employee/:id/terminate` | terminateEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/employee/:id/termination` | updateTermination | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/employee/deactivate/:id` | deactivateEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/employee/:id` | deleteEmployee | Cualquier autenticado | TenantScope en el controller | R1 |

#### Foul (`/foul`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/foul` | createFoul | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/foul/employee/:employeeId` | getFoulsByEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/foul/branch/:branchId` | getFoulsByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/foul/period` | getFoulsByPeriod | Cualquier autenticado | TenantScope en el controller | R1 |

#### Holidays (`/holidays`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/holidays/check` | check | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/holidays/declared-count` | declaredCount | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/holidays` | list | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/holidays` | create | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Incapacity (`/incapacity`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/incapacity/branch/:branchId` | getIncapacitiesByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/incapacity/employee/:employeeId` | getIncapacitiesByEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| POST | `/incapacity` | registerIncapacity | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/incapacity/:id` | updateIncapacityRegister | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/incapacity/:id/close` | closeIncapacityRegister | Cualquier autenticado | TenantScope en el controller | R1 |

#### Journey (`/journey`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/journey/limits/:contractId` | limitsByContract | Cualquier autenticado | Corregido T4 (validado en servicio/controller) | T4, R1 |
| GET | `/journey/limits` | limits | Cualquier autenticado | No aplica (calculo sin datos) | - |
| POST | `/journey/classify` | classify | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/journey/night-bonus/:employeeId` | nightBonus | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/journey/overtime-pay/:employeeId` | overtimePay | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/journey/holiday-pay/:employeeId` | holidayPay | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Overtime (`/overtime`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/overtime` | create | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/overtime/validate` | validate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/overtime/accumulated/:employeeId` | accumulated | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/overtime/:employeeId` | listByEmployee | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Mora (`/mora`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/mora/calculate` | calculate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/mora/nature` | nature | Cualquier autenticado | No aplica (calculo sin datos) | - |
| POST | `/mora/salary-minimum-difference` | salaryMinimumDifference | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Parameters (`/payroll-parameters`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/payroll-parameters` | list | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/payroll-parameters/resolve/:key` | resolve | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/payroll-parameters/missing` | missing | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/payroll-parameters` | create | Nivel >= 3 (admin, superuser) | Sesion; tenant llega al SQL | - |

#### Payroll (`/payroll`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/payroll/create` | createPaysheet | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/payroll/:id/process` | processPayroll | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### PayrollMovements (`/movements`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/movements/paysheet/:paysheetId` | getPayrollMovementsByPaysheet | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/movements/detail/:detailId` | getPayrollMovementsByDetail | Cualquier autenticado | TenantScope en el controller | R1 |

#### Paysheet (`/paysheet`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/paysheet/find` | getPaysheetByPeriod | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/paysheet/tenant/:tenantId` | getPaysheetsByTenant | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/paysheet/branch/:branchId` | getPaysheetByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/paysheet/:paysheetId` | getPaysheetById | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/paysheet/:paysheetId/details` | getPaysheetDetails | Cualquier autenticado | TenantScope en el controller | R1 |

#### ProfitSharing (`/profit-sharing`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/profit-sharing/periods` | createPeriod | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/profit-sharing/periods/:id/liquid-benefits` | setLiquidBenefits | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| PATCH | `/profit-sharing/periods/:id` | updatePercentage | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/profit-sharing/periods/:id/calculate` | calculate | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/profit-sharing/periods/:id/close` | close | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/profit-sharing/periods/:id/details/:employeeId` | detailByEmployee | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/profit-sharing/periods/:id/details` | details | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/profit-sharing/periods/:id/preview` | preview | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/profit-sharing/periods` | listPeriods | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/profit-sharing/periods/:id` | getPeriod | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/profit-sharing/fraction/:employeeId` | fraction | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/profit-sharing/year-end-bonus/preview/:employeeId` | yearEndBonusPreview | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| POST | `/profit-sharing/year-end-bonus` | payYearEndBonus | Cualquier autenticado | Corregido T3 (validado en servicio/controller) | T3, R1 |
| GET | `/profit-sharing/year-end-bonus` | listYearEndBonus | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Reporting (`/reporting`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/reporting/profitability/product/:tenantId` | getProfitabilityByProduct | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/profitability/sale/:tenantId` | getProfitabilityBySale | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/income-statement/:tenantId` | getIncomeStatement | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/expenses/by-category/:tenantId` | getExpenseSummaryByCategory | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/expenses/fixed-vs-variable/:tenantId` | getExpenseFixedVsVariable | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/expenses/monthly-trend/:tenantId` | getExpenseMonthlyTrend | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/sales-by-seller/:tenantId` | getSalesBySeller | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/kpis/:tenantId` | getFinancialKpis | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/reporting/trial-balance/:tenantId` | getTrialBalance | Cualquier autenticado | TenantScope en el controller | R1 |

#### SalaryHistory (`/salary-history`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/salary-history/employee/:employeeId` | listByEmployee | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/salary-history` | create | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### Salary (`/salary`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/salary/:employeeId/normal` | getNormal | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/salary/:employeeId/integral` | getIntegral | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

#### Settlement (`/settlement`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/settlement/indemnity-applies` | indemnityApplies | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/settlement/preview/:employeeId` | preview | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/settlement/overdue` | overdue | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/settlement` | create | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/settlement/:id/pay` | pay | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/settlement/:id/void` | void_ | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/settlement/:id/receipt` | receipt | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/settlement/:id` | getById | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |

#### Severance (`/severance`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/severance/additional-days` | additionalDays | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/severance/retroactive-preview` | retroactivePreview | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/severance/calculate` | calculatePreview | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/severance/calculate/:employeeId` | calculate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/severance/deposits/generate` | generateDeposits | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/severance/deposits/:employeeId/pending` | pendingDeposits | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/severance/deposits/:employeeId` | listDeposits | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| PATCH | `/severance/deposits/:depositId` | updateDeposit | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/severance/interest/rate` | interestRate | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/severance/interest/generate` | generateInterest | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/severance/interest/settle` | settleInterest | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |
| GET | `/severance/interest/:employeeId` | listInterest | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |
| GET | `/severance/advances/:employeeId/available` | availableAdvance | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |
| POST | `/severance/advances` | createAdvance | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |
| POST | `/severance/advances/:advanceId/approve` | approveAdvance | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| POST | `/severance/advances/:advanceId/reject` | rejectAdvance | Cualquier autenticado | Sesion; verificacion de pertenencia en el servicio | R1 |
| GET | `/severance/advances/:employeeId` | listAdvances | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |
| GET | `/severance/balance/:employeeId` | balance | Cualquier autenticado | Corregido T2 (validado en servicio/controller) | T2, R1 |

#### Suspention (`/suspention`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/suspention` | registerNewSuspention | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/suspention/employee/:employeeId` | getSuspentionByEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/suspention/branch/:branchId` | getSuspentionsByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/suspention/:suspentionId/close` | closeSuspention | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/suspention/:suspentionId` | updateSuspention | Cualquier autenticado | TenantScope en el controller | R1 |

#### Tardiness (`/tardiness`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/tardiness/employee/:employeeId` | getTardinessByEmployee | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tardiness/branch/:branchId` | getTardinessByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/tardiness/period` | getTardinessByDateRange | Cualquier autenticado | TenantScope en el controller | R1 |

#### Turns (`/turns`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| POST | `/turns` | createTurn | Cualquier autenticado | TenantScope en el controller | R1 |
| GET | `/turns/branch/:branchId` | getTurnsByBranch | Cualquier autenticado | TenantScope en el controller | R1 |
| PATCH | `/turns/:turnId` | updateTurn | Cualquier autenticado | TenantScope en el controller | R1 |
| DELETE | `/turns/:turnId` | deleteTurn | Cualquier autenticado | TenantScope en el controller | R1 |

#### Vacations (`/vacations`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/vacations/entitlement/:employeeId` | entitlementByEmployee | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/entitlement` | entitlement | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/vacations/bonus-entitlement` | bonusEntitlement | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/vacations/fraction` | fraction | Cualquier autenticado | No aplica (calculo sin datos) | - |
| GET | `/vacations/settlement-preview/:employeeId` | settlementPreview | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/vacations/periods/generate` | generatePeriods | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/periods/:employeeId/pending` | pendingPeriods | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/periods/:employeeId` | listPeriods | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/vacations/periods/:periodId/enjoy` | enjoy | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/periods/:periodId/amount` | amount | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/periods/:periodId/bonus-amount` | bonusAmount | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| POST | `/vacations/periods/:periodId/pay-bonus` | payBonus | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |
| GET | `/vacations/pending-value/:employeeId` | pendingValue | Cualquier autenticado | Sesion; tenant llega al SQL | R1 |

### Finanzas

#### Accounting (`/accounting`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/accounting/account-types` | getAccountTypes | Rol exacto:  | No aplica (catalogo global) | - |
| GET | `/accounting/source-types` | getSourceTypes | Rol exacto:  | No aplica (catalogo global) | - |
| GET | `/accounting/entry-statuses` | getJournalEntryStatuses | Rol exacto:  | No aplica (catalogo global) | - |
| GET | `/accounting/accounts` | getAccounts | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/accounting/accounts/:id` | getAccountById | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| POST | `/accounting/accounts` | createAccount | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| PATCH | `/accounting/accounts/:id` | updateAccount | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| POST | `/accounting/accounts/provision` | provisionAccounts | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/accounting/cost-centers` | getCostCenters | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/accounting/cost-centers/:id` | getCostCenterById | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| POST | `/accounting/cost-centers` | createCostCenter | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| PATCH | `/accounting/cost-centers/:id` | updateCostCenter | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/accounting/journal-entries` | getJournalEntries | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/accounting/journal-entries/:id` | getJournalEntryById | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| POST | `/accounting/journal-entries` | createJournalEntry | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| POST | `/accounting/journal-entries/:id/void` | voidJournalEntry | Rol exacto:  | Sesion; tenant llega al SQL | R1 |

#### Accounts (`/finances/accounts`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/finances/accounts` | getAccountsOverview | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/finances/accounts/payables` | getPayablesList | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/finances/accounts/receivables` | getReceivablesList | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/finances/accounts/payable/:id/payments` | getPayablePayments | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/finances/accounts/receivable/:id/collections` | getReceivableCollections | Rol exacto:  | Sesion; tenant llega al SQL | R1 |

#### CashFlow (`/finances/cash-flow`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/finances/cash-flow` | getCashFlow | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/finances/cash-flow/projections` | getProjections | Rol exacto:  | Sesion; tenant llega al SQL | R1 |

#### Expense (`/expense`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/expense/categories/:tenantId` | getCategoriesByTenant | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/categories/:tenantId/:categoryId` | getCategoryById | Rol exacto:  | TenantScope en el controller | R1 |
| POST | `/expense/categories` | createCategory | Rol exacto:  | TenantScope en el controller | R1 |
| PATCH | `/expense/categories/:tenantId/:categoryId` | updateCategory | Rol exacto:  | TenantScope en el controller | R1 |
| POST | `/expense/categories/provision/:tenantId` | provisionCategories | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/analytics/fixed-vs-variable/:tenantId` | getAnalyticsFixedVsVariable | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/analytics/fixed-breakdown/:tenantId` | getAnalyticsFixedBreakdown | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/analytics/variable-breakdown/:tenantId` | getAnalyticsVariableBreakdown | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/analytics/sales-vs-expenses/:tenantId` | getAnalyticsSalesVsExpenses | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/analytics/payroll/:tenantId` | getAnalyticsPayroll | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/history` | getExpensesHistory | Rol exacto:  | Sesion; tenant llega al SQL | R1 |
| GET | `/expense/:tenantId` | getExpensesByTenant | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/:tenantId/branch/:branchId` | getExpensesByBranch | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/:tenantId/detail/:expenseId` | getExpenseById | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/:tenantId/range` | getExpensesByDateRange | Rol exacto:  | TenantScope en el controller | R1 |
| POST | `/expense` | createExpense | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/expense/fiscal-periods/:tenantId` | getFiscalPeriods | Rol exacto:  | TenantScope en el controller | R1 |
| POST | `/expense/fiscal-periods` | createFiscalPeriod | Rol exacto:  | TenantScope en el controller | R1 |
| PATCH | `/expense/fiscal-periods/:tenantId/:periodId/close` | closeFiscalPeriod | Rol exacto:  | TenantScope en el controller | R1 |

#### IvaWithholding (`/iva/withholdings`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/iva/withholdings/config/:tenantId` | getConfig | Rol exacto:  | TenantScope en el controller | R1 |
| PUT | `/iva/withholdings/config/:tenantId/agent` | setAgent | Rol exacto:  | TenantScope en el controller | R1 |
| PUT | `/iva/withholdings/config/:tenantId/suppliers/:supplierId` | setSupplierPercentage | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/iva/withholdings/candidates/:tenantId` | listCandidates | Rol exacto:  | TenantScope en el controller | R1 |
| GET | `/iva/withholdings/:tenantId` | list | Rol exacto:  | TenantScope en el controller | R1 |
| POST | `/iva/withholdings/:tenantId` | issue | Rol exacto:  | TenantScope en el controller | R1 |
| PATCH | `/iva/withholdings/:tenantId/:withholdingId/void` | void | Rol exacto:  | TenantScope en el controller | R1 |

#### Iva (`/iva`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/iva/summary/:tenantId` | getSummary | Rol exacto:  | TenantScope en el controller | R1 |

#### Loyalty (`/finances/loyalty`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/finances/loyalty/overview` | getOverview | Rol exacto:  | Sesion; tenant llega al SQL | R1 |

#### Profitability (`/finances/profitability`)

| Metodo | Ruta | Handler | Rol / nivel requerido | Aislamiento por tenant | Hallazgo |
|---|---|---|---|---|---|
| GET | `/finances/profitability` | getProfitability | Rol exacto:  | Sesion; tenant llega al SQL | R1 |

## 8. Metodologia y limites

1. Se extrajeron con el compilador de TypeScript todas las rutas de los 76 controllers: metodo HTTP, ruta, guards y decoradores de rol/nivel a nivel de clase y de metodo (el del metodo prevalece, como en `getAllAndOverride`).
2. Para cada handler se siguio la cadena controller, servicio y consulta SQL hasta tres niveles, y se comprobo si el tenant de la sesion llega al SQL o si hay una verificacion de pertenencia (`assertOwns`, `getEmployee(id, tenantId)`, comparacion de `tenant_id`).
3. Las rutas sin esa senal, las que reciben ids de empleado o contrato y las de RRHH con filtro parcial se leyeron una a una. De ahi salen T1 a T5. Las clasificadas como "tenant llega al SQL" son deteccion estatica: indican que el dato esta disponible, no prueban que cada consulta por id lo use.
4. No se ejecuto el backend ni se probaron las rutas contra una base de datos. Las correcciones de T1 a T5 se verifican con `src/contexts/hr/hr-employee-ownership.spec.ts` (dos tenants, recurso del tenant B pedido con la sesion del tenant A, se espera 404 sin consultar datos); R2 sigue sin corregir.
5. No se auditaron los permisos a nivel de columna ni la capa de base de datos (no hay RLS en PostgreSQL; el aislamiento es solo de aplicacion).
