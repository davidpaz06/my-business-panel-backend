import { Response } from 'express';
import type { IAuthTokens } from '@/contexts/general/modules/auth/auth.service';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 min, en linea con JWT_ACCESS_EXPIRATION
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dias, en linea con JWT_REFRESH_EXPIRATION

function isCrossSite(): boolean {
  return ['production', 'staging'].includes(process.env.NODE_ENV ?? '');
}

export function setAuthCookies(response: Response, tokens: IAuthTokens): void {
  const crossSite = isCrossSite();
  response.cookie('auth_token', tokens.access_token, {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  response.cookie('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function clearAuthCookies(response: Response): void {
  const crossSite = isCrossSite();
  const options = {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? ('none' as const) : ('lax' as const),
  };
  response.clearCookie('auth_token', options);
  response.clearCookie('refresh_token', options);
}
