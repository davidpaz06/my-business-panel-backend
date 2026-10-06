import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaysheetService } from './paysheet.service';
import {
  getPaysheetByPeriodDoc,
  getPaysheetsByTenantDoc,
  getPaysheetByBranchDoc,
  getPaysheetByIdDoc,
  getPaysheetDetailsDoc,
} from '@/docs/contexts/hr/paysheet';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Paysheet')
@Controller('paysheet')
@UseGuards(AuthenticationGuard)
export class PaysheetController {
  constructor(
    private readonly paysheetService: PaysheetService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getPaysheetByPeriodDoc.operation)
  @ApiResponse(getPaysheetByPeriodDoc.responses[200])
  @ApiResponse(getPaysheetByPeriodDoc.responses[401])
  @Get('find')
  async getPaysheetByPeriod(
    @Session() session: IUserSession,
    @Query('start') periodStart: string,
    @Query('end') periodEnd: string,
    @Query('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.paysheetService.getPaysheetByPeriod(
      branchId,
      periodStart,
      periodEnd,
    );
  }

  @ApiOperation(getPaysheetsByTenantDoc.operation)
  @ApiResponse(getPaysheetsByTenantDoc.responses[200])
  @ApiResponse(getPaysheetsByTenantDoc.responses[401])
  @Get('tenant/:tenantId')
  async getPaysheetsByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.paysheetService.getPaysheetsByTenant(tenantId);
  }

  @ApiOperation(getPaysheetByBranchDoc.operation)
  @ApiResponse(getPaysheetByBranchDoc.responses[200])
  @ApiResponse(getPaysheetByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getPaysheetByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.paysheetService.getPaysheetByBranch(branchId);
  }

  @ApiOperation(getPaysheetByIdDoc.operation)
  @ApiResponse(getPaysheetByIdDoc.responses[200])
  @ApiResponse(getPaysheetByIdDoc.responses[401])
  @ApiResponse(getPaysheetByIdDoc.responses[404])
  @Get(':paysheetId')
  async getPaysheetById(
    @Session() session: IUserSession,
    @Param('paysheetId') paysheetId: string,
  ) {
    await this.tenantScope.assertOwns('paysheet', paysheetId, session);
    return this.paysheetService.getPaysheetById(paysheetId);
  }

  @ApiOperation(getPaysheetDetailsDoc.operation)
  @ApiResponse(getPaysheetDetailsDoc.responses[200])
  @ApiResponse(getPaysheetDetailsDoc.responses[401])
  @ApiResponse(getPaysheetDetailsDoc.responses[404])
  @Get(':paysheetId/details')
  async getPaysheetDetails(
    @Session() session: IUserSession,
    @Param('paysheetId') paysheetId: string,
  ) {
    await this.tenantScope.assertOwns('paysheet', paysheetId, session);
    return this.paysheetService.getPaysheetDetails(paysheetId);
  }
}
