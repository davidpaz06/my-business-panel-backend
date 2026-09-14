import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MoraService } from './mora.service';
import { CalculateMoraDto, SalaryMinimumDifferenceDto } from './dto/mora.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Mora')
@Controller('mora')
@UseGuards(AuthenticationGuard)
export class MoraController {
  constructor(private readonly service: MoraService) {}

  @Post('calculate')
  calculate(@Body() body: CalculateMoraDto, @Session() user: IUserSession) {
    return this.service.calculate(user.tenant_id, body);
  }

  @Get('nature')
  nature(@Query('debtKind') debtKind: string) {
    return this.service.nature(debtKind);
  }

  @Post('salary-minimum-difference')
  salaryMinimumDifference(
    @Body() body: SalaryMinimumDifferenceDto,
    @Session() user: IUserSession,
  ) {
    return this.service.salaryMinimumDifference(user.tenant_id, body);
  }
}
