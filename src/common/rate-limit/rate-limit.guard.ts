import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  RATE_LIMIT_TIERS,
  RateLimitTierName,
  defaultTierFor,
  limitMultiplier,
} from './rate-limit.config';
import {
  RATE_LIMIT_KEY,
  RateLimitMetadata,
  RateLimitRequest,
} from './rate-limit.decorator';
import { RateLimitStore } from './rate-limit.store';
import { ipBucket } from './client-ip';

interface Check {
  scope: 'ip' | 'user' | 'identity';
  key: string;
  limit: number;
}

type RequestWithUser = Request & RateLimitRequest & { user?: IUserSession };

/**
 * Limitador por IP, usuario e identificador. Debe declararse DESPUES de
 * `AuthenticationGuard` (`@UseGuards(AuthenticationGuard, RateLimitGuard)`),
 * porque el cubo por usuario sale de `request.user`. En rutas publicas se
 * declara solo y limita por IP (y por identificador si la ruta define uno).
 *
 * Un request rechazado igual cuenta contra el cupo, de modo que insistir no
 * ayuda. Los rechazos devuelven 429 con `Retry-After`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return true;

    const meta = this.reflector.getAllAndOverride<
      RateLimitMetadata | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (meta?.skip) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const res = http.getResponse<Response>();

    const tierName: RateLimitTierName =
      meta?.tier ?? defaultTierFor(req.method);
    const tier = RATE_LIMIT_TIERS[tierName];
    const factor = limitMultiplier();
    const scale = (n: number) => Math.max(1, Math.ceil(n * factor));

    const ip = ipBucket(req.ip ?? req.socket?.remoteAddress);
    const checks: Check[] = [
      { scope: 'ip', key: `${tierName}:ip:${ip}`, limit: scale(tier.ip) },
    ];
    if (req.user?.user_id) {
      checks.push({
        scope: 'user',
        key: `${tierName}:user:${req.user.user_id}`,
        limit: scale(tier.user),
      });
    }
    const identity = meta?.identity?.(req);
    if (identity && 'identity' in tier && tier.identity) {
      checks.push({
        scope: 'identity',
        key: `${tierName}:id:${identity}`,
        limit: scale(tier.identity),
      });
    }

    if (process.env.RATE_LIMIT_DEBUG === 'true') {
      this.logger.debug(
        `tier=${tierName} ip=${ip} ip_raw=${req.ip} xff=${String(req.headers['x-forwarded-for'])} user=${req.user?.user_id ?? '-'}`,
      );
    }

    // Se cuentan TODOS los cubos (sin cortar en el primero que falla) para que
    // los contadores no se desfasen entre si.
    let tightest: { limit: number; remaining: number; resetAt: number } | null =
      null;
    let blocked: { check: Check; resetAt: number } | null = null;
    for (const check of checks) {
      const { count, resetAt } = this.store.hit(check.key, tier.windowMs);
      const remaining = Math.max(0, check.limit - count);
      if (!tightest || remaining < tightest.remaining) {
        tightest = { limit: check.limit, remaining, resetAt };
      }
      if (count > check.limit) {
        if (count === check.limit + 1) {
          this.logger.warn(
            `Limite excedido tier=${tierName} cubo=${check.scope} ${check.scope === 'ip' ? `ip=${ip}` : ''} ${req.method} ${req.path}`.trim(),
          );
        }
        if (!blocked || resetAt > blocked.resetAt) blocked = { check, resetAt };
      }
    }

    if (tightest) {
      res.setHeader('RateLimit-Limit', String(tightest.limit));
      res.setHeader('RateLimit-Remaining', String(tightest.remaining));
      res.setHeader(
        'RateLimit-Reset',
        String(Math.max(0, Math.ceil((tightest.resetAt - Date.now()) / 1000))),
      );
    }

    if (blocked) {
      const retryAfter = Math.max(
        1,
        Math.ceil((blocked.resetAt - Date.now()) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Demasiadas solicitudes. Intenta de nuevo en ${retryAfter} segundos.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
