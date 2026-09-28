import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CashFlowService } from './cash-flow.service';
import { GetCashFlowDto } from './dto/cash-flow.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Finances - Cash Flow')
@UseGuards(AuthenticationGuard)
@Controller('finances/cash-flow')
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @ApiOperation({ summary: 'Flujo de caja historico por periodo y agrupacion' })
  @Get()
  getCashFlow(@Query() dto: GetCashFlowDto, @Session() session: IUserSession) {
    return this.cashFlowService.getCashFlow(
      dto.startDate,
      dto.endDate,
      dto.groupBy,
      dto.branchId,
      session,
    );
  }

  @ApiOperation({ summary: 'Proyecciones de flujo de caja futuras' })
  @Get('projections')
  getProjections(@Session() session: IUserSession) {
    return this.cashFlowService.getProjections(session);
  }
}
