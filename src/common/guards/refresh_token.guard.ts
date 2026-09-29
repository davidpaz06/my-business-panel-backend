import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { IRequestWithCookies } from '@/common/interfaces/request_with_cookies.interface';
import { InvalidSessionError } from '@/common/errors/invalid_session.error';

/**
 * Solo confirma que la cookie refresh_token viaje en la request. La firma,
 * expiracion y estado de revocacion se validan en AuthService.refresh()
 * (necesita consultar refresh_token en BD, algo que un guard sincrono no
 * puede hacer de forma limpia sin duplicar esa logica).
 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IRequestWithCookies>();
    const token = request.cookies['refresh_token'];
    if (!token) throw new InvalidSessionError('INVALID');
    return true;
  }
}
