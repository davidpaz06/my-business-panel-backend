import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/holiday.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Holidays')
@Controller('holidays')
@UseGuards(AuthenticationGuard)
export class HolidaysController {
  constructor(private readonly service: HolidaysService) {}

  @Get('check')
  check(@Query('date') date: string, @Session() user: IUserSession) {
    return this.service.checkDate(user.tenant_id, date);
  }

  @Get('declared-count')
  declaredCount(@Query('year') year: string, @Session() user: IUserSession) {
    return this.service.declaredCount(user.tenant_id, Number(year));
  }

  @Get()
  list(
    @Query('year') year: string,
    @Query('recurring') recurring: string,
    @Session() user: IUserSession,
  ) {
    const recurringFilter =
      recurring === undefined ? undefined : recurring === 'true';
    return this.service.listByYear(
      user.tenant_id,
      Number(year),
      recurringFilter,
    );
  }

  @Post()
  create(@Body() body: CreateHolidayDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }
}
