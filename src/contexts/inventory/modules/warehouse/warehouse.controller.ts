import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WarehouseService } from './warehouse.service';
import { Warehouse } from './interfaces/warehouse.interface';
import { CreateWarehouseDto } from './dto/create_warehouse.dto';
import { UpdateWarehouseDto } from './dto/update_warehouse.dto';
import { BulkInsertInventoryDto } from './dto/bulk_insert_inventory.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
// import { LevelAuthorizationGuard } from "@/common/guards/level_authorization.guard";
import { UseGuards } from '@nestjs/common';
import { Body, Post } from '@nestjs/common';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { AddProductToWarehouseDto } from './dto/add_product_to_warehouse.dto';
import { CreateDiscrepancyReport } from './dto/create_discrepancy_report.dto';
import { CountAllInWarehouseDto } from './dto/count_all_in_warehouse.dto';
import { InventoryTransferProduct } from './interfaces/inventory_transfer_product.interface';
import {
  InventoryTransferDto,
  InventoryTransferProductDto,
} from './dto/inventory_transfer.dto';
import { UpdateInventoryItemDto } from './dto/update_inventory_item.dto';
import {
  createWarehouseDoc,
  deleteWarehouseDoc,
  addProductToWarehouseDoc,
  getAllWarehousesDoc,
  countAllInWarehouseDoc,
  generateDiscrepancyReportDoc,
  getAllDiscrepancyReportsDoc,
  getDiscrepancyReportByIdDoc,
  transferInventoryDoc,
} from '@/docs/contexts/inventory/warehouse';

@ApiTags('Warehouse')
@UseGuards(AuthenticationGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @ApiOperation(createWarehouseDoc.operation)
  @ApiResponse(createWarehouseDoc.responses[201])
  @ApiResponse(createWarehouseDoc.responses[401])
  @ApiResponse(createWarehouseDoc.responses[404])
  @Post()
  createWarehouse(
    @Body() createWarehouseDto: CreateWarehouseDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.createWarehouse(
      createWarehouseDto,
      userSession.tenant_id,
    );
  }

  @ApiOperation(deleteWarehouseDoc.operation)
  @ApiResponse(deleteWarehouseDoc.responses[200])
  @ApiResponse(deleteWarehouseDoc.responses[401])
  @ApiResponse(deleteWarehouseDoc.responses[404])
  @Delete(':warehouse_id')
  deleteWarehouse(
    @Param('warehouse_id') warehouse_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.deleteWarehouse(
      warehouse_id,
      userSession.tenant_id,
    );
  }

  @Patch(':warehouse_id')
  updateWarehouse(
    @Param('warehouse_id') warehouse_id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.updateWarehouse(
      warehouse_id,
      userSession.tenant_id,
      updateWarehouseDto,
    );
  }

  @Get('inventory/:warehouse_id/aggregated')
  listInventoryAggregated(
    @Param('warehouse_id') warehouse_id: string,
    @Query('search') search: string | undefined,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.listInventoryAggregated(
      warehouse_id,
      userSession.tenant_id,
      search,
    );
  }

  @Get('inventory/:warehouse_id')
  listInventoryByWarehouse(
    @Param('warehouse_id') warehouse_id: string,
    @Query('search') search: string | undefined,
    @Query('group_id') group_id: string | undefined,
    @Query('include_catalog') include_catalog: string | undefined,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.listInventoryByWarehouse(
      warehouse_id,
      userSession.tenant_id,
      search,
      group_id,
      include_catalog === 'true',
    );
  }

  @Patch('inventory/:inventory_id')
  updateInventoryItem(
    @Param('inventory_id') inventory_id: string,
    @Body() body: UpdateInventoryItemDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.updateInventoryItem(
      inventory_id,
      userSession.tenant_id,
      body.stock,
      body.expiration_date,
    );
  }

  @Delete('inventory/:inventory_id')
  deleteInventoryItem(
    @Param('inventory_id') inventory_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.deleteInventoryItem(
      inventory_id,
      userSession.tenant_id,
    );
  }

  @Post('inventory/bulk')
  bulkInsertInventory(
    @Body() body: BulkInsertInventoryDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.bulkInsertInventory(
      userSession.tenant_id,
      body,
    );
  }

  @ApiOperation(transferInventoryDoc.operation)
  @ApiResponse(transferInventoryDoc.responses[201])
  @ApiResponse(transferInventoryDoc.responses[400])
  @ApiResponse(transferInventoryDoc.responses[401])
  @ApiResponse(transferInventoryDoc.responses[404])
  @Get('transfer-request')
  listTransferRequests(@Session() userSession: IUserSession) {
    return this.warehouseService.getTransferRequests(userSession.tenant_id);
  }

  @Get('transfer')
  listTransfers(@Session() userSession: IUserSession) {
    return this.warehouseService.listTransfersByTenant(userSession.tenant_id);
  }

  @Get('transfer/:id')
  getTransferDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getTransferDetail(id, userSession.tenant_id);
  }

  @Get('transfer-request/:id')
  getTransferRequestDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getTransferRequestDetail(
      id,
      userSession.tenant_id,
    );
  }

  @ApiOperation(addProductToWarehouseDoc.operation)
  @ApiResponse(addProductToWarehouseDoc.responses[201])
  @ApiResponse(addProductToWarehouseDoc.responses[401])
  @ApiResponse(addProductToWarehouseDoc.responses[404])
  @Post('/product')
  addProductToWarehouse(
    @Body() addProductToWarehouseDto: AddProductToWarehouseDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.addProductToWarehouse(
      addProductToWarehouseDto.warehouse_id,
      addProductToWarehouseDto.product_id,
      userSession.tenant_id,
      addProductToWarehouseDto.amount,
      addProductToWarehouseDto.expiration_date,
    );
  }

  @ApiOperation(getAllWarehousesDoc.operation)
  @ApiResponse(getAllWarehousesDoc.responses[200])
  @ApiResponse(getAllWarehousesDoc.responses[401])
  @Get('tenant/')
  getAllWarehouses(@Session() userSession: IUserSession) {
    return this.warehouseService.getWarehousesByTenant(userSession.tenant_id);
  }

  @Get('expiring')
  getExpiringProducts(
    @Query('days') days: string = '30',
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getExpiringProducts(
      userSession.tenant_id,
      parseInt(days, 10),
    );
  }

  @Get(':warehouse_id/stock')
  getStockByWarehouse(
    @Param('warehouse_id') warehouse_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getStockByWarehouse(
      warehouse_id,
      userSession.tenant_id,
    );
  }

  @ApiOperation(countAllInWarehouseDoc.operation)
  @ApiResponse(countAllInWarehouseDoc.responses[201])
  @ApiResponse(countAllInWarehouseDoc.responses[401])
  @Post('count')
  countAllProductsInWarehouse(
    @Body() countAllInWarehouseDto: CountAllInWarehouseDto,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.countAllInWarehouse(
      countAllInWarehouseDto.warehouse_id,
      userSession.tenant_id,
    );
  }

  @ApiOperation(generateDiscrepancyReportDoc.operation)
  @ApiResponse(generateDiscrepancyReportDoc.responses[201])
  @ApiResponse(generateDiscrepancyReportDoc.responses[401])
  @ApiResponse(generateDiscrepancyReportDoc.responses[404])
  @Post('discrepancy-report')
  generateDiscrepancyReport(
    @Session() userSession: IUserSession,
    @Body() createDiscrepancyReport: CreateDiscrepancyReport,
  ) {
    return this.warehouseService.createDiscrepancyReport(
      userSession.tenant_id,
      createDiscrepancyReport.product_id,
      createDiscrepancyReport.warehouse_id,
      createDiscrepancyReport.stored_quantity,
      createDiscrepancyReport.physical_quantity,
      createDiscrepancyReport.discrepancy_reason,
    );
  }

  @ApiOperation(getAllDiscrepancyReportsDoc.operation)
  @ApiResponse(getAllDiscrepancyReportsDoc.responses[200])
  @ApiResponse(getAllDiscrepancyReportsDoc.responses[401])
  @Get('discrepancy-report/:warehouse_id')
  getAllDiscrepancyReports(
    @Param('warehouse_id') warehouse_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getDiscrepancyReports(
      userSession.tenant_id,
      warehouse_id,
    );
  }

  @ApiOperation(getDiscrepancyReportByIdDoc.operation)
  @ApiResponse(getDiscrepancyReportByIdDoc.responses[200])
  @ApiResponse(getDiscrepancyReportByIdDoc.responses[401])
  @ApiResponse(getDiscrepancyReportByIdDoc.responses[404])
  @Get('discrepancy-report/id/:report_id')
  getDiscrepancyReportById(
    @Param('report_id') report_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.getDiscrepancyReportById(
      userSession.tenant_id,
      report_id,
    );
  }

  @Patch('discrepancy-report/:report_id/apply')
  applyDiscrepancyAdjustment(
    @Param('report_id') report_id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.warehouseService.applyDiscrepancyAdjustment(
      report_id,
      userSession.tenant_id,
    );
  }

  @Patch('transfer-request/:id/status')
  updateTransferRequestStatus(
    @Session() userSession: IUserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    // Any role can accept/reject? The prompt says "el destino puede aceptar o rechazar".
    // We'll trust the user role internally or let it pass for now.
    return this.warehouseService.updateTransferRequestStatus(
      userSession.tenant_id,
      id,
      body.status,
      body.rejection_reason || null,
      userSession.user_id,
    );
  }
  @Post('disaggregate')
  async disaggregateLote(
    @Session() userSession: IUserSession,
    @Body('warehouse_id', ParseUUIDPipe) warehouse_id: string,
    @Body('product_variant_id', ParseUUIDPipe) product_variant_id: string,
    @Body('amount') amount: number,
  ) {
    return this.warehouseService.disaggregateLote(
      userSession.tenant_id,
      warehouse_id,
      product_variant_id,
      amount,
      userSession.user_id,
    );
  }
  @Post('transfer')
  transferInventoryBetweenWarehouses(
    @Session() userSession: IUserSession,
    @Body() body: InventoryTransferDto,
  ) {
    if (userSession.role_id === 4) {
      return this.warehouseService.createTransferRequest(
        userSession.tenant_id,
        body,
        userSession.user_id,
      );
    }
    return this.warehouseService.moveProductToWarehouse(
      body.origin_warehouse_id,
      body.destination_warehouse_id,
      userSession.tenant_id,
      body.products,
      body.departure_date,
      body.arrival_date,
    );
  }
}
