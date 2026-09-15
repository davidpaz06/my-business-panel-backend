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
import { SettlementService } from './settlement.service';
import {
  CreateSettlementDto,
  PaySettlementDto,
  VoidSettlementDto,
} from './dto/settlement.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Settlement')
@Controller('settlement')
@UseGuards(AuthenticationGuard)
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

  @Get('indemnity-applies')
  indemnityApplies(@Query('terminationType') terminationType: string) {
    return this.service.indemnityAppliesCheck(terminationType);
  }

  @Get('preview/:employeeId')
  preview(
    @Param('employeeId') employeeId: string,
    @Query('endDate') endDate: string,
    @Query('breakdown') breakdown: string,
    @Query('onlyDeductions') onlyDeductions: string,
    @Query('hireDate') hireDate: string,
    @Session() user: IUserSession,
  ) {
    return this.service.preview(user.tenant_id, employeeId, endDate, {
      breakdown: breakdown === 'true',
      onlyDeductions: onlyDeductions === 'true',
      hireDateOverride: hireDate || undefined,
    });
  }

  @Get('overdue')
  overdue(@Session() user: IUserSession) {
    return this.service.overdue(user.tenant_id);
  }

  @Post()
  create(@Body() body: CreateSettlementDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }

  @Post(':id/pay')
  pay(
    @Param('id') id: string,
    @Body() body: PaySettlementDto,
    @Session() user: IUserSession,
  ) {
    return this.service.pay(user.tenant_id, id, body);
  }

  @Post(':id/void')
  void_(
    @Param('id') id: string,
    @Body() _body: VoidSettlementDto,
    @Session() user: IUserSession,
  ) {
    return this.service.void(user.tenant_id, id);
  }

  @Get(':id/receipt')
  receipt(@Param('id') id: string, @Session() user: IUserSession) {
    return this.service.getById(user.tenant_id, id, true);
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @Query('breakdown') breakdown: string,
    @Session() user: IUserSession,
  ) {
    return this.service.getById(user.tenant_id, id, breakdown === 'true');
  }
}
