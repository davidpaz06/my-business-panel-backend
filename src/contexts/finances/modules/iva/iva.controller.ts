import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IvaService } from './iva.service';
import type { IvaSummaryResponse } from './interface/iva.interface';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { FINANCE_READ_ROLES } from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('IVA')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('iva')
export class IvaController {
  constructor(
    private readonly ivaService: IvaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation({
    summary: 'Resumen de IVA del período',
    description:
      'Devuelve los componentes del IVA del periodo (debito, notas de debito y credito, credito de compras pagadas y pendientes, IVA de gastos) en USD y VES con la tasa de la fecha de cada documento. Base de la declaracion ante el SENIAT.',
  })
  @ApiQuery({ name: 'start', required: true, example: '2026-01-01' })
  @ApiQuery({ name: 'end', required: true, example: '2026-06-30' })
  @ApiResponse({ status: 200, description: 'Resumen de IVA calculado.' })
  @Get('summary/:tenantId')
  getSummary(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<IvaSummaryResponse> {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.ivaService.getSummary(tenantId, start, end);
  }
}
