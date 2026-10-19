/* eslint-disable @typescript-eslint/unbound-method */
import 'reflect-metadata';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';
import { RATE_LIMIT_TIERS } from './rate-limit.config';
import {
  RateLimit,
  SkipRateLimit,
  byBodyField,
  byCookieHash,
} from './rate-limit.decorator';

class Sample {
  plainGet() {}
  plainPost() {}
  @RateLimit('bulk')
  bulk() {}
  @RateLimit('login', { identity: byBodyField('email') })
  login() {}
  @RateLimit('refresh', { identity: byCookieHash('refresh_token') })
  refresh() {}
  @SkipRateLimit()
  skipped() {}
}

interface Opts {
  method?: string;
  ip?: string;
  user?: string;
  body?: Record<string, unknown>;
  cookies?: Record<string, string>;
}

const call = (
  guard: RateLimitGuard,
  handler: keyof Sample,
  { method = 'GET', ip = '10.0.0.1', user, body, cookies }: Opts = {},
) => {
  const headers: Record<string, string> = {};
  const req = {
    method,
    ip,
    path: '/x',
    headers: {},
    body,
    cookies,
    user: user ? { user_id: user, tenant_id: 't', role_id: 4 } : undefined,
  };
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => Sample.prototype[handler],
    getClass: () => Sample,
  } as unknown as ExecutionContext;
  const run = () => guard.canActivate(ctx);
  return { run, headers };
};

const status = (fn: () => unknown): number | 'ok' => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : 500;
  }
};

// IP distinta por indice, para que el cubo de IP nunca se llene por accidente.
const ipN = (prefix: string, i: number) =>
  `${prefix}.${Math.floor(i / 250)}.${i % 250}`;

describe('RateLimitGuard', () => {
  let store: RateLimitStore;
  let guard: RateLimitGuard;
  beforeEach(() => {
    delete process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_MULTIPLIER;
    store = new RateLimitStore();
    guard = new RateLimitGuard(new Reflector(), store);
  });
  afterEach(() => store.onModuleDestroy());

  it('GET usa el tipo read y POST el tipo write por defecto', () => {
    const readUser = RATE_LIMIT_TIERS.read.user;
    for (let i = 0; i < readUser; i++) {
      expect(
        call(guard, 'plainGet', { user: 'u1', ip: ipN('10.20', i) }).run(),
      ).toBe(true);
    }
    expect(
      status(call(guard, 'plainGet', { user: 'u1', ip: '10.20.99.99' }).run),
    ).toBe(429);

    const writeUser = RATE_LIMIT_TIERS.write.user;
    for (let i = 0; i < writeUser; i++) {
      expect(
        call(guard, 'plainPost', {
          method: 'POST',
          user: 'u2',
          ip: ipN('10.21', i),
        }).run(),
      ).toBe(true);
    }
    expect(
      status(
        call(guard, 'plainPost', {
          method: 'POST',
          user: 'u2',
          ip: '10.21.99.99',
        }).run,
      ),
    ).toBe(429);
  });

  it('un usuario repartido en muchas IPs queda frenado por el cubo de usuario', () => {
    const { user, ip } = RATE_LIMIT_TIERS.bulk;
    expect(user).toBeLessThan(ip);
    for (let i = 0; i < user; i++) {
      expect(
        call(guard, 'bulk', { user: 'atacante', ip: ipN('10.1', i) }).run(),
      ).toBe(true);
    }
    expect(
      status(call(guard, 'bulk', { user: 'atacante', ip: '10.1.99.99' }).run),
    ).toBe(429);
  });

  it('muchos usuarios desde una misma IP quedan frenados por el cubo de IP', () => {
    const { ip } = RATE_LIMIT_TIERS.bulk;
    for (let i = 0; i < ip; i++) {
      expect(call(guard, 'bulk', { user: `u${i}`, ip: '10.2.0.1' }).run()).toBe(
        true,
      );
    }
    expect(
      status(call(guard, 'bulk', { user: 'u-nuevo', ip: '10.2.0.1' }).run),
    ).toBe(429);
  });

  it('otro usuario en otra IP no se ve afectado', () => {
    for (let i = 0; i < RATE_LIMIT_TIERS.bulk.user + 1; i++) {
      status(call(guard, 'bulk', { user: 'a', ip: '10.3.0.1' }).run);
    }
    expect(call(guard, 'bulk', { user: 'b', ip: '10.3.0.2' }).run()).toBe(true);
  });

  it('login: la fuerza bruta distribuida contra un correo se frena aunque cambie la IP', () => {
    const max = RATE_LIMIT_TIERS.login.identity;
    for (let i = 0; i < max; i++) {
      expect(
        call(guard, 'login', {
          method: 'POST',
          ip: ipN('10.4', i),
          body: { email: 'Victima@Empresa.com ' },
        }).run(),
      ).toBe(true);
    }
    // otra IP, mismo correo (otro uso de mayusculas): bloqueado
    expect(
      status(
        call(guard, 'login', {
          method: 'POST',
          ip: '10.4.99.99',
          body: { email: 'victima@empresa.com' },
        }).run,
      ),
    ).toBe(429);
    // otro correo desde la misma IP sigue pudiendo entrar
    expect(
      call(guard, 'login', {
        method: 'POST',
        ip: '10.4.99.99',
        body: { email: 'otro@empresa.com' },
      }).run(),
    ).toBe(true);
  });

  it('login sin correo en el cuerpo solo cuenta por IP', () => {
    for (let i = 0; i < RATE_LIMIT_TIERS.login.ip; i++) {
      expect(
        call(guard, 'login', {
          method: 'POST',
          ip: '10.5.0.1',
          body: {},
        }).run(),
      ).toBe(true);
    }
    expect(
      status(
        call(guard, 'login', { method: 'POST', ip: '10.5.0.1', body: {} }).run,
      ),
    ).toBe(429);
  });

  it('refresh: un mismo refresh token usado desde muchas IPs se frena', () => {
    const max = RATE_LIMIT_TIERS.refresh.identity;
    for (let i = 0; i < max; i++) {
      expect(
        call(guard, 'refresh', {
          method: 'POST',
          ip: ipN('10.6', i),
          cookies: { refresh_token: 'token-robado' },
        }).run(),
      ).toBe(true);
    }
    expect(
      status(
        call(guard, 'refresh', {
          method: 'POST',
          ip: '10.6.99.99',
          cookies: { refresh_token: 'token-robado' },
        }).run,
      ),
    ).toBe(429);
  });

  it('el 429 trae Retry-After y cabeceras RateLimit', () => {
    for (let i = 0; i < RATE_LIMIT_TIERS.bulk.user; i++) {
      call(guard, 'bulk', { user: 'h', ip: ipN('10.7', i) }).run();
    }
    const blocked = call(guard, 'bulk', { user: 'h', ip: '10.7.99.99' });
    let error: HttpException | undefined;
    try {
      blocked.run();
    } catch (e) {
      error = e as HttpException;
    }
    expect(error?.getStatus()).toBe(429);
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
    expect(blocked.headers['RateLimit-Remaining']).toBe('0');
    expect((error?.getResponse() as any).message).toContain(
      'Demasiadas solicitudes',
    );
  });

  it('un request permitido informa el cupo restante mas ajustado', () => {
    const first = call(guard, 'bulk', { user: 'r', ip: '10.8.0.1' });
    first.run();
    expect(first.headers['RateLimit-Limit']).toBe(
      String(RATE_LIMIT_TIERS.bulk.user),
    );
    expect(first.headers['RateLimit-Remaining']).toBe(
      String(RATE_LIMIT_TIERS.bulk.user - 1),
    );
  });

  it('SkipRateLimit y RATE_LIMIT_DISABLED desactivan el limitador', () => {
    for (let i = 0; i < 2000; i++) {
      expect(call(guard, 'skipped', { user: 's' }).run()).toBe(true);
    }
    process.env.RATE_LIMIT_DISABLED = 'true';
    for (let i = 0; i < RATE_LIMIT_TIERS.bulk.ip * 3; i++) {
      expect(call(guard, 'bulk', { user: 'd' }).run()).toBe(true);
    }
  });

  it('RATE_LIMIT_MULTIPLIER escala los cupos', () => {
    process.env.RATE_LIMIT_MULTIPLIER = '2';
    const max = RATE_LIMIT_TIERS.bulk.user * 2;
    for (let i = 0; i < max; i++) {
      expect(call(guard, 'bulk', { user: 'm', ip: ipN('10.9', i) }).run()).toBe(
        true,
      );
    }
    expect(
      status(call(guard, 'bulk', { user: 'm', ip: '10.9.99.99' }).run),
    ).toBe(429);
  });

  it('las IPv6 del mismo /64 comparten cubo', () => {
    const { ip } = RATE_LIMIT_TIERS.bulk;
    for (let i = 0; i < ip; i++) {
      call(guard, 'bulk', {
        user: `v${i}`,
        ip: `2001:db8:1:1::${i.toString(16)}`,
      }).run();
    }
    expect(
      status(
        call(guard, 'bulk', { user: 'vz', ip: '2001:db8:1:1:aaaa::1' }).run,
      ),
    ).toBe(429);
  });
});
