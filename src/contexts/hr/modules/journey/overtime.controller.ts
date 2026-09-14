import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OvertimeService } from './overtime.service';
import { CreateOvertimeDto, ValidateOvertimeDto } from './dto/overtime.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Overtime')
@Controller('overtime')
@UseGuards(AuthenticationGuard)
export class OvertimeController {
  constructor(private readonly service: OvertimeService) {}

  @Post()
  create(@Body() body: CreateOvertimeDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }

  @Post('validate')
  validate(@Body() body: ValidateOvertimeDto, @Session() user: IUserSession) {
    return this.service.validate(
      user.tenant_id,
      body.employee_id,
      body.work_date,
      body.hours,
    );
  }

  @Get('accumulated/:employeeId')
  accumulated(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getAccumulated(
      user.tenant_id,
      employeeId,
      date,
      explain === 'true',
    );
  }

  @Get(':employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('kind') kind: string,
    @Session() user: IUserSession,
  ) {
    return this.service.listByEmployee(user.tenant_id, employeeId, from, to, kind);
  }
}
