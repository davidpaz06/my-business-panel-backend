import { Post, Controller, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthService,
  IAuthTokens,
} from '@/contexts/general/modules/auth/auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change_password.dto';
import { Response } from 'express';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RefreshTokenGuard } from '@/common/guards/refresh_token.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { IRequestWithCookies } from '@/common/interfaces/request_with_cookies.interface';
import { loginDoc, logoutDoc } from '@/docs/contexts/general/auth';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 min, en linea con JWT_ACCESS_EXPIRATION
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dias, en linea con JWT_REFRESH_EXPIRATION

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(response: Response, tokens: IAuthTokens): void {
    const isCrossSite = ['production', 'staging'].includes(
      process.env.NODE_ENV ?? '',
    );
    response.cookie('auth_token', tokens.access_token, {
      httpOnly: true,
      secure: isCrossSite,
      sameSite: isCrossSite ? 'none' : 'lax',
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isCrossSite,
      sameSite: isCrossSite ? 'none' : 'lax',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }

  private clearAuthCookies(response: Response): void {
    const isCrossSite = ['production', 'staging'].includes(
      process.env.NODE_ENV ?? '',
    );
    const options = {
      httpOnly: true,
      secure: isCrossSite,
      sameSite: isCrossSite ? ('none' as const) : ('lax' as const),
    };
    response.clearCookie('auth_token', options);
    response.clearCookie('refresh_token', options);
  }

  @ApiOperation(loginDoc.operation)
  @ApiResponse(loginDoc.responses[200])
  @ApiResponse(loginDoc.responses[401])
  @Post('/login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.login(loginDto);
    this.setAuthCookies(response, tokens);
    return { message: 'Login successful', user };
  }

  @UseGuards(RefreshTokenGuard)
  @Post('/refresh')
  async refresh(
    @Req() request: IRequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshTokenCookie = request.cookies['refresh_token'];
    const tokens = await this.authService.refresh(refreshTokenCookie);
    this.setAuthCookies(response, tokens);
    return { message: 'Token refreshed' };
  }

  @UseGuards(AuthenticationGuard)
  @Post('/change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Session() user: IUserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.changePassword(user, dto);
    this.setAuthCookies(response, tokens);
    return { message: 'Password changed successfully' };
  }

  @ApiOperation(logoutDoc.operation)
  @ApiResponse(logoutDoc.responses[200])
  @ApiResponse(logoutDoc.responses[401])
  @UseGuards(AuthenticationGuard)
  @Post('/logout')
  async logout(
    @Session() user: IUserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.user_id);
    this.clearAuthCookies(response);
    return { message: 'Logout successful' };
  }
}
