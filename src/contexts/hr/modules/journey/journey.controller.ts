import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JourneyService } from './journey.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Journey')
@Controller('journey')
@UseGuards(AuthenticationGuard)
export class JourneyController {
  constructor(private readonly service: JourneyService) {}

  @Get('limits/:contractId')
  limitsByContract(@Param('contractId') contractId: string) {
    return this.service.getLimitsByContract(contractId);
  }

  @Get('limits')
  limits(
    @Query('journeyType') journeyType: string,
    @Query('regime') regime: string,
  ) {
    return this.service.getLimits(journeyType, regime);
  }

  @Post('classify')
  classify(@Body() body: { start_time: string; end_time: string }) {
    return this.service.classify(body.start_time, body.end_time);
  }

  @Get('night-bonus/:employeeId')
  nightBonus(
    @Param('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getNightBonus(
      user.tenant_id,
      employeeId,
      from,
      to,
      explain === 'true',
    );
  }

  @Get('overtime-pay/:employeeId')
  overtimePay(
    @Param('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getOvertimePay(user.tenant_id, employeeId, from, to);
  }

  @Get('holiday-pay/:employeeId')
  holidayPay(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getHolidayPay(user.tenant_id, employeeId, date);
  }
}
