import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FoulService } from './foul.service';
import { RegisterFoulDto } from './dto/create_foul.dto';
import {
  registerFoulDoc,
  getFoulsByEmployeeDoc,
  getFoulsByBranchDoc,
  getFoulsByPeriodDoc,
} from '@/docs/contexts/hr/foul';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@UseGuards(AuthenticationGuard)
@ApiTags('Foul')
@Controller('foul')
export class FoulController {
  constructor(
    private readonly foulService: FoulService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(registerFoulDoc.operation)
  @ApiResponse(registerFoulDoc.responses[201])
  @ApiResponse(registerFoulDoc.responses[400])
  @ApiResponse(registerFoulDoc.responses[401])
  @Post()
  async createFoul(
    @Session() session: IUserSession,
    @Body() body: RegisterFoulDto,
  ) {
    await this.tenantScope.assertOwns('employee', body.employee_id, session);
    await this.tenantScope.assertOwns('branch', body.branch_id, session);
    return this.foulService.registerFoul(body);
  }

  @ApiOperation(getFoulsByEmployeeDoc.operation)
  @ApiResponse(getFoulsByEmployeeDoc.responses[200])
  @ApiResponse(getFoulsByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getFoulsByEmployee(
    @Session() session: IUserSession,
    @Param('employeeId') employeeId: string,
  ) {
    await this.tenantScope.assertOwns('employee', employeeId, session);
    return this.foulService.getFoulsByEmployee(employeeId);
  }

  @ApiOperation(getFoulsByBranchDoc.operation)
  @ApiResponse(getFoulsByBranchDoc.responses[200])
  @ApiResponse(getFoulsByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getFoulsByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.foulService.getFoulsByBranch(branchId);
  }

  @ApiOperation(getFoulsByPeriodDoc.operation)
  @ApiResponse(getFoulsByPeriodDoc.responses[200])
  @ApiResponse(getFoulsByPeriodDoc.responses[401])
  @Get('/period')
  async getFoulsByPeriod(
    @Session() session: IUserSession,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.foulService.getFoulsByPeriod(
      start,
      end,
      this.tenantScope.scopeFor(session),
    );
  }
}
