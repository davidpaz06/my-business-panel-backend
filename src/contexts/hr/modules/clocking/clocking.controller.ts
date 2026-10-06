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
import { ClockingService } from './clocking.service';
import { ClockInDto } from './dto/clockIn.dto';
import { ManualClockInDto, ManualClockOutDto } from './dto/manual-clocking.dto';
import { clockInDoc, clockOutDoc } from '@/docs/contexts/hr/clocking';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Clocking')
@Controller('clocking')
@UseGuards(AuthenticationGuard)
export class ClockingController {
  constructor(
    private readonly clockingService: ClockingService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('branch/:branchId')
  async getClockingByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.clockingService.getClockingByBranch(branchId);
  }

  @Get('employee/:employeeId')
  async getClockingByEmployee(
    @Session() session: IUserSession,
    @Param('employeeId') employeeId: string,
  ) {
    await this.tenantScope.assertOwns('employee', employeeId, session);
    return this.clockingService.getClockingByEmployee(employeeId);
  }

  @ApiOperation(clockInDoc.operation)
  @ApiResponse(clockInDoc.responses[201])
  @ApiResponse(clockInDoc.responses[400])
  @ApiResponse(clockInDoc.responses[401])
  @Post()
  async clockIn(@Session() session: IUserSession, @Body() data: ClockInDto) {
    await this.tenantScope.assertOwns('employee', data.employeeId, session);
    await this.tenantScope.assertOwns('branch', data.branchId, session);
    return this.clockingService.registerClockIn(data);
  }

  @ApiOperation(clockOutDoc.operation)
  @ApiResponse(clockOutDoc.responses[200])
  @ApiResponse(clockOutDoc.responses[400])
  @ApiResponse(clockOutDoc.responses[401])
  @Patch()
  async clockOut(
    @Session() session: IUserSession,
    @Body() data: { employeeId: string },
  ) {
    await this.tenantScope.assertOwns('employee', data.employeeId, session);
    return this.clockingService.registerClockOut(data.employeeId);
  }

  @ApiOperation({
    summary: 'Registrar clock-in manual con fecha y hora específica',
  })
  @ApiResponse({ status: 201, description: 'Clock-in manual registrado' })
  @Post('manual-in')
  async manualClockIn(
    @Session() session: IUserSession,
    @Body() dto: ManualClockInDto,
  ) {
    await this.tenantScope.assertOwns('employee', dto.employeeId, session);
    await this.tenantScope.assertOwns('branch', dto.branchId, session);
    return this.clockingService.registerManualClockIn(dto);
  }

  @ApiOperation({
    summary: 'Registrar clock-out manual con fecha y hora específica',
  })
  @ApiResponse({ status: 200, description: 'Clock-out manual registrado' })
  @Patch('manual-out')
  async manualClockOut(
    @Session() session: IUserSession,
    @Body() dto: ManualClockOutDto,
  ) {
    await this.tenantScope.assertOwns('clocking', dto.clockingId, session);
    return this.clockingService.registerManualClockOut(dto);
  }
}
