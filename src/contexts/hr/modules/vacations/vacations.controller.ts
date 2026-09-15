import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VacationsService } from './vacations.service';
import { VacationPeriodService } from './vacation-period.service';
import { EnjoyVacationDto, PayBonusDto } from './dto/vacation.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Vacations')
@Controller('vacations')
@UseGuards(AuthenticationGuard)
export class VacationsController {
  constructor(
    private readonly service: VacationsService,
    private readonly periods: VacationPeriodService,
  ) {}

  @Get('entitlement/:employeeId')
  entitlementByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('years') years: string,
    @Query('includeBonus') includeBonus: string,
    @Query('includeShiftCompensation') includeShiftCompensation: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    return this.service.entitlementByEmployee(
      user.tenant_id,
      employeeId,
      years !== undefined ? Number(years) : undefined,
      includeBonus === 'true',
      includeShiftCompensation === 'true',
      date,
    );
  }

  @Get('entitlement')
  entitlement(@Query('years') years: string) {
    return this.service.entitlement(Number(years));
  }

  @Get('bonus-entitlement')
  bonusEntitlement(@Query('years') years: string) {
    return this.service.bonusEntitlement(Number(years));
  }

  @Get('fraction')
  fraction(
    @Query('hireDate') hireDate: string,
    @Query('endDate') endDate: string,
    @Query('explain') explain: string,
  ) {
    return this.service.fraction(hireDate, endDate, explain === 'true');
  }

  @Get('settlement-preview/:employeeId')
  settlementPreview(
    @Param('employeeId') employeeId: string,
    @Query('endDate') endDate: string,
    @Session() user: IUserSession,
  ) {
    return this.service.settlementPreview(user.tenant_id, employeeId, endDate);
  }

  @Post('periods/generate')
  generatePeriods(
    @Body() body: { employee_id: string; until: string },
    @Session() user: IUserSession,
  ) {
    return this.periods.generate(user.tenant_id, body.employee_id, body.until);
  }

  @Get('periods/:employeeId/pending')
  pendingPeriods(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.listPending(user.tenant_id, employeeId);
  }

  @Get('periods/:employeeId')
  listPeriods(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.listByEmployee(user.tenant_id, employeeId);
  }

  @Post('periods/:periodId/enjoy')
  enjoy(
    @Param('periodId') periodId: string,
    @Body() body: EnjoyVacationDto,
    @Session() user: IUserSession,
  ) {
    return this.periods.enjoy(user.tenant_id, periodId, body);
  }

  @Get('periods/:periodId/amount')
  amount(
    @Param('periodId') periodId: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.amount(user.tenant_id, periodId, explain === 'true');
  }

  @Get('periods/:periodId/bonus-amount')
  bonusAmount(
    @Param('periodId') periodId: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.bonusAmount(user.tenant_id, periodId);
  }

  @Post('periods/:periodId/pay-bonus')
  payBonus(
    @Param('periodId') periodId: string,
    @Body() body: PayBonusDto,
    @Session() user: IUserSession,
  ) {
    return this.periods.payBonus(user.tenant_id, periodId, body);
  }

  @Get('pending-value/:employeeId')
  pendingValue(
    @Param('employeeId') employeeId: string,
    @Query('endDate') endDate: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.pendingValue(
      user.tenant_id,
      employeeId,
      endDate,
      explain === 'true',
    );
  }
}
