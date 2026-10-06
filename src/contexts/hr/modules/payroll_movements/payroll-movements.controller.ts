import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PayrollMovementsService } from './payroll-movements.service';
import {
  getMovementsByPaysheetDoc,
  getMovementsByDetailDoc,
} from '@/docs/contexts/hr/payroll_movements';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Payroll Movements')
@Controller('movements')
@UseGuards(AuthenticationGuard)
export class PayrollMovementsController {
  constructor(
    private readonly pMovement: PayrollMovementsService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getMovementsByPaysheetDoc.operation)
  @ApiResponse(getMovementsByPaysheetDoc.responses[200])
  @ApiResponse(getMovementsByPaysheetDoc.responses[401])
  @Get('paysheet/:paysheetId')
  async getPayrollMovementsByPaysheet(
    @Session() session: IUserSession,
    @Param('paysheetId') paysheetId: string,
  ) {
    await this.tenantScope.assertOwns('paysheet', paysheetId, session);
    return this.pMovement.getPayrollMovementsByPaysheet(paysheetId);
  }

  @ApiOperation(getMovementsByDetailDoc.operation)
  @ApiResponse(getMovementsByDetailDoc.responses[200])
  @ApiResponse(getMovementsByDetailDoc.responses[401])
  @Get('detail/:detailId')
  async getPayrollMovementsByDetail(
    @Session() session: IUserSession,
    @Param('detailId') detailId: string,
  ) {
    await this.tenantScope.assertOwns('paysheetDetail', detailId, session);
    return this.pMovement.getPayrollMovementsByDetail(detailId);
  }
}
