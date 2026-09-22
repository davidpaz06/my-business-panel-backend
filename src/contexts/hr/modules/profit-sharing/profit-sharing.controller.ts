import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProfitSharingService } from './profit-sharing.service';
import { ProfitSharingPeriodService } from './profit-sharing-period.service';
import {
  CreateProfitPeriodDto,
  SetLiquidBenefitsDto,
  UpdatePercentageDto,
  YearEndBonusDto,
} from './dto/profit-sharing.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('ProfitSharing')
@Controller('profit-sharing')
@UseGuards(AuthenticationGuard)
export class ProfitSharingController {
  constructor(
    private readonly service: ProfitSharingService,
    private readonly periods: ProfitSharingPeriodService,
  ) {}

  @Post('periods')
  createPeriod(
    @Body() body: CreateProfitPeriodDto,
    @Session() user: IUserSession,
  ) {
    return this.periods.create(user.tenant_id, body);
  }

  @Post('periods/:id/liquid-benefits')
  setLiquidBenefits(
    @Param('id') id: string,
    @Body() body: SetLiquidBenefitsDto,
    @Session() user: IUserSession,
  ) {
    return this.periods.setLiquidBenefits(user.tenant_id, id, body);
  }

  @Patch('periods/:id')
  updatePercentage(
    @Param('id') id: string,
    @Body() body: UpdatePercentageDto,
    @Session() user: IUserSession,
  ) {
    return this.periods.updatePercentage(user.tenant_id, id, body);
  }

  @Post('periods/:id/calculate')
  calculate(@Param('id') id: string, @Session() user: IUserSession) {
    return this.periods.calculate(user.tenant_id, id);
  }

  @Post('periods/:id/close')
  close(@Param('id') id: string, @Session() user: IUserSession) {
    return this.periods.close(user.tenant_id, id);
  }

  @Get('periods/:id/details/:employeeId')
  detailByEmployee(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.getDetailByEmployee(user.tenant_id, id, employeeId);
  }

  @Get('periods/:id/details')
  details(
    @Param('id') id: string,
    @Query('appliedCap') appliedCap: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.listDetails(user.tenant_id, id);
  }

  @Get('periods/:id/preview')
  preview(
    @Param('id') id: string,
    @Query('hireDate') hireDate: string,
    @Session() user: IUserSession,
  ) {
    return this.periods.preview(user.tenant_id, id, hireDate);
  }

  @Get('periods')
  listPeriods(@Session() user: IUserSession) {
    return this.periods.listByTenant(user.tenant_id);
  }

  @Get('periods/:id')
  getPeriod(@Param('id') id: string, @Session() user: IUserSession) {
    return this.periods.getById(user.tenant_id, id);
  }

  @Get('fraction/:employeeId')
  fraction(
    @Param('employeeId') employeeId: string,
    @Query('endDate') endDate: string,
    @Session() user: IUserSession,
  ) {
    return this.service.fraction(user.tenant_id, employeeId, endDate);
  }

  @Get('year-end-bonus/preview/:employeeId')
  yearEndBonusPreview(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
    @Query('explain') explain: string,
    @Session() user: IUserSession,
  ) {
    return this.service.yearEndBonusPreview(
      user.tenant_id,
      employeeId,
      Number(year),
      explain === 'true',
    );
  }

  @Post('year-end-bonus')
  payYearEndBonus(
    @Body() body: YearEndBonusDto,
    @Session() user: IUserSession,
  ) {
    return this.service.payYearEndBonus(user.tenant_id, body);
  }

  @Get('year-end-bonus')
  listYearEndBonus(
    @Query('fiscalYear') fiscalYear: string,
    @Session() user: IUserSession,
  ) {
    return this.service.listYearEndBonus(user.tenant_id, Number(fiscalYear));
  }
}
