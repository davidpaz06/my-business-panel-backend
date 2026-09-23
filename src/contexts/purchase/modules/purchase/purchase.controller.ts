import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  createPurchaseOrderDoc,
  threeWayMatchingDoc,
  registerPaymentDoc,
  getAllPurchaseOrdersDoc,
  getPurchaseOrderByIdDoc,
  getThreeWayMatchingDoc,
  updateOrderStatusDoc,
  updatePurchaseOrderDoc,
} from '@/docs/contexts/purchase/purchase';

@ApiTags('Purchase')
@UseGuards(AuthenticationGuard)
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @ApiOperation(createPurchaseOrderDoc.operation)
  @ApiResponse(createPurchaseOrderDoc.responses[201])
  @ApiResponse(createPurchaseOrderDoc.responses[401])
  @Post()
  createPurchaseOrder(
    @Body() createPurchaseDto: CreatePurchaseDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.createPurchaseOrder(createPurchaseDto, session);
  }

  @ApiOperation(threeWayMatchingDoc.operation)
  @ApiResponse(threeWayMatchingDoc.responses[201])
  @ApiResponse(threeWayMatchingDoc.responses[400])
  @ApiResponse(threeWayMatchingDoc.responses[401])
  @Post('twm')
  threeWayMatching(
    @Body() createPurchaseDto: any,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.threeWayMatching(createPurchaseDto, session);
  }

  @ApiOperation(registerPaymentDoc.operation)
  @ApiResponse(registerPaymentDoc.responses[201])
  @ApiResponse(registerPaymentDoc.responses[400])
  @ApiResponse(registerPaymentDoc.responses[401])
  @Post('payment')
  registerPayment(
    @Body() dto: CreatePaymentDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.registerPayment(dto, session);
  }

  @ApiOperation({ summary: 'Actualizar un pago ya registrado' })
  @ApiResponse({ status: 200, description: 'Pago actualizado correctamente' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado' })
  @Patch('payment/:id')
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.updatePayment(id, dto, session);
  }

  @ApiOperation(getAllPurchaseOrdersDoc.operation)
  @ApiResponse(getAllPurchaseOrdersDoc.responses[200])
  @ApiResponse(getAllPurchaseOrdersDoc.responses[401])
  @Get()
  getAllPurchaseOrders(@Session() session: IUserSession) {
    return this.purchaseService.getAllPurchaseOrders(session);
  }

  @ApiOperation({ summary: 'Obtener catálogos del módulo de compras' })
  @ApiResponse({
    status: 200,
    description: 'Catálogos obtenidos correctamente',
  })
  @Get('catalogs')
  getPurchaseCatalogs() {
    return this.purchaseService.getPurchaseCatalogs();
  }

  @ApiOperation({
    summary: 'Tasa de cambio USD -> VES efectiva del tenant (base + diferencial)',
  })
  @ApiResponse({ status: 200, description: 'Tasa de cambio obtenida' })
  @Get('exchange-rate')
  getExchangeRate(@Session() user: IUserSession) {
    return this.purchaseService.getExchangeRate(user.tenant_id);
  }

  @ApiOperation({ summary: 'Listar cuentas por pagar de compras' })
  @ApiResponse({
    status: 200,
    description: 'Cuentas por pagar obtenidas correctamente',
  })
  @Get('payables')
  getAccountsPayable(@Session() session: IUserSession) {
    return this.purchaseService.getAccountsPayable(session);
  }

  @ApiOperation(getThreeWayMatchingDoc.operation)
  @ApiResponse(getThreeWayMatchingDoc.responses[200])
  @ApiResponse(getThreeWayMatchingDoc.responses[401])
  @Get(':id/matching')
  getThreeWayMatching(
    @Param('id') id: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.getThreeWayMatching(id, session);
  }

  @ApiOperation(getPurchaseOrderByIdDoc.operation)
  @ApiResponse(getPurchaseOrderByIdDoc.responses[200])
  @ApiResponse(getPurchaseOrderByIdDoc.responses[401])
  @ApiResponse(getPurchaseOrderByIdDoc.responses[404])
  @Get(':id')
  getPurchaseOrderById(
    @Param('id') id: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.getPurchaseOrderById(id, session);
  }

  @ApiOperation(updateOrderStatusDoc.operation)
  @ApiResponse(updateOrderStatusDoc.responses[200])
  @ApiResponse(updateOrderStatusDoc.responses[400])
  @ApiResponse(updateOrderStatusDoc.responses[401])
  @ApiResponse(updateOrderStatusDoc.responses[404])
  @Patch(':id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.updateOrderStatus(id, dto.status_id, session);
  }

  @ApiOperation(updatePurchaseOrderDoc.operation)
  @ApiResponse(updatePurchaseOrderDoc.responses[200])
  @ApiResponse(updatePurchaseOrderDoc.responses[401])
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePurchaseDto: UpdatePurchaseDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.updatePurchaseOrder(
      id,
      updatePurchaseDto,
      session,
    );
  }
}
