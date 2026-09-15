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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { CollectionAlertsService } from './collection-alerts.service';
import { UpsertCollectionAlertConfigDto } from './dto/upsert-collection-alert-config.dto';

@ApiTags('Collection Alerts')
@UseGuards(AuthenticationGuard)
@Controller('pos/collection-alerts')
export class CollectionAlertsController {
  constructor(
    private readonly collectionAlertsService: CollectionAlertsService,
  ) {}

  @ApiOperation({ summary: 'Listar alertas de cobro pendientes' })
  @Get()
  findAll(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collectionAlertsService.getPendingAlerts(session, tenantId);
  }

  @ApiOperation({ summary: 'Obtener estadísticas de alertas de cobro' })
  @Get('stats')
  getStats(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collectionAlertsService.getStats(session, tenantId);
  }

  @ApiOperation({ summary: 'Obtener configuración de alertas de cobro' })
  @Get('config')
  getConfig(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collectionAlertsService.getConfig(session, tenantId);
  }

  @ApiOperation({
    summary: 'Crear o actualizar configuración de alertas de cobro',
  })
  @Post('config')
  upsertConfig(
    @Body() dto: UpsertCollectionAlertConfigDto,
    @Session() session: IUserSession,
  ) {
    return this.collectionAlertsService.upsertConfig(dto, session);
  }

  @ApiOperation({ summary: 'Generar alertas de cobro pendientes' })
  @Post('generate')
  generate(
    @Session() session: IUserSession,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collectionAlertsService.generate(session, tenantId);
  }

  @ApiOperation({ summary: 'Resolver manualmente una alerta de cobro' })
  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Session() session: IUserSession) {
    return this.collectionAlertsService.resolve(id, session);
  }
}
