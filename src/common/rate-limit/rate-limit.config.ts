/**
 * Cupos por "tipo" de ruta. Cada request se cuenta en varios cubos a la vez
 * y se rechaza si CUALQUIERA se excede:
 *  - ip:       todas las requests de una misma IP (un usuario que reparte su
 *              sesion en muchas IPs no escapa del cubo de usuario; muchos
 *              usuarios desde una IP no escapan del cubo de IP).
 *  - user:     todas las requests de un mismo usuario autenticado, venga de
 *              la IP que venga.
 *  - identity: un dato del cuerpo o de la cookie (correo en el login, hash del
 *              refresh token). Frena un ataque distribuido contra UNA cuenta.
 *
 * Las IP de oficina comparten NAT, por eso el cupo por IP es mayor que el de
 * usuario en las rutas normales.
 */
export interface RateLimitTier {
  /** Duracion de la ventana, en milisegundos. */
  windowMs: number;
  /** Requests por ventana desde una misma IP. */
  ip: number;
  /** Requests por ventana de un mismo usuario autenticado. */
  user: number;
  /** Requests por ventana para un mismo identificador (si la ruta define uno). */
  identity?: number;
}

const MINUTE = 60_000;

export const RATE_LIMIT_TIERS = {
  /** Lecturas y listados autenticados (tipo por defecto de los GET). */
  read: { windowMs: MINUTE, ip: 600, user: 300 },
  /** Escrituras autenticadas (tipo por defecto de POST, PUT, PATCH, DELETE). */
  write: { windowMs: MINUTE, ip: 150, user: 60 },
  /** Reportes y consultas agregadas pesadas (varias tablas, rangos de fechas). */
  report: { windowMs: MINUTE, ip: 90, user: 30 },
  /** Cargas masivas: pocas requests, cada una muy costosa. */
  bulk: { windowMs: MINUTE, ip: 30, user: 10 },
  /** Consultas de existencia (disponibilidad de correo, RIF, codigos): enumeracion. */
  lookup: { windowMs: MINUTE, ip: 60, user: 30 },
  /** Cambio de credenciales, alta de cuentas, facturacion, validar codigos. */
  sensitive: { windowMs: 5 * MINUTE, ip: 20, user: 10 },
  /** Rutas publicas de solo lectura (catalogos del registro). */
  public: { windowMs: MINUTE, ip: 60, user: 60 },
  /** Login: fuerza bruta; el cupo importante es el del correo, no el de la IP. */
  login: { windowMs: 15 * MINUTE, ip: 60, user: 60, identity: 8 },
  /** Renovacion de sesion: poco frecuente por cliente legitimo. */
  refresh: { windowMs: 15 * MINUTE, ip: 120, user: 60, identity: 40 },
  /** Webhooks de terceros, ya autenticados por firma. */
  webhook: { windowMs: MINUTE, ip: 600, user: 600 },
  /** Sonda de salud de la plataforma: generosa para que un chequeo frecuente no marque el servicio como caido. */
  health: { windowMs: MINUTE, ip: 600, user: 600 },
} as const satisfies Record<string, RateLimitTier>;

export type RateLimitTierName = keyof typeof RATE_LIMIT_TIERS;

/** Tipo que se usa cuando la ruta no declara `@RateLimit(...)`. */
export const defaultTierFor = (httpMethod: string): RateLimitTierName =>
  httpMethod === 'GET' || httpMethod === 'HEAD' ? 'read' : 'write';

/**
 * Factor global para ajustar los cupos sin tocar codigo (por ejemplo 2 en una
 * prueba de carga en staging). Valores invalidos se ignoran.
 */
export const limitMultiplier = (): number => {
  const raw = Number(process.env.RATE_LIMIT_MULTIPLIER);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
};
