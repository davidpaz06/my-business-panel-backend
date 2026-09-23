import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

import { ExchangeRateService } from './exchange-rate.service';
import { SetBaseRateDto } from './dto/set-base-rate.dto';
import { SetDeltaDto } from './dto/set-delta.dto';

/**
 * Tasa de cambio USD -> VES. Ledger inmutable: no hay PATCH ni DELETE --
 * cambiar la tasa o el diferencial agrega una fila nueva.
 */
@ApiBearerAuth()
@ApiTags('Exchange Rate')
@Controller('exchange-rate')
@UseGuards(AuthenticationGuard)
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  /** Tasa vigente del tenant (base + su diferencial). */
  @Get('effective')
  getEffective(@Session() user: IUserSession) {
    return this.service.getEffectiveRate(user.tenant_id);
  }

  /** Historial: cada cambio de tasa base o de diferencial. */
  @Get('ledger')
  getLedger(@Session() user: IUserSession) {
    return this.service.getLedger(user.tenant_id);
  }

  /** Tasa base global vigente, sin diferencial. */
  @Get('base')
  getBase() {
    return this.service.getCurrentBase();
  }

  /**
   * Carga una tasa base nueva. Afecta a todos los tenants -- restringido a
   * superuser (no admin): es un dato global del BCV, no una configuracion
   * de tenant, y en produccion se carga automaticamente via BcvRateSyncService.
   */
  @Post('base')
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('superuser')
  setBase(@Body() dto: SetBaseRateDto) {
    return this.service.setBaseRate(dto);
  }

  /** Carga el diferencial del tenant. 0 lo restablece. */
  @Post('delta')
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('admin', 'superuser')
  setDelta(@Body() dto: SetDeltaDto, @Session() user: IUserSession) {
    return this.service.setDelta(user.tenant_id, user.user_id, dto);
  }
}
