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
import { ParametersService } from './parameters.service';
import { CreatePayrollParameterDto } from './dto/payroll-parameter.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('PayrollParameters')
@Controller('payroll-parameters')
@UseGuards(AuthenticationGuard)
export class ParametersController {
  constructor(private readonly service: ParametersService) {}

  @Get()
  list(@Session() user: IUserSession) {
    return this.service.listByTenant(user.tenant_id);
  }

  @Get('resolve/:key')
  async resolve(
    @Param('key') key: string,
    @Query('date') date: string,
    @Session() user: IUserSession,
  ) {
    const value = await this.service.resolve(user.tenant_id, key, date);
    return { param_key: key, param_value: value.toFixed(6), date };
  }

  /**
   * Parametros obligatorios sin fila vigente a la fecha (tasa_activa_bcv,
   * salario_minimo_nacional): sin ellos, severance/mora truenan en
   * runtime. Pensado para alertar ANTES de correr nomina/liquidaciones.
   */
  @Get('missing')
  async missing(@Query('date') date: string, @Session() user: IUserSession) {
    return this.service.listMissingRequired(user.tenant_id, date);
  }

  @Post()
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('admin', 'superuser')
  create(
    @Body() body: CreatePayrollParameterDto,
    @Session() user: IUserSession,
  ) {
    return this.service.create(user.tenant_id, body);
  }
}
