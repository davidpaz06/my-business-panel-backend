import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import {
  FINANCE_ADMIN_ROLES,
  FINANCE_READ_ROLES,
} from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { IvaWithholdingService } from './iva-withholding.service';
import {
  IssueWithholdingDto,
  SetSupplierRetentionDto,
  SetWithholdingAgentDto,
} from './dto/iva-withholding.dto';

@ApiTags('IVA - Retenciones')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('iva/withholdings')
export class IvaWithholdingController {
  constructor(
    private readonly service: IvaWithholdingService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation({
    summary: 'Configuracion de retencion de IVA',
    description:
      'Bandera de agente de retencion del tenant y porcentaje de retencion de cada proveedor.',
  })
  @Get('config/:tenantId')
  getConfig(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.getConfig(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  @ApiOperation({ summary: 'Marcar al tenant como agente de retencion de IVA' })
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Put('config/:tenantId/agent')
  setAgent(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Body() dto: SetWithholdingAgentDto,
  ) {
    return this.service.setAgent(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      dto.is_agent,
    );
  }

  @ApiOperation({ summary: 'Porcentaje de retencion de IVA de un proveedor' })
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Put('config/:tenantId/suppliers/:supplierId')
  setSupplierPercentage(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: SetSupplierRetentionDto,
  ) {
    return this.service.setSupplierPercentage(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      supplierId,
      dto.iva_retention_percentage,
    );
  }

  @ApiOperation({
    summary: 'Facturas de proveedor con retencion pendiente de emitir',
  })
  @Get('candidates/:tenantId')
  listCandidates(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.listCandidates(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  @ApiOperation({ summary: 'Comprobantes de retencion emitidos en el periodo' })
  @Get(':tenantId')
  list(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.service.list(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      start,
      end,
    );
  }

  @ApiOperation({ summary: 'Emitir el comprobante de retencion de una factura' })
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post(':tenantId')
  issue(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Body() dto: IssueWithholdingDto,
  ) {
    return this.service.issue(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      session.user_id,
      dto.supplier_invoice_id,
    );
  }

  @ApiOperation({ summary: 'Anular un comprobante de retencion' })
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Patch(':tenantId/:withholdingId/void')
  void(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('withholdingId', ParseUUIDPipe) withholdingId: string,
  ) {
    return this.service.void(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      withholdingId,
    );
  }
}
