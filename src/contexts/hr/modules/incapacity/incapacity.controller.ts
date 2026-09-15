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

@ApiTags('Incapacity')
@Controller('incapacity')
@UseGuards(AuthenticationGuard)
export class IncapacityController {
  constructor(private readonly incService: IncapacityService) {}

  @ApiOperation(getIncapacitiesByBranchDoc.operation)
  @ApiResponse(getIncapacitiesByBranchDoc.responses[200])
  @ApiResponse(getIncapacitiesByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getIncapacitiesByBranch(@Param('branchId') branchId: string) {
    return this.incService.getIncapacitiesByBranch(branchId);
  }

  @ApiOperation(getIncapacitiesByEmployeeDoc.operation)
  @ApiResponse(getIncapacitiesByEmployeeDoc.responses[200])
  @ApiResponse(getIncapacitiesByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getIncapacitiesByEmployee(@Param('employeeId') employeeId: string) {
    return this.incService.getIncapacitiesByEmployee(employeeId);
  }

  @ApiOperation(registerIncapacityDoc.operation)
  @ApiResponse(registerIncapacityDoc.responses[201])
  @ApiResponse(registerIncapacityDoc.responses[400])
  @ApiResponse(registerIncapacityDoc.responses[401])
  @Post()
  async registerIncapacity(@Body() data: RegisterIncapacityDto) {
    return this.incService.registerIncapacity(data);
  }

  @ApiOperation(updateIncapacityDoc.operation)
  @ApiResponse(updateIncapacityDoc.responses[200])
  @ApiResponse(updateIncapacityDoc.responses[401])
  @Patch(':id')
  async updateIncapacityRegister(
    @Param('id') id: string,
    @Body() data: UpdateIncapacityDto,
  ) {
    return this.incService.updateIncapacityRegister(id, data);
  }

  @ApiOperation(closeIncapacityDoc.operation)
  @ApiResponse(closeIncapacityDoc.responses[200])
  @ApiResponse(closeIncapacityDoc.responses[401])
  @Patch(':id/close')
  async closeIncapacityRegister(@Param('id') id: string) {
    return this.incService.closeIncapacity(id);
  }
}
