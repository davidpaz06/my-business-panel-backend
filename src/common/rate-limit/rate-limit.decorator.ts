import { SetMetadata } from '@nestjs/common';
import { createHash } from 'crypto';
import type { RateLimitTierName } from './rate-limit.config';

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

/** Request minima que necesitan los extractores de identificador. */
export interface RateLimitRequest {
  body?: Record<string, unknown>;
  cookies?: Record<string, string>;
}

export interface RateLimitOptions {
  /**
   * Devuelve el identificador a limitar ademas de la IP y el usuario (por
   * ejemplo el correo del login). Si devuelve vacio no se aplica ese cubo.
   */
  identity?: (req: RateLimitRequest) => string | undefined;
}

export interface RateLimitMetadata extends RateLimitOptions {
  tier?: RateLimitTierName;
  skip?: boolean;
}

/** Fija el tipo de cupo de una ruta (o de todo un controller). */
export const RateLimit = (
  tier: RateLimitTierName,
  options: RateLimitOptions = {},
) =>
  SetMetadata(RATE_LIMIT_KEY, { tier, ...options } satisfies RateLimitMetadata);

/** Excluye una ruta del limitador. Usar solo con justificacion escrita. */
export const SkipRateLimit = () =>
  SetMetadata(RATE_LIMIT_KEY, { skip: true } satisfies RateLimitMetadata);

/** Identificador = campo de texto del cuerpo (normalizado a minusculas). */
export const byBodyField =
  (field: string) =>
  (req: RateLimitRequest): string | undefined => {
    const value = req.body?.[field];
    return typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase().slice(0, 254)
      : undefined;
  };

/** Identificador = hash de una cookie (nunca se guarda el valor en claro). */
export const byCookieHash =
  (cookie: string) =>
  (req: RateLimitRequest): string | undefined => {
    const value = req.cookies?.[cookie];
    return value
      ? createHash('sha256').update(value).digest('hex').slice(0, 24)
      : undefined;
  };
