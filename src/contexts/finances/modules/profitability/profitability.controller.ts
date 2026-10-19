import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfitabilityService } from './profitability.service';
import { GetProfitabilityDto } from './dto/profitability.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { FINANCE_READ_ROLES } from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Finances - Profitability')
@UseGuards(AuthenticationGuard, RateLimitGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('finances/profitability')
export class ProfitabilityController {
  constructor(private readonly profitabilityService: ProfitabilityService) {}

  @ApiOperation({
    summary:
      'Componentes crudos de rentabilidad por sucursal y bucket de tiempo',
  })
  @ApiResponse({ status: 200, description: 'Datos crudos obtenidos' })
  @ApiResponse({ status: 400, description: 'Intervalo invalido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get()
  @RateLimit('report')
  getProfitability(
    @Query() dto: GetProfitabilityDto,
    @Session() session: IUserSession,
  ) {
    return this.profitabilityService.getProfitability(
      dto.interval,
      session,
      dto.branchId,
    );
  }
}
