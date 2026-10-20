import { Post, Controller, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '@/contexts/general/modules/auth/auth.service';
import {
  clearAuthCookies,
  setAuthCookies,
} from '@/contexts/general/modules/auth/auth-cookies';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change_password.dto';
import { Response } from 'express';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RefreshTokenGuard } from '@/common/guards/refresh_token.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { IRequestWithCookies } from '@/common/interfaces/request_with_cookies.interface';
import { loginDoc, logoutDoc } from '@/docs/contexts/general/auth';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import {
  RateLimit,
  byBodyField,
  byCookieHash,
} from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation(loginDoc.operation)
  @ApiResponse(loginDoc.responses[200])
  @ApiResponse(loginDoc.responses[401])
  @Post('/login')
  @UseGuards(RateLimitGuard)
  @RateLimit('login', { identity: byBodyField('email') })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.login(loginDto);
    setAuthCookies(response, tokens);
    return { message: 'Login successful', user };
  }

  @UseGuards(RefreshTokenGuard, RateLimitGuard)
  @RateLimit('refresh', { identity: byCookieHash('refresh_token') })
  @Post('/refresh')
  async refresh(
    @Req() request: IRequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshTokenCookie = request.cookies['refresh_token'];
    const tokens = await this.authService.refresh(refreshTokenCookie);
    setAuthCookies(response, tokens);
    return { message: 'Token refreshed' };
  }

  @UseGuards(AuthenticationGuard, RateLimitGuard)
  @Post('/change-password')
  @RateLimit('sensitive')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Session() user: IUserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.changePassword(user, dto);
    setAuthCookies(response, tokens);
    return { message: 'Password changed successfully' };
  }

  @ApiOperation(logoutDoc.operation)
  @ApiResponse(logoutDoc.responses[200])
  @ApiResponse(logoutDoc.responses[401])
  @UseGuards(AuthenticationGuard, RateLimitGuard)
  @Post('/logout')
  async logout(
    @Session() user: IUserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.user_id);
    clearAuthCookies(response);
    return { message: 'Logout successful' };
  }
}
