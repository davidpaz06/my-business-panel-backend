import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IvaService } from './iva.service';
import type { IvaSummaryResponse } from './interface/iva.interface';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('IVA')
@UseGuards(AuthenticationGuard)
@Controller('iva')
export class IvaController {
  constructor(
    private readonly ivaService: IvaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation({
    summary: 'Resumen de IVA del período',
    description:
      'Devuelve el desglose de IVA débito, crédito, CxP, recuperable, notas de crédito y neto a pagar a Hacienda CR.',
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
