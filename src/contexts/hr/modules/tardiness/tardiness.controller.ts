import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TardinessService } from './tardiness.service';
import {
  getTardinessByEmployeeDoc,
  getTardinessByBranchDoc,
  getTardinessByDateRangeDoc,
} from '@/docs/contexts/hr/tardiness';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Tardiness')
@Controller('tardiness')
@UseGuards(AuthenticationGuard)
export class TardinessController {
  constructor(
    private readonly tardinessService: TardinessService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getTardinessByEmployeeDoc.operation)
  @ApiResponse(getTardinessByEmployeeDoc.responses[200])
  @ApiResponse(getTardinessByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getTardinessByEmployee(
    @Session() session: IUserSession,
    @Param('employeeId') employeeId: string,
  ) {
    await this.tenantScope.assertOwns('employee', employeeId, session);
    return this.tardinessService.getTardinessByEmployee(employeeId);
  }

  @ApiOperation(getTardinessByBranchDoc.operation)
  @ApiResponse(getTardinessByBranchDoc.responses[200])
  @ApiResponse(getTardinessByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getTardinessByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.tardinessService.getTardinessByBranch(branchId);
  }

  @ApiOperation(getTardinessByDateRangeDoc.operation)
  @ApiResponse(getTardinessByDateRangeDoc.responses[200])
  @ApiResponse(getTardinessByDateRangeDoc.responses[401])
  @Get('period')
  async getTardinessByDateRange(
    @Session() session: IUserSession,
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.tardinessService.getTardinessByDateRange(
      startDate,
      endDate,
      branchId,
    );
  }
}
