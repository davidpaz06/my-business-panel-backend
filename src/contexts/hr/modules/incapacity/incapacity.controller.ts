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
import { IncapacityService } from './incapacity.service';
import {
  RegisterIncapacityDto,
  UpdateIncapacityDto,
} from './dto/register_incapacity.dto';
import {
  registerIncapacityDoc,
  getIncapacitiesByBranchDoc,
  getIncapacitiesByEmployeeDoc,
  updateIncapacityDoc,
  closeIncapacityDoc,
} from '@/docs/contexts/hr/incapacity';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Incapacity')
@Controller('incapacity')
@UseGuards(AuthenticationGuard)
export class IncapacityController {
  constructor(
    private readonly incService: IncapacityService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getIncapacitiesByBranchDoc.operation)
  @ApiResponse(getIncapacitiesByBranchDoc.responses[200])
  @ApiResponse(getIncapacitiesByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getIncapacitiesByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.incService.getIncapacitiesByBranch(branchId);
  }

  @ApiOperation(getIncapacitiesByEmployeeDoc.operation)
  @ApiResponse(getIncapacitiesByEmployeeDoc.responses[200])
  @ApiResponse(getIncapacitiesByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getIncapacitiesByEmployee(
    @Session() session: IUserSession,
    @Param('employeeId') employeeId: string,
  ) {
    await this.tenantScope.assertOwns('employee', employeeId, session);
    return this.incService.getIncapacitiesByEmployee(employeeId);
  }

  @ApiOperation(registerIncapacityDoc.operation)
  @ApiResponse(registerIncapacityDoc.responses[201])
  @ApiResponse(registerIncapacityDoc.responses[400])
  @ApiResponse(registerIncapacityDoc.responses[401])
  @Post()
  async registerIncapacity(
    @Session() session: IUserSession,
    @Body() data: RegisterIncapacityDto,
  ) {
    await this.tenantScope.assertOwns('employee', data.employee_id, session);
    await this.tenantScope.assertOwns('branch', data.branch_id, session);
    return this.incService.registerIncapacity(data);
  }

  @ApiOperation(updateIncapacityDoc.operation)
  @ApiResponse(updateIncapacityDoc.responses[200])
  @ApiResponse(updateIncapacityDoc.responses[401])
  @Patch(':id')
  async updateIncapacityRegister(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() data: UpdateIncapacityDto,
  ) {
    await this.tenantScope.assertOwns('incapacity', id, session);
    if (data.employee_id)
      await this.tenantScope.assertOwns('employee', data.employee_id, session);
    if (data.branch_id)
      await this.tenantScope.assertOwns('branch', data.branch_id, session);
    return this.incService.updateIncapacityRegister(id, data);
  }

  @ApiOperation(closeIncapacityDoc.operation)
  @ApiResponse(closeIncapacityDoc.responses[200])
  @ApiResponse(closeIncapacityDoc.responses[401])
  @Patch(':id/close')
  async closeIncapacityRegister(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('incapacity', id, session);
    return this.incService.closeIncapacity(id);
  }
}
