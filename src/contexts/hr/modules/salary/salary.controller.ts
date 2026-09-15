import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SalaryService } from './salary.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Salary')
@Controller('salary')
@UseGuards(AuthenticationGuard)
export class SalaryController {
  constructor(private readonly service: SalaryService) {}

  @Get(':employeeId/normal')
  getNormal(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getNormal(employeeId, user.tenant_id, date);
  }

  @Get(':employeeId/integral')
  getIntegral(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getIntegral(
      employeeId,
      user.tenant_id,
      date,
      explain === 'true',
    );
  }
}
