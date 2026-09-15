import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import {
  getTenantInvoicesDoc,
  getInvoiceByIdDoc,
  getCustomerInvoicesDoc,
  deleteInvoiceDoc,
} from '@/docs/contexts/pos/invoice';

@ApiTags('Invoice')
@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @ApiOperation(getTenantInvoicesDoc.operation)
  @ApiResponse(getTenantInvoicesDoc.responses[200])
  @ApiResponse(getTenantInvoicesDoc.responses[401])
  @Get(':id')
  async getTenantInvoices(@Param('id') id: string) {
    return this.invoiceService.getTenantInvoices(id);
  }

  @ApiOperation(getInvoiceByIdDoc.operation)
  @ApiResponse(getInvoiceByIdDoc.responses[200])
  @ApiResponse(getInvoiceByIdDoc.responses[401])
  @ApiResponse(getInvoiceByIdDoc.responses[404])
  @Get('details/:id')
  async getInvoiceById(@Param('id') id: string) {
    return this.invoiceService.getInvoiceById(id);
  }

  @ApiOperation(getCustomerInvoicesDoc.operation)
  @ApiResponse(getCustomerInvoicesDoc.responses[200])
  @ApiResponse(getCustomerInvoicesDoc.responses[401])
  @Get('sale/:saleId')
  async getInvoiceBySaleId(@Param('saleId') saleId: string) {
    return this.invoiceService.getInvoiceBySaleId(saleId);
  }

  @Get()
  async getCustomerInvoices(
    @Query('id') tenantId: string,
    @Query('doc') doc: string,
  ) {
    return this.invoiceService.getCustomerInvoices(tenantId, doc);
  }

  @ApiOperation(deleteInvoiceDoc.operation)
  @ApiResponse(deleteInvoiceDoc.responses[200])
  @ApiResponse(deleteInvoiceDoc.responses[401])
  @ApiResponse(deleteInvoiceDoc.responses[404])
  @Delete(':id')
  async deleteInvoice(@Param('id') id: string) {
    return this.invoiceService.deleteInvoice(id);
  }
}
