/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IRequestWithCookies } from '@/common/interfaces/request_with_cookies.interface';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { InvalidSessionError } from '@/common/errors/invalid_session.error';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { generalQueries } from '@general/general.queries';

const { users } = generalQueries;

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly stateService: StateService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as IRequestWithCookies;
    const token = request.cookies['auth_token'];

    if (!token) throw new InvalidSessionError();
    let decodedToken: IUserSession;
    try {
      decodedToken = await this.jwtService.verifyAsync<IUserSession>(token, {
        secret: this.stateService.getConstant<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      console.error('Access denied: invalid or expired token');
      throw new InvalidSessionError('UNAUTHORIZED');
    }

    // Revalida contra la BD en cada request: un usuario desactivado o con el
    // rol cambiado pierde acceso de inmediato aunque su access token siga
    // vigente (el JWT decodificado por si solo no refleja cambios recientes).
    const { rows } = await this.db.query(users.byId, [decodedToken.user_id]);
    const freshUser = rows[0];
    if (!freshUser) {
      console.error('Access denied: user no longer exists');
      throw new InvalidSessionError('UNAUTHORIZED');
    }

    request.user = {
      user_id: freshUser.user_id,
      email: freshUser.email,
      tenant_id: freshUser.tenant_id,
      role_id: freshUser.role_id,
    } as IUserSession;

    return true;
  }
}
