import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmployeeService } from './employee.service';
import { NewEmployeeDto } from './dto/newEmployeeDto.dto';
import { UpdateEmployeeDto } from './dto/updateEmployee.dto';
import {
  TerminateEmployeeDto,
  UpdateTerminationDto,
} from './dto/terminateEmployee.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  getEmployeesByTenantDoc,
  getEmployeeByIdDoc,
  createEmployeeDoc,
  updateEmployeeDoc,
  deactivateEmployeeDoc,
  deleteEmployeeDoc,
} from '@/docs/contexts/hr/employee';

@ApiTags('Employee')
@Controller('employee')
@UseGuards(AuthenticationGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('user/:user_id')
  async getEmployeeByUserId(@Param('user_id') user_id: string) {
    return this.employeeService.getEmployeeByUserId(user_id);
  }

  // Uniqueness probe — checks the global UNIQUE constraints on employee
  // (doc_number, email). For phone, the column is not unique at the database
  // level but we still want the frontend to warn about repetitions inside the
  // same tenant.
  @Get('availability')
  async checkAvailability(
    @Query('field') field: string,
    @Query('value') value: string,
    @Query('tenant_id') tenantId?: string,
    @Query('exclude_id') excludeId?: string,
  ) {
    return this.employeeService.checkAvailability(
      field,
      value,
      tenantId,
      excludeId,
    );
  }

  @ApiOperation(getEmployeesByTenantDoc.operation)
  @ApiResponse(getEmployeesByTenantDoc.responses[200])
  @ApiResponse(getEmployeesByTenantDoc.responses[401])
  @Get(':tenant_id')
  async getEmployeesByTenant(@Param('tenant_id') tenant_id: string) {
    return this.employeeService.getEmployeesByTenant(tenant_id);
  }

  @ApiOperation(getEmployeeByIdDoc.operation)
  @ApiResponse(getEmployeeByIdDoc.responses[200])
  @ApiResponse(getEmployeeByIdDoc.responses[401])
  @ApiResponse(getEmployeeByIdDoc.responses[404])
  @Get('detail/:id')
  async getEmployeeById(@Param('id') id: string) {
    return this.employeeService.getEmployeeById(id);
  }

  @ApiOperation(createEmployeeDoc.operation)
  @ApiResponse(createEmployeeDoc.responses[201])
  @ApiResponse(createEmployeeDoc.responses[400])
  @ApiResponse(createEmployeeDoc.responses[401])
  @Post()
  async createEmployee(@Body() data: NewEmployeeDto) {
    return this.employeeService.createEmployeeWithContract(data);
  }

  @ApiOperation(updateEmployeeDoc.operation)
  @ApiResponse(updateEmployeeDoc.responses[200])
  @ApiResponse(updateEmployeeDoc.responses[400])
  @ApiResponse(updateEmployeeDoc.responses[401])
  @ApiResponse(updateEmployeeDoc.responses[404])
  @Patch(':id')
  async updateEmployee(
    @Param('id') id: string,
    @Body() data: UpdateEmployeeDto,
  ) {
    return this.employeeService.updateEmployeeInfo(id, data);
  }

  @Post(':id/terminate')
  async terminateEmployee(
    @Param('id') id: string,
    @Body() data: TerminateEmployeeDto,
    @Session() user: IUserSession,
  ) {
    return this.employeeService.terminate(id, user.tenant_id, data);
  }

  @Patch(':id/termination')
  async updateTermination(
    @Param('id') id: string,
    @Body() data: UpdateTerminationDto,
    @Session() user: IUserSession,
  ) {
    return this.employeeService.updateTermination(id, user.tenant_id, data);
  }

  @ApiOperation(deactivateEmployeeDoc.operation)
  @ApiResponse(deactivateEmployeeDoc.responses[200])
  @ApiResponse(deactivateEmployeeDoc.responses[401])
  @ApiResponse(deactivateEmployeeDoc.responses[404])
  @Patch('deactivate/:id')
  async deactivateEmployee(@Param('id') id: string) {
    return this.employeeService.deactivateEmployee(id);
  }

  @ApiOperation(deleteEmployeeDoc.operation)
  @ApiResponse(deleteEmployeeDoc.responses[200])
  @ApiResponse(deleteEmployeeDoc.responses[401])
  @ApiResponse(deleteEmployeeDoc.responses[404])
  @Delete(':id')
  async deleteEmployee(@Param('id') id: string) {
    return this.employeeService.deleteEmployee(id);
  }
}
