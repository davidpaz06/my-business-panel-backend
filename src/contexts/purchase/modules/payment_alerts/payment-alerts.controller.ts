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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { PaymentAlertsService } from './payment-alerts.service';
import { UpsertPaymentAlertConfigDto } from './dto/upsert-payment-alert-config.dto';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Payment Alerts')
@UseGuards(AuthenticationGuard, RateLimitGuard)
@Controller('payment-alerts')
export class PaymentAlertsController {
  constructor(private readonly paymentAlertsService: PaymentAlertsService) {}

  @ApiOperation({ summary: 'Listar alertas de pago pendientes' })
  @ApiResponse({ status: 200, description: 'Alertas obtenidas correctamente' })
  @Get()
  findAll(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.paymentAlertsService.getPendingAlerts(session, tenantId);
  }

  @ApiOperation({ summary: 'Obtener estadisticas de alertas de pago' })
  @ApiResponse({
    status: 200,
    description: 'Estadisticas de alertas obtenidas correctamente',
  })
  @Get('stats')
  getStats(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.paymentAlertsService.getStats(session, tenantId);
  }

  @ApiOperation({ summary: 'Obtener configuracion de alertas de pago' })
  @ApiResponse({
    status: 200,
    description: 'Configuracion de alertas obtenida correctamente',
  })
  @Get('config')
  getConfig(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.paymentAlertsService.getConfig(session, tenantId);
  }

  @ApiOperation({ summary: 'Crear o actualizar configuracion de alertas' })
  @ApiResponse({
    status: 200,
    description: 'Configuracion de alertas actualizada correctamente',
  })
  @Post('config')
  upsertConfig(
    @Body() dto: UpsertPaymentAlertConfigDto,
    @Session() session: IUserSession,
  ) {
    return this.paymentAlertsService.upsertConfig(dto, session);
  }

  @ApiOperation({ summary: 'Generar alertas de pago pendientes' })
  @ApiResponse({
    status: 200,
    description: 'Alertas de pago generadas correctamente',
  })
  @Post('generate')
  @RateLimit('bulk')
  generate(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.paymentAlertsService.generate(session, tenantId);
  }

  @ApiOperation({ summary: 'Resolver manualmente una alerta de pago' })
  @ApiResponse({
    status: 200,
    description: 'Alerta de pago resuelta correctamente',
  })
  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Session() session: IUserSession) {
    return this.paymentAlertsService.resolve(id, session);
  }
}
