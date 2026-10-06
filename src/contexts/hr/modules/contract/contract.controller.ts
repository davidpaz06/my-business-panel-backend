import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContractService } from './contract.service';
import { ContractDto } from '../employee/dto/newEmployeeDto.dto';
import {
  getContractByIdDoc,
  updateContractDoc,
} from '@/docs/contexts/hr/contract';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Contract')
@Controller('contract')
@UseGuards(AuthenticationGuard)
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('schedules')
  async getPaymentSchedules() {
    return this.contractService.getPaymentSchedules();
  }

  @ApiOperation(getContractByIdDoc.operation)
  @ApiResponse(getContractByIdDoc.responses[200])
  @ApiResponse(getContractByIdDoc.responses[401])
  @ApiResponse(getContractByIdDoc.responses[404])
  @Get(':id')
  async getContractById(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('contract', id, session);
    return this.contractService.getContractById(id);
  }

  @ApiOperation(updateContractDoc.operation)
  @ApiResponse(updateContractDoc.responses[200])
  @ApiResponse(updateContractDoc.responses[400])
  @ApiResponse(updateContractDoc.responses[401])
  @ApiResponse(updateContractDoc.responses[404])
  @Patch(':id')
  async updateContractTerms(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() data: ContractDto,
  ) {
    await this.tenantScope.assertOwns('contract', id, session);
    if (data.turn_id)
      await this.tenantScope.assertOwns('turn', data.turn_id, session);
    return this.contractService.updateContract(id, data);
  }
}
