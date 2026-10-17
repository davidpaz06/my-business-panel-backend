import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { FINANCE_READ_ROLES } from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  AccountListQueryDto,
  AccountsOverviewQueryDto,
} from './dto/accounts-query.dto';

@ApiTags('Finances - Accounts')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('finances/accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation({
    summary: 'Resumen consolidado de cuentas por pagar y por cobrar',
  })
  @ApiResponse({ status: 200, description: 'Resumen de cuentas obtenido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get()
  getAccountsOverview(
    @Session() session: IUserSession,
    @Query() query: AccountsOverviewQueryDto,
  ) {
    const tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      query.tenantId,
    );
    return this.accountsService.getAccountsOverview(tenantId, query.branchId);
  }

  @ApiOperation({ summary: 'Lista filtrada de cuentas por pagar' })
  @ApiResponse({ status: 200, description: 'Lista obtenida' })
  @Get('payables')
  getPayablesList(
    @Session() session: IUserSession,
    @Query() query: AccountListQueryDto,
  ) {
    const tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      query.tenantId,
    );
    return this.accountsService.getPayablesList(query, tenantId);
  }

  @ApiOperation({ summary: 'Lista filtrada de cuentas por cobrar' })
  @ApiResponse({ status: 200, description: 'Lista obtenida' })
  @Get('receivables')
  getReceivablesList(
    @Session() session: IUserSession,
    @Query() query: AccountListQueryDto,
  ) {
    const tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      query.tenantId,
    );
    return this.accountsService.getReceivablesList(query, tenantId);
  }

  @ApiOperation({ summary: 'Pagos realizados de una cuenta por pagar' })
  @ApiResponse({ status: 200, description: 'Pagos obtenidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin acceso' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  @Get('payable/:id/payments')
  getPayablePayments(
    @Param('id') payableId: string,
    @Session() session: IUserSession,
  ) {
    return this.accountsService.getPayablePayments(payableId, session);
  }

  @ApiOperation({ summary: 'Cobros realizados de una cuenta por cobrar' })
  @ApiResponse({ status: 200, description: 'Cobros obtenidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin acceso' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  @Get('receivable/:id/collections')
  getReceivableCollections(
    @Param('id') receivableId: string,
    @Session() session: IUserSession,
  ) {
    return this.accountsService.getReceivableCollections(receivableId, session);
  }
}
