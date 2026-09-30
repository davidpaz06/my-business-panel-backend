import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';
import { ApplySupplierCreditDto } from './dto/apply-supplier-credit.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';
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
    summary:
      'Tasa de cambio USD -> VES efectiva del tenant (base + diferencial)',
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

  @ApiOperation({
    summary: 'Creditos de proveedor disponibles',
    description:
      'Saldo a favor originado por notas de credito de venta por mercancia danada, aplicable contra una cuenta por pagar de este proveedor.',
  })
  @ApiResponse({ status: 200, description: 'Creditos disponibles obtenidos' })
  @Get('supplier-credits')
  listSupplierCredits(
    @Query('supplier_id') supplierId: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.listSupplierCredits(supplierId, session);
  }

  @ApiOperation({
    summary: 'Aplicar un credito de proveedor a una cuenta por pagar',
  })
  @ApiResponse({ status: 200, description: 'Credito aplicado correctamente' })
  @ApiResponse({
    status: 400,
    description: 'Credito ya aplicado/anulado o sin saldo pendiente',
  })
  @ApiResponse({
    status: 404,
    description: 'Credito o cuenta por pagar no encontrados',
  })
  @Post('supplier-credits/:id/apply')
  applySupplierCredit(
    @Param('id') id: string,
    @Body() dto: ApplySupplierCreditDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.applySupplierCredit(
      id,
      dto.purchase_account_payable_id,
      session,
    );
  }

  @ApiOperation({
    summary: 'Iniciar recepcion de mercancia',
    description:
      'Solo mientras la orden esta en estado "enviada" (Shipped). Crea un checklist editable de items precargado desde la orden -- corregilo con PATCH antes de confirmar si el proveedor envio mal la mercancia.',
  })
  @ApiResponse({ status: 200, description: 'Recepcion iniciada (PENDING)' })
  @ApiResponse({
    status: 403,
    description: 'La orden no esta en estado "enviada"',
  })
  @Post(':id/goods-receipt')
  startGoodsReceipt(@Param('id') id: string, @Session() session: IUserSession) {
    return this.purchaseService.startGoodsReceipt(id, session);
  }

  @ApiOperation({ summary: 'Ver el detalle de una recepcion de mercancia' })
  @ApiResponse({ status: 200, description: 'Recepcion obtenida' })
  @ApiResponse({ status: 404, description: 'Recepcion no encontrada' })
  @Get('goods-receipt/:goodsReceiptId')
  getGoodsReceipt(
    @Param('goodsReceiptId') goodsReceiptId: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.getGoodsReceipt(goodsReceiptId, session);
  }

  @ApiOperation({
    summary: 'Corregir items recibidos',
    description:
      'Solo mientras la recepcion esta PENDING. No modifica la orden original -- corrige lo que realmente llego.',
  })
  @ApiResponse({ status: 200, description: 'Items corregidos' })
  @ApiResponse({
    status: 403,
    description: 'La recepcion ya fue confirmada',
  })
  @Patch('goods-receipt/:goodsReceiptId')
  updateGoodsReceiptItems(
    @Param('goodsReceiptId') goodsReceiptId: string,
    @Body() dto: UpdateGoodsReceiptDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.updateGoodsReceiptItems(
      goodsReceiptId,
      dto,
      session,
    );
  }

  @ApiOperation({
    summary: 'Confirmar recepcion de mercancia',
    description:
      'Bloquea edicion, aplica inventario desde los items corregidos, corre three-way matching (puede abrir una disputa automatica si hay discrepancia) y mueve la orden a "entregada".',
  })
  @ApiResponse({ status: 200, description: 'Recepcion confirmada' })
  @ApiResponse({
    status: 403,
    description: 'La recepcion ya fue confirmada anteriormente',
  })
  @Post('goods-receipt/:goodsReceiptId/confirm')
  confirmGoodsReceipt(
    @Param('goodsReceiptId') goodsReceiptId: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.confirmGoodsReceipt(goodsReceiptId, session);
  }

  @ApiOperation({
    summary: 'Cancelar una recepcion de mercancia iniciada por error',
    description:
      'Solo mientras la recepcion esta PENDING. Borra el checklist para poder reiniciar la recepcion limpio.',
  })
  @ApiResponse({ status: 200, description: 'Recepcion cancelada' })
  @ApiResponse({
    status: 403,
    description: 'La recepcion ya fue confirmada, no se puede cancelar',
  })
  @Delete('goods-receipt/:goodsReceiptId')
  cancelGoodsReceipt(
    @Param('goodsReceiptId') goodsReceiptId: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.cancelGoodsReceipt(goodsReceiptId, session);
  }

  @ApiOperation({ summary: 'Reportar una discrepancia con el proveedor' })
  @ApiResponse({ status: 201, description: 'Disputa creada' })
  @ApiResponse({ status: 404, description: 'Orden de compra no encontrada' })
  @Post('disputes')
  createDispute(
    @Body() dto: CreateDisputeDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.createDispute(dto, session);
  }

  @ApiOperation({ summary: 'Listar disputas de una orden de compra' })
  @ApiResponse({ status: 200, description: 'Disputas obtenidas' })
  @Get('disputes')
  listDisputesByQuery(
    @Query('purchase_order_id') purchaseOrderId: string,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.listDisputes(purchaseOrderId, session);
  }

  @ApiOperation({ summary: 'Listar disputas de una orden de compra' })
  @ApiResponse({ status: 200, description: 'Disputas obtenidas' })
  @Get(':id/disputes')
  listDisputes(@Param('id') id: string, @Session() session: IUserSession) {
    return this.purchaseService.listDisputes(id, session);
  }

  @ApiOperation({ summary: 'Resolver una disputa abierta' })
  @ApiResponse({ status: 200, description: 'Disputa resuelta' })
  @ApiResponse({ status: 400, description: 'La disputa ya fue resuelta' })
  @ApiResponse({ status: 404, description: 'Disputa no encontrada' })
  @Patch('disputes/:disputeId/resolve')
  resolveDispute(
    @Param('disputeId') disputeId: string,
    @Body() dto: ResolveDisputeDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.resolveDispute(disputeId, dto, session);
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

  @ApiOperation({
    summary: 'Editar items de una factura de compra',
    description:
      'Solo permitido mientras la orden asociada esta en estado "enviada" (Shipped). Se bloquea al pasar a "entregada" (Delivered).',
  })
  @ApiResponse({ status: 200, description: 'Factura actualizada' })
  @ApiResponse({
    status: 403,
    description: 'La orden no esta en estado editable',
  })
  @ApiResponse({ status: 404, description: 'Factura no encontrada' })
  @Patch('invoices/:invoiceId')
  updateSupplierInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: UpdateSupplierInvoiceDto,
    @Session() session: IUserSession,
  ) {
    return this.purchaseService.updateSupplierInvoice(invoiceId, dto, session);
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
