import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClockingService } from './clocking.service';
import { ClockInDto } from './dto/clockIn.dto';
import { ManualClockInDto, ManualClockOutDto } from './dto/manual-clocking.dto';
import { clockInDoc, clockOutDoc } from '@/docs/contexts/hr/clocking';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Clocking')
@Controller('clocking')
@UseGuards(AuthenticationGuard)
export class ClockingController {
  constructor(private readonly clockingService: ClockingService) {}

  @Get('branch/:branchId')
  async getClockingByBranch(@Param('branchId') branchId: string) {
    return this.clockingService.getClockingByBranch(branchId);
  }

  @Get('employee/:employeeId')
  async getClockingByEmployee(@Param('employeeId') employeeId: string) {
    return this.clockingService.getClockingByEmployee(employeeId);
  }

  @ApiOperation(clockInDoc.operation)
  @ApiResponse(clockInDoc.responses[201])
  @ApiResponse(clockInDoc.responses[400])
  @ApiResponse(clockInDoc.responses[401])
  @Post()
  async clockIn(@Body() data: ClockInDto) {
    return this.clockingService.registerClockIn(data);
  }

  @ApiOperation(clockOutDoc.operation)
  @ApiResponse(clockOutDoc.responses[200])
  @ApiResponse(clockOutDoc.responses[400])
  @ApiResponse(clockOutDoc.responses[401])
  @Patch()
  async clockOut(@Body() data: { employeeId: string }) {
    return this.clockingService.registerClockOut(data.employeeId);
  }

  @ApiOperation({
    summary: 'Registrar clock-in manual con fecha y hora específica',
  })
  @ApiResponse({ status: 201, description: 'Clock-in manual registrado' })
  @Post('manual-in')
  async manualClockIn(@Body() dto: ManualClockInDto) {
    return this.clockingService.registerManualClockIn(dto);
  }

  @ApiOperation({
    summary: 'Registrar clock-out manual con fecha y hora específica',
  })
  @ApiResponse({ status: 200, description: 'Clock-out manual registrado' })
  @Patch('manual-out')
  async manualClockOut(@Body() dto: ManualClockOutDto) {
    return this.clockingService.registerManualClockOut(dto);
  }
}
