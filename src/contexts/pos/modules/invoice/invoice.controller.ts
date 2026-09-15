import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DInvoiceService } from './d-invoice.service';
import {
  getTenantDInvoicesDoc,
  getDInvoiceByIdDoc,
  getCustomerDInvoicesDoc,
  deleteDInvoiceDoc,
} from '@/docs/contexts/pos/d-invoice';

@ApiTags('D-Invoice')
@Controller('d-invoice')
export class DInvoiceController {
  constructor(private readonly invoiceService: DInvoiceService) {}

  @ApiOperation(getTenantDInvoicesDoc.operation)
  @ApiResponse(getTenantDInvoicesDoc.responses[200])
  @ApiResponse(getTenantDInvoicesDoc.responses[401])
  @Get(':id')
  async getTenantDInvoices(@Param('id') id: string) {
    return this.invoiceService.getTenantDInvoices(id);
  }

  @ApiOperation(getDInvoiceByIdDoc.operation)
  @ApiResponse(getDInvoiceByIdDoc.responses[200])
  @ApiResponse(getDInvoiceByIdDoc.responses[401])
  @ApiResponse(getDInvoiceByIdDoc.responses[404])
  @Get('details/:id')
  async getDInvoiceById(@Param('id') id: string) {
    return this.invoiceService.getDInvoiceById(id);
  }

  @ApiOperation(getCustomerDInvoicesDoc.operation)
  @ApiResponse(getCustomerDInvoicesDoc.responses[200])
  @ApiResponse(getCustomerDInvoicesDoc.responses[401])
  @Get('sale/:saleId')
  async getDInvoiceBySaleId(@Param('saleId') saleId: string) {
    return this.invoiceService.getDInvoiceBySaleId(saleId);
  }

  @Get()
  async getCustomerDInvoices(
    @Query('id') tenantId: string,
    @Query('doc') doc: string,
  ) {
    return this.invoiceService.getCustomerDInvoices(tenantId, doc);
  }

  @ApiOperation(deleteDInvoiceDoc.operation)
  @ApiResponse(deleteDInvoiceDoc.responses[200])
  @ApiResponse(deleteDInvoiceDoc.responses[401])
  @ApiResponse(deleteDInvoiceDoc.responses[404])
  @Delete(':id')
  async deleteDInvoice(@Param('id') id: string) {
    return this.invoiceService.deleteDInvoice(id);
  }
}
