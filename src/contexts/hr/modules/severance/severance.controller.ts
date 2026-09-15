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
import { SeveranceService } from './severance.service';
import { SeveranceDepositService } from './severance-deposit.service';
import { SeveranceInterestService } from './severance-interest.service';
import { SeveranceAdvanceService } from './severance-advance.service';
import {
  ApproveAdvanceDto,
  CreateAdvanceDto,
  GenerateDepositsDto,
  GenerateInterestDto,
  RejectAdvanceDto,
  SettleInterestDto,
  UpdateDepositDto,
} from './dto/severance.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Severance')
@Controller('severance')
@UseGuards(AuthenticationGuard)
export class SeveranceController {
  constructor(
    private readonly severance: SeveranceService,
    private readonly depositService: SeveranceDepositService,
    private readonly interestService: SeveranceInterestService,
    private readonly advanceService: SeveranceAdvanceService,
  ) {}

  // ---- Calculo (Art. 142) ----

  @Get('additional-days')
  additionalDays(@Query('years') years: string) {
    return this.severance.additionalDaysPreview(Number(years));
  }

  @Get('retroactive-preview')
  retroactivePreview(
    @Query('hireDate') hireDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.severance.retroactivePreview(hireDate, endDate);
  }

  @Get('calculate')
  calculatePreview(
    @Query('hireDate') hireDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.severance.calculatePreview(hireDate, endDate);
  }

  @Get('calculate/:employeeId')
  calculate(
    @Param('employeeId') employeeId: string,
    @Query('endDate') endDate: string,
    @Session() user: IUserSession,
  ) {
    return this.severance.calculate(user.tenant_id, employeeId, endDate);
  }

  // ---- Depositos (Art. 142.a, 143) ----

  @Post('deposits/generate')
  generateDeposits(
    @Body() body: GenerateDepositsDto,
    @Session() user: IUserSession,
  ) {
    return this.depositService.generate(user.tenant_id, body);
  }

  @Get('deposits/:employeeId/pending')
  pendingDeposits(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.depositService.listPending(user.tenant_id, employeeId);
  }

  @Get('deposits/:employeeId')
  listDeposits(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.depositService.listByEmployee(user.tenant_id, employeeId);
  }

  @Patch('deposits/:depositId')
  updateDeposit(
    @Param('depositId') depositId: string,
    @Body() body: UpdateDepositDto,
    @Session() user: IUserSession,
  ) {
    return this.depositService.updateDepositMade(
      user.tenant_id,
      depositId,
      body,
    );
  }

  // ---- Intereses (Art. 143) ----

  @Get('interest/rate')
  interestRate(
    @Query('location') location: string,
    @Query('depositMade') depositMade: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    return this.interestService.getRate(
      user.tenant_id,
      location,
      depositMade === 'true',
      date,
    );
  }

  @Post('interest/generate')
  generateInterest(
    @Body() body: GenerateInterestDto,
    @Session() user: IUserSession,
  ) {
    return this.interestService.generate(user.tenant_id, body);
  }

  @Post('interest/settle')
  settleInterest(@Body() body: SettleInterestDto) {
    return this.interestService.settle(body);
  }

  @Get('interest/:employeeId')
  listInterest(
    @Param('employeeId') employeeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.interestService.listByEmployee(employeeId, from, to);
  }

  // ---- Anticipos (Art. 144) ----

  @Get('advances/:employeeId/available')
  availableAdvance(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.advanceService.available(user.tenant_id, employeeId, today);
  }

  @Post('advances')
  createAdvance(@Body() body: CreateAdvanceDto, @Session() user: IUserSession) {
    return this.advanceService.create(user.tenant_id, body);
  }

  @Post('advances/:advanceId/approve')
  approveAdvance(
    @Param('advanceId') advanceId: string,
    @Body() body: ApproveAdvanceDto,
    @Session() user: IUserSession,
  ) {
    return this.advanceService.approve(user.tenant_id, advanceId, body);
  }

  @Post('advances/:advanceId/reject')
  rejectAdvance(
    @Param('advanceId') advanceId: string,
    @Body() body: RejectAdvanceDto,
    @Session() user: IUserSession,
  ) {
    return this.advanceService.reject(user.tenant_id, advanceId, body);
  }

  @Get('advances/:employeeId')
  listAdvances(@Param('employeeId') employeeId: string) {
    return this.advanceService.listByEmployee(employeeId);
  }

  // ---- Saldo consolidado ----

  @Get('balance/:employeeId')
  async balance(@Param('employeeId') employeeId: string) {
    const [deposited, capitalized, advanced, total] = await Promise.all([
      this.depositService.sumMadeAmount(employeeId),
      this.interestService.sumCapitalized(employeeId),
      this.advanceService.sumApproved(employeeId),
      this.advanceService.balance(employeeId),
    ]);

    return {
      depositedAmount: deposited.toFixed(4),
      capitalizedInterest: capitalized.toFixed(4),
      advancesApproved: advanced.toFixed(4),
      balance: total.toFixed(4),
    };
  }
}
