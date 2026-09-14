import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PayrollMovementsService } from './payroll-movements.service';
import {
  getMovementsByPaysheetDoc,
  getMovementsByDetailDoc,
} from '@/docs/contexts/hr/payroll_movements';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Payroll Movements')
@Controller('movements')
@UseGuards(AuthenticationGuard)
export class PayrollMovementsController {
  constructor(private readonly pMovement: PayrollMovementsService) {}

  @ApiOperation(getMovementsByPaysheetDoc.operation)
  @ApiResponse(getMovementsByPaysheetDoc.responses[200])
  @ApiResponse(getMovementsByPaysheetDoc.responses[401])
  @Get('paysheet/:paysheetId')
  async getPayrollMovementsByPaysheet(@Param('paysheetId') paysheetId: string) {
    return this.pMovement.getPayrollMovementsByPaysheet(paysheetId);
  }

  @ApiOperation(getMovementsByDetailDoc.operation)
  @ApiResponse(getMovementsByDetailDoc.responses[200])
  @ApiResponse(getMovementsByDetailDoc.responses[401])
  @Get('detail/:detailId')
  async getPayrollMovementsByDetail(@Param('detailId') detailId: string) {
    return this.pMovement.getPayrollMovementsByDetail(detailId);
  }
}
