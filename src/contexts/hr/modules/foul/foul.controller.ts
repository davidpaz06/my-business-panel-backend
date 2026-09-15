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

@UseGuards(AuthenticationGuard)
@ApiTags('Foul')
@Controller('foul')
export class FoulController {
  constructor(private readonly foulService: FoulService) {}

  @ApiOperation(registerFoulDoc.operation)
  @ApiResponse(registerFoulDoc.responses[201])
  @ApiResponse(registerFoulDoc.responses[400])
  @ApiResponse(registerFoulDoc.responses[401])
  @Post()
  async createFoul(@Body() body: RegisterFoulDto) {
    return this.foulService.registerFoul(body);
  }

  @ApiOperation(getFoulsByEmployeeDoc.operation)
  @ApiResponse(getFoulsByEmployeeDoc.responses[200])
  @ApiResponse(getFoulsByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getFoulsByEmployee(@Param('employeeId') employeeId: string) {
    return this.foulService.getFoulsByEmployee(employeeId);
  }

  @ApiOperation(getFoulsByBranchDoc.operation)
  @ApiResponse(getFoulsByBranchDoc.responses[200])
  @ApiResponse(getFoulsByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getFoulsByBranch(@Param('branchId') branchId: string) {
    return this.foulService.getFoulsByBranch(branchId);
  }

  @ApiOperation(getFoulsByPeriodDoc.operation)
  @ApiResponse(getFoulsByPeriodDoc.responses[200])
  @ApiResponse(getFoulsByPeriodDoc.responses[401])
  @Get('/period')
  async getFoulsByPeriod(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.foulService.getFoulsByPeriod(start, end);
  }
}
