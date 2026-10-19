import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CashFlowService } from './cash-flow.service';
import { GetCashFlowDto } from './dto/cash-flow.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { FINANCE_READ_ROLES } from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Finances - Cash Flow')
@UseGuards(AuthenticationGuard, RateLimitGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('finances/cash-flow')
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @ApiOperation({ summary: 'Flujo de caja historico por periodo y agrupacion' })
  @Get()
  @RateLimit('report')
  getCashFlow(@Query() dto: GetCashFlowDto, @Session() session: IUserSession) {
    return this.cashFlowService.getCashFlow(
      dto.startDate,
      dto.endDate,
      dto.groupBy,
      dto.branchId,
      session,
    );
  }

  @ApiOperation({ summary: 'Proyecciones de flujo de caja futuras' })
  @Get('projections')
  @RateLimit('report')
  getProjections(@Session() session: IUserSession) {
    return this.cashFlowService.getProjections(session);
  }
}
