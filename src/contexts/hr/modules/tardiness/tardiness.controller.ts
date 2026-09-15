import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TardinessService } from './tardiness.service';
import {
  getTardinessByEmployeeDoc,
  getTardinessByBranchDoc,
  getTardinessByDateRangeDoc,
} from '@/docs/contexts/hr/tardiness';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Tardiness')
@Controller('tardiness')
@UseGuards(AuthenticationGuard)
export class TardinessController {
  constructor(private readonly tardinessService: TardinessService) {}

  @ApiOperation(getTardinessByEmployeeDoc.operation)
  @ApiResponse(getTardinessByEmployeeDoc.responses[200])
  @ApiResponse(getTardinessByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getTardinessByEmployee(@Param('employeeId') employeeId: string) {
    return this.tardinessService.getTardinessByEmployee(employeeId);
  }

  @ApiOperation(getTardinessByBranchDoc.operation)
  @ApiResponse(getTardinessByBranchDoc.responses[200])
  @ApiResponse(getTardinessByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getTardinessByBranch(@Param('branchId') branchId: string) {
    return this.tardinessService.getTardinessByBranch(branchId);
  }

  @ApiOperation(getTardinessByDateRangeDoc.operation)
  @ApiResponse(getTardinessByDateRangeDoc.responses[200])
  @ApiResponse(getTardinessByDateRangeDoc.responses[401])
  @Get('period')
  async getTardinessByDateRange(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('branchId') branchId: string,
  ) {
    return this.tardinessService.getTardinessByDateRange(
      startDate,
      endDate,
      branchId,
    );
  }
}
