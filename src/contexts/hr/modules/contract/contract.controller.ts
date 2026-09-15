import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContractService } from './contract.service';
import { ContractDto } from '../employee/dto/newEmployeeDto.dto';
import {
  getContractByIdDoc,
  updateContractDoc,
} from '@/docs/contexts/hr/contract';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Contract')
@Controller('contract')
@UseGuards(AuthenticationGuard)
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get('schedules')
  async getPaymentSchedules() {
    return this.contractService.getPaymentSchedules();
  }

  @ApiOperation(getContractByIdDoc.operation)
  @ApiResponse(getContractByIdDoc.responses[200])
  @ApiResponse(getContractByIdDoc.responses[401])
  @ApiResponse(getContractByIdDoc.responses[404])
  @Get(':id')
  async getContractById(@Param('id') id: string) {
    return this.contractService.getContractById(id);
  }

  @ApiOperation(updateContractDoc.operation)
  @ApiResponse(updateContractDoc.responses[200])
  @ApiResponse(updateContractDoc.responses[400])
  @ApiResponse(updateContractDoc.responses[401])
  @ApiResponse(updateContractDoc.responses[404])
  @Patch(':id')
  async updateContractTerms(
    @Param('id') id: string,
    @Body() data: ContractDto,
  ) {
    return this.contractService.updateContract(id, data);
  }
}
