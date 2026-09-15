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

@ApiTags('Suspention')
@Controller('suspention')
@UseGuards(AuthenticationGuard)
export class SuspentionController {
  constructor(private readonly suspentionService: SuspentionService) {}

  @ApiOperation(registerNewSuspentionDoc.operation)
  @ApiResponse(registerNewSuspentionDoc.responses[201])
  @ApiResponse(registerNewSuspentionDoc.responses[400])
  @ApiResponse(registerNewSuspentionDoc.responses[401])
  @Post()
  async registerNewSuspention(@Body() body: NewSuspentionDto) {
    return this.suspentionService.registerNewSuspention(body);
  }

  @ApiOperation(getSuspentionByEmployeeDoc.operation)
  @ApiResponse(getSuspentionByEmployeeDoc.responses[200])
  @ApiResponse(getSuspentionByEmployeeDoc.responses[401])
  @Get('employee/:employeeId')
  async getSuspentionByEmployee(@Param('employeeId') id: string) {
    return this.suspentionService.getSuspentionsByEmployee(id);
  }

  @ApiOperation(getSuspentionsByBranchDoc.operation)
  @ApiResponse(getSuspentionsByBranchDoc.responses[200])
  @ApiResponse(getSuspentionsByBranchDoc.responses[401])
  @Get('branch/:branchId')
  async getSuspentionsByBranch(@Param('branchId') id: string) {
    return this.suspentionService.getSuspentionsByBranch(id);
  }

  @ApiOperation(closeSuspentionDoc.operation)
  @ApiResponse(closeSuspentionDoc.responses[200])
  @ApiResponse(closeSuspentionDoc.responses[401])
  @Patch(':suspentionId/close')
  async closeSuspention(@Param('suspentionId') id: string) {
    return this.suspentionService.closeSuspention(id);
  }

  @ApiOperation(updateSuspentionDoc.operation)
  @ApiResponse(updateSuspentionDoc.responses[200])
  @ApiResponse(updateSuspentionDoc.responses[401])
  @Patch(':suspentionId')
  async updateSuspention(
    @Param('suspentionId') id: string,
    @Body() body: UpdateSuspention,
  ) {
    return this.suspentionService.updateSuspention(id, body);
  }
}
