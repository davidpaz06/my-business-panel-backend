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
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@ApiTags('Purchase Disputes')
@UseGuards(AuthenticationGuard)
@Controller('purchase/disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @ApiOperation({ summary: 'Reportar una discrepancia con el proveedor' })
  @ApiResponse({ status: 201, description: 'Discrepancia registrada' })
  @ApiResponse({ status: 404, description: 'Orden de compra no encontrada' })
  @Post()
  create(@Body() dto: CreateDisputeDto, @Session() session: IUserSession) {
    return this.disputesService.create(dto, session);
  }

  @ApiOperation({ summary: 'Listar discrepancias de una orden de compra' })
  @ApiResponse({ status: 200, description: 'Discrepancias obtenidas' })
  @Get()
  listByOrder(
    @Query('purchase_order_id') purchaseOrderId: string,
    @Session() session: IUserSession,
  ) {
    return this.disputesService.listByOrder(purchaseOrderId, session);
  }

  @ApiOperation({ summary: 'Marcar una discrepancia como resuelta' })
  @ApiResponse({ status: 200, description: 'Discrepancia resuelta' })
  @ApiResponse({ status: 404, description: 'Discrepancia no encontrada' })
  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @Session() session: IUserSession,
  ) {
    return this.disputesService.resolve(id, dto, session);
  }
}
