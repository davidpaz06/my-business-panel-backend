# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Workspace context (sibling repos, cross-repo feature order, branching) lives in `../CLAUDE.md`. This file covers backend-only conventions.

**Migracion en curso (Costa Rica -> Venezuela):** el proyecto migra su normativa objetivo de Costa Rica a Venezuela (SENIAT/RIF/LOTTT/IVSS en vez de Hacienda/cedula/Codigo de Trabajo/CCSS). Ver tabla de mapeo en `../CLAUDE.md`. El codigo de este repo (e-invoicing, CABYS, HR) sigue implementando reglas de Costa Rica hasta que se readapte modulo por modulo — no asumir que ya sigue la normativa de Venezuela.

## Stack

NestJS 11 + TypeScript 5.7 + Express + PostgreSQL + JWT cookie auth + class-validator DTOs + Swagger. Stripe for subscriptions. E-invoicing (xml-crypto, node-forge, xmlbuilder2) — implementado hoy para Hacienda Costa Rica; el mecanismo de facturacion electronica de Venezuela (SENIAT) puede diferir (revisar antes de reusar este stack tal cual). Decimal.js for money — never use native `number` for amounts.

## Commands

```bash
pnpm start:dev          # watch mode
pnpm start:debug        # --inspect
pnpm start:prod         # node dist/main (run pnpm build first)
pnpm start:staging      # NODE_ENV=staging
pnpm build              # nest build
pnpm lint               # eslint --fix on {src,apps,libs,test}/**/*.ts
pnpm test               # jest (unit, *.spec.ts under src/)
pnpm test:watch
pnpm test:cov
pnpm test:debug         # node --inspect-brk + ts-node
pnpm test:e2e           # jest --config ./test/jest-e2e.json
pnpm test path/to/file.spec.ts        # single file
pnpm test -t "describe or it name"    # single named test

# CABYS catalog loaders (Costa Rica product tax codes — legado, pendiente de reemplazo por catalogo fiscal Venezuela)
pnpm cabys:load                 # uses .env
pnpm cabys:load:staging         # uses .env.staging
pnpm cabys:load:dev             # uses .env.development
pnpm cabys:load:native          # ts-node native loader

pnpm deploy:local               # build + cabys:load + start:prod
```

Local DB: native PostgreSQL on `localhost:5432` (see `DATABASE_URL` in `.env.development`). No Docker. Staging runs on Render with Supabase; production on RDS. Schema source is `../my-business-panel-database/bootstrap.sql`.

## Boot / global setup (`src/main.ts`)

- Global prefix: `api/v1`.
- CORS: origins from `ALLOWED_ORIGINS` env (comma-separated, trailing slash stripped); defaults `http://localhost:5173,http://localhost:3000`; `credentials: true`.
- `cookie-parser` mounted globally (`auth_token` cookie carries JWT).
- Global `ValidationPipe({ transform: true, whitelist: true })` — DTOs strip unknown props and coerce types.
- Global `ResponseInterceptor` wraps every response in a standard envelope — frontend consumes via `ApiResponse<T>`.
- Raw body for `/subscription/webhook` (Stripe signature verification).
- Swagger at `/docs`.

## Module / folder layout

```ps
src/
  app/                        # AppModule, root controller
  common/                     # Cross-cutting building blocks
    guards/                   # AuthenticationGuard, RoleAuthorizationGuard
    decorators/               # @Session(), @RequiredRole(...)
    interceptors/             # ResponseFormatter
    errors/                   # Domain error classes
    interfaces/               # IUserSession etc.
    crypto/                   # JWT, password, signing
    utilities/
    constants/
  contexts/
    general/   pos/   purchase/   inventory/   hr/   finances/
      modules/<feature>/
        <feature>.controller.ts
        <feature>.service.ts
        <feature>.module.ts
        dto/
        interfaces/
      errors/                 # context-scoped errors
      tests/
      <context>.queries.ts    # raw SQL strings used by services
  docs/                       # in-repo dev notes
  main.ts
  queries.ts
```

Feature work goes inside `src/contexts/<context>/modules/<feature>/`. Do not invent new top-level folders. Path aliases (`tsconfig.json` + `jest.moduleNameMapper`): `@/* → src/*`, `@pos/* → src/contexts/pos/*`, `@general/*`, `@hr/*`, `@purchase/*`.

## Auth — mandatory pattern

Every protected endpoint:

```ts
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole('admin')
@Post()
create(@Body() dto: CreateThingDto, @Session() user: IUserSession) {
  return this.service.create(dto, user.tenant_id);
}
```

- `AuthenticationGuard` (`src/common/guards/authentication.guard.ts`) — reads `auth_token` cookie, verifies JWT, populates `request.user: IUserSession` (`user_id`, `tenant_id`, `role_id`).
- `RoleAuthorizationGuard` (`src/common/guards/role_authorization.guard.ts`) — reads `@RequiredRole(...names)` metadata, resolves `role_name` via `StateService.getRole(role_id)`.
- `@RequiredRole(...roleNames: string[])` — `src/common/decorators/role_metadata.decorator.ts`.
- `@Session()` — `src/common/decorators/session.decorator.ts`.
- Auth-only (any authed user): `@UseGuards(AuthenticationGuard)` at class level, omit `RoleAuthorizationGuard`.
- Exact `role_name` strings live in `../my-business-panel-database/seeds/catalog/general/005-insert-roles.sql`. `role_id 4 = employee`. Verify the seed before using a new role name.
- Never invent an alternative auth flow — match this stack.

## Rate limiting

`RateLimitGuard` (`src/common/rate-limit/`) counts every request in several buckets and rejects with 429 + `Retry-After` when ANY is exceeded: by **IP** (IPv6 grouped by /64), by **authenticated user** (so a user spread over many IPs is still capped) and, where the route defines one, by **identity** (login email, hash of the refresh token). Counters are in memory per process (swap `RateLimitStore` for Redis if the API scales to several instances).

- Declare it right after the auth guard: `@UseGuards(AuthenticationGuard, RateLimitGuard, ...)`. On public routes declare it alone (IP + identity only).
- The tier defaults to `read` for GET/HEAD and `write` for the rest. Override per route with `@RateLimit('bulk' | 'lookup' | 'sensitive' | 'public' | 'login' | 'refresh' | 'webhook')`; limits live in `rate-limit.config.ts`. `@SkipRateLimit()` needs a written justification.
- `rate-limit-coverage.spec.ts` fails if a controller of a covered context lacks the guard or has it before `AuthenticationGuard`. Add each context to `COVERED_CONTEXTS` when it is done.
- Env: `TRUST_PROXY_HOPS` (proxies in front of Express, default 1; must match the platform or every user shares one IP bucket, or `X-Forwarded-For` becomes spoofable), `RATE_LIMIT_MULTIPLIER` (scale all limits), `RATE_LIMIT_DISABLED=true` (off), `RATE_LIMIT_DEBUG=true` (logs resolved IP and `X-Forwarded-For`, used to measure the hop count).

## Multi-tenancy

Every domain row is scoped by `tenant_id`. Pull it from `@Session() user` and pass into the service. **Never** accept a `tenant_id` from a client body or query string. Every query that touches tenant data must include `WHERE tenant_id = $X`.

## DTOs

`class-validator` + `class-transformer`. Common decorators: `@IsNotEmpty`, `@IsUUID`, `@IsOptional`, `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsEnum`, `@Type(() => Date)`, `@ValidateNested`. Representative example: `src/contexts/pos/modules/sale/dto/sales.dto.ts`. Global `ValidationPipe` already strips unknown props (`whitelist`) and coerces types (`transform`) — do not duplicate that work.

## Data access

The repo uses raw SQL via `@resonance-components/datahandler` (no ORM). Each context has a `<context>.queries.ts` file holding query strings. Services compose queries + run them through the shared DB client. When adding a query:

- Place the SQL string in the matching `*.queries.ts` (not inline in the service).
- Always parameterize (`$1`, `$2`, …) — never string-interpolate user input.
- Money columns: round / handle with `decimal.js`; do not cast to JS `number`.

## Async / scheduling

- `@nestjs/schedule` for cron jobs.
- E-invoice cron probe script: `scripts/test-einvoice-cron.ts`.

## Response shape

`ResponseInterceptor` wraps every controller return in:

```ts
{ success: true, data: <return value>, message?: string }
```

Throw domain errors from `src/common/errors/` (or the context's `errors/`) — the interceptor / exception filter maps them to HTTP responses with `{ success: false, message, ... }`. Frontend's `ApiResponse<T>` type mirrors this envelope.

## Tests

Jest. Unit specs live next to source as `*.spec.ts` (`testRegex: '.*\\.spec\\.ts$'`, `rootDir: src`). E2E specs under `test/` with `test/jest-e2e.json`. Run a single file with `pnpm test path/to/file.spec.ts`; a single named test with `-t "name"`.

## Lint / style

- `pnpm lint` runs `eslint --fix`. Prettier integrated via `eslint-plugin-prettier`.
- No emojis in code, comments, log strings, or commit messages.
- Spanish copy in domain text / error messages is intentional — keep it.

## DB changes from the backend side

Backend never owns schema. When a feature needs a DDL change:

1. Author the migration + schema-file edit in `../my-business-panel-database/` first (see that repo's `CLAUDE.md`).
2. Rebuild bootstrap (`build-bootstrap.ps1` in DB repo) and reset the local container if needed.
3. Then write the backend module / queries.

## Branching

Fork → personal `development` → PR into upstream `development` → merge up to `staging` → `master`. Direct push to upstream branches is forbidden. See `contributing.md`.
