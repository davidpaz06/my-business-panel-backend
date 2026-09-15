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
import { DeductionsService } from './deductions.service';
import {
  CreateDeductionDto,
  UpdateDeductionDto,
  ApplyDeductionPaymentDto,
} from './dto/deduction.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Deductions')
@Controller('deductions')
@UseGuards(AuthenticationGuard)
export class DeductionsController {
  constructor(private readonly service: DeductionsService) {}

  @Post()
  create(@Body() body: CreateDeductionDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }

  @Get('union-remittance')
  async unionRemittance(
    @Query('period') period: string,
    @Query('organization') organization: string,
  ) {
    // No existe tabla de remesas/cheques emitidos (fuera de alcance
    // de las migraciones hr/006..018). Se documenta como diferido.
    return {
      note:
        'Registro de entregas al sindicato no implementado: no hay tabla de ' +
        'remesas en el schema. Requiere una migracion nueva, fuera de este alcance.',
      period,
      organization,
    };
  }

  @Get(':employeeId/available-margin')
  availableMargin(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    return this.service.availableMargin(user.tenant_id, employeeId, date);
  }

  @Get(':employeeId/settlement-compensation')
  settlementCompensation(
    @Param('employeeId') employeeId: string,
    @Query('settlementId') settlementId: string,
    @Session() user: IUserSession,
  ) {
    return this.service.settlementCompensation(
      user.tenant_id,
      employeeId,
      settlementId,
    );
  }

  @Get(':employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('active') active: string,
    @Session() user: IUserSession,
  ) {
    return this.service.listByEmployee(
      employeeId,
      active === undefined ? undefined : active === 'true',
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateDeductionDto,
    @Session() user: IUserSession,
  ) {
    return this.service.update(user.tenant_id, id, body);
  }

  @Post(':id/apply')
  apply(
    @Param('id') id: string,
    @Body() body: ApplyDeductionPaymentDto,
    @Session() user: IUserSession,
  ) {
    return this.service.applyPayment(user.tenant_id, id, body);
  }
}
