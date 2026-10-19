import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

import { SpecialCodeService } from './special_code.service';
import { CreateSpecialCodeDto } from './dto/create_special_code.dto';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

const SUPERUSER_LEVEL = 4;

@ApiBearerAuth()
@ApiTags('SpecialCode')
@Controller('special-code')
export class SpecialCodeController {
  constructor(private readonly service: SpecialCodeService) {}

  /**
   * Listar todos los códigos. Solo superusuarios.
   */
  @Get('/')
  @UseGuards(AuthenticationGuard, RateLimitGuard, LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async listAll() {
    return this.service.listAll();
  }

  /**
   * Crear un nuevo código. Solo superusuarios.
   */
  @Post('/')
  @UseGuards(AuthenticationGuard, RateLimitGuard, LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async create(
    @Body() dto: CreateSpecialCodeDto,
    @Session() session: IUserSession,
  ) {
    return this.service.create(dto, session.user_id);
  }

  /**
   * Eliminar un código que aún no haya sido canjeado.
   * Solo superusuarios.
   */
  @Delete('/:id')
  @UseGuards(AuthenticationGuard, RateLimitGuard, LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async remove(@Param('id') id: string) {
    return this.service.deleteUnused(id);
  }

  /**
   * Endpoint público (no autenticado): el frontend del onboarding lo usa
   * para validar el código antes de comprometer al cliente al registro.
   * No marca el código como consumido. La transacción de onboarding hace
   * el canje atómico.
   */
  @Get('/validate')
  @UseGuards(RateLimitGuard)
  @RateLimit('sensitive')
  async validate(@Query('code') code: string) {
    if (!code) return { valid: false, reason: 'not_found' as const };
    return this.service.validateForOnboarding(code);
  }
}
