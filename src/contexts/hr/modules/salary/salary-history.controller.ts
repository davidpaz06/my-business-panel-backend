import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SalaryHistoryService } from './salary-history.service';
import { CreateSalaryHistoryDto } from './dto/salary-history.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('SalaryHistory')
@Controller('salary-history')
@UseGuards(AuthenticationGuard)
export class SalaryHistoryController {
  constructor(private readonly service: SalaryHistoryService) {}

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.service.listByEmployee(employeeId, user.tenant_id);
  }

  @Post()
  create(@Body() body: CreateSalaryHistoryDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }
}
