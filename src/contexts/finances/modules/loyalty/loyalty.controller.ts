import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { GetLoyaltyOverviewDto } from './dto/loyalty.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { FINANCE_READ_ROLES } from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Finances - Loyalty')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('finances/loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @ApiOperation({
    summary:
      'Pasivo del programa de fidelidad: puntos activos, equivalencia monetaria, crecimiento y top clientes',
  })
  @ApiResponse({ status: 200, description: 'Resumen de fidelidad obtenido' })
  @ApiResponse({ status: 400, description: 'Intervalo invalido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get('overview')
  getOverview(
    @Query() dto: GetLoyaltyOverviewDto,
    @Session() session: IUserSession,
  ) {
    return this.loyaltyService.getOverview(dto.interval, session, dto.branchId);
  }
}
