import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change_password.dto';
import { InvalidCredentialsError } from '@/common/errors/invalid_credentials.error';
import { InvalidSessionError } from '@/common/errors/invalid_session.error';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '@/contexts/general/modules/user/user.service';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { compare, hash } from 'bcrypt';
import { generalQueries } from '@general/general.queries';

const { refreshToken: refreshTokenQueries, users } = generalQueries;

const REFRESH_TOKEN_HASH_ROUNDS = 10;

export interface IAuthTokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwtService: JwtService,
    private readonly usersService: UserService,
    private readonly stateService: StateService,
  ) {}

  private async validatePassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return compare(plainPassword, hashedPassword);
  }

  private generateAccessToken(userSession: IUserSession): Promise<string> {
    return this.jwtService.signAsync(userSession, {
      secret: this.stateService.getConstant<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.stateService.getConstant('JWT_ACCESS_EXPIRATION'),
    });
  }

  private generateRefreshToken(userSession: IUserSession): Promise<string> {
    return this.jwtService.signAsync(
      { user_id: userSession.user_id },
      {
        secret: this.stateService.getConstant<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.stateService.getConstant('JWT_REFRESH_EXPIRATION'),
      },
    );
  }

  private hashToken(token: string): Promise<string> {
    return hash(token, REFRESH_TOKEN_HASH_ROUNDS);
  }

  private async saveRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = await this.hashToken(refreshToken);
    const { exp } = this.jwtService.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(exp * 1000);
    await this.db.query(refreshTokenQueries.create, [
      userId,
      tokenHash,
      expiresAt,
    ]);
  }

  private async issueTokens(userSession: IUserSession): Promise<IAuthTokens> {
    const [access_token, refresh_token] = await Promise.all([
      this.generateAccessToken(userSession),
      this.generateRefreshToken(userSession),
    ]);
    await this.saveRefreshToken(userSession.user_id, refresh_token);
    return { access_token, refresh_token };
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ user: IUserSession; tokens: IAuthTokens }> {
    const { email, password } = loginDto;
    const storedUser = await this.usersService.getUserByEmail(email);
    if (!storedUser || !storedUser.password_hash) {
      throw new InvalidCredentialsError();
    }

    const validPassword = await this.validatePassword(
      storedUser.password_hash,
      password,
    );

    if (!validPassword) throw new InvalidCredentialsError();

    const userSession: IUserSession = {
      user_id: storedUser.user_id,
      email: email,
      tenant_id: storedUser.tenant_id,
      role_id: storedUser.role_id,
    };
    const tokens = await this.issueTokens(userSession);
    return { user: userSession, tokens };
  }

  async refresh(refreshToken: string): Promise<IAuthTokens> {
    if (!refreshToken) throw new InvalidSessionError('INVALID');

    let payload: { user_id: string };
    try {
      payload = await this.jwtService.verifyAsync<{ user_id: string }>(
        refreshToken,
        { secret: this.stateService.getConstant<string>('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new InvalidSessionError('INVALID');
    }

    const { rows } = await this.db.query(refreshTokenQueries.activeByUser, [
      payload.user_id,
    ]);

    let matchedTokenId: string | undefined;
    for (const row of rows) {
      const matches = await compare(refreshToken, row.token_hash);
      if (matches) {
        matchedTokenId = row.refresh_token_id;
        break;
      }
    }

    if (!matchedTokenId) {
      // token reused after revocation, or never existed: revoke everything
      // the user currently has as a precaution against token theft/replay.
      await this.db.query(refreshTokenQueries.revokeAllByUser, [
        payload.user_id,
      ]);
      throw new InvalidSessionError('INVALID');
    }

    const storedUser = await this.usersService.getUserById(payload.user_id);
    if (!storedUser) throw new InvalidSessionError('INVALID');

    const userSession: IUserSession = {
      user_id: storedUser.user_id,
      email: storedUser.email,
      tenant_id: storedUser.tenant_id,
      role_id: storedUser.role_id,
    };

    await this.db.query(refreshTokenQueries.revokeById, [matchedTokenId]);
    return this.issueTokens(userSession);
  }

  /**
   * Cambia la clave del propio usuario. Revoca todos sus refresh tokens y emite
   * un par nuevo para que la sesion actual no se cierre.
   */
  async changePassword(
    userSession: IUserSession,
    dto: ChangePasswordDto,
  ): Promise<IAuthTokens> {
    const { rows } = await this.db.query(users.passwordHashById, [
      userSession.user_id,
    ]);
    const storedHash: string | undefined = rows[0]?.password_hash;
    if (!storedHash) throw new InvalidSessionError('INVALID');

    const validCurrent = await this.validatePassword(
      storedHash,
      dto.current_password,
    );
    if (!validCurrent) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    if (await this.validatePassword(storedHash, dto.new_password)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    const newHash = await hash(
      dto.new_password,
      this.stateService.getConstant<number>('PASSWORD_SALT_ROUNDS'),
    );
    await this.db.query(users.updatePassword, [newHash, userSession.user_id]);
    await this.db.query(refreshTokenQueries.revokeAllByUser, [
      userSession.user_id,
    ]);
    return this.issueTokens(userSession);
  }

  async logout(userId: string): Promise<void> {
    await this.db.query(refreshTokenQueries.revokeAllByUser, [userId]);
  }
}
