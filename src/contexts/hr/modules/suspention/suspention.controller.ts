import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SuspentionService } from './suspention.service';
import {
  NewSuspentionDto,
  UpdateSuspention,
} from './dto/create_suspention.dto';
import {
  registerNewSuspentionDoc,
  getSuspentionByEmployeeDoc,
  getSuspentionsByBranchDoc,
  closeSuspentionDoc,
  updateSuspentionDoc,
} from '@/docs/contexts/hr/suspention';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Suspention')
@Controller('suspention')
@UseGuards(AuthenticationGuard)
export class SuspentionController {
  constructor(
    private readonly suspentionService: SuspentionService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(registerNewSuspentionDoc.operation)
  @ApiResponse(registerNewSuspentionDoc.responses[201])
  @ApiResponse(registerNewSuspentionDoc.responses[400])
  @ApiResponse(registerNewSuspentionDoc.responses[401])
  @Post()
  async registerNewSuspention(
    @Session() session: IUserSession,
    @Body() body: NewSuspentionDto,
  ) {
    await this.tenantScope.assertOwns('employee', body.employee_id, session);
    await this.tenantScope.assertOwns('branch', body.branchId, session);
    return this.suspentionService.registerNewSuspention(body);
  }

  @ApiOperation(getSuspentionByEmployeeDoc.operation)
  @ApiResponse(getSuspentionByEmployeeDoc.responses[200])
  @ApiResponse(getSuspentionByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getSuspentionByEmployee(
    @Session() session: IUserSession,
    @Param('employeeId') id: string,
  ) {
    await this.tenantScope.assertOwns('employee', id, session);
    return this.suspentionService.getSuspentionsByEmployee(id);
  }

  @ApiOperation(getSuspentionsByBranchDoc.operation)
  @ApiResponse(getSuspentionsByBranchDoc.responses[200])
  @ApiResponse(getSuspentionsByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getSuspentionsByBranch(
    @Session() session: IUserSession,
    @Param('branchId') id: string,
  ) {
    await this.tenantScope.assertOwns('branch', id, session);
    return this.suspentionService.getSuspentionsByBranch(id);
  }

  @ApiOperation(closeSuspentionDoc.operation)
  @ApiResponse(closeSuspentionDoc.responses[200])
  @ApiResponse(closeSuspentionDoc.responses[401])
  @Patch(':suspentionId/close')
  async closeSuspention(
    @Session() session: IUserSession,
    @Param('suspentionId') id: string,
  ) {
    await this.tenantScope.assertOwns('suspention', id, session);
    return this.suspentionService.closeSuspention(id);
  }

  @ApiOperation(updateSuspentionDoc.operation)
  @ApiResponse(updateSuspentionDoc.responses[200])
  @ApiResponse(updateSuspentionDoc.responses[401])
  @Patch(':suspentionId')
  async updateSuspention(
    @Session() session: IUserSession,
    @Param('suspentionId') id: string,
    @Body() body: UpdateSuspention,
  ) {
    await this.tenantScope.assertOwns('suspention', id, session);
    if (body.employee_id)
      await this.tenantScope.assertOwns('employee', body.employee_id, session);
    if (body.branchId)
      await this.tenantScope.assertOwns('branch', body.branchId, session);
    return this.suspentionService.updateSuspention(id, body);
  }
}
