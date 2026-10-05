import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  getTenantInvoicesDoc,
  getInvoiceByIdDoc,
  getCustomerInvoicesDoc,
  deleteInvoiceDoc,
} from '@/docs/contexts/pos/invoice';

// Facturas: documentos fiscales con datos del comprador. Todo acceso exige
// sesion y queda acotado al tenant de la sesion.
@ApiTags('Invoice')
@Controller('invoice')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getTenantInvoicesDoc.operation)
  @ApiResponse(getTenantInvoicesDoc.responses[200])
  @ApiResponse(getTenantInvoicesDoc.responses[401])
  @Get(':id')
  async getTenantInvoices(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.invoiceService.getTenantInvoices(
      this.tenantScope.resolveRequestedTenant(session, id),
    );
  }

  @ApiOperation(getInvoiceByIdDoc.operation)
  @ApiResponse(getInvoiceByIdDoc.responses[200])
  @ApiResponse(getInvoiceByIdDoc.responses[401])
  @ApiResponse(getInvoiceByIdDoc.responses[404])
  @Get('details/:id')
  async getInvoiceById(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.invoiceService.getInvoiceById(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(getCustomerInvoicesDoc.operation)
  @ApiResponse(getCustomerInvoicesDoc.responses[200])
  @ApiResponse(getCustomerInvoicesDoc.responses[401])
  @Get('sale/:saleId')
  async getInvoiceBySaleId(
    @Session() session: IUserSession,
    @Param('saleId') saleId: string,
  ) {
    return this.invoiceService.getInvoiceBySaleId(
      saleId,
      this.tenantScope.scopeFor(session),
    );
  }

  @Get()
  async getCustomerInvoices(
    @Session() session: IUserSession,
    @Query('id') tenantId: string,
    @Query('doc') doc: string,
  ) {
    return this.invoiceService.getCustomerInvoices(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      doc,
    );
  }

  // Borrar una factura es una operacion administrativa: solo admin y
  // superusuario, y siempre dentro del tenant de la sesion.
  @ApiOperation(deleteInvoiceDoc.operation)
  @ApiResponse(deleteInvoiceDoc.responses[200])
  @ApiResponse(deleteInvoiceDoc.responses[401])
  @ApiResponse(deleteInvoiceDoc.responses[404])
  @RequiredRole('admin', 'superuser')
  @Delete(':id')
  async deleteInvoice(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.invoiceService.deleteInvoice(
      id,
      this.tenantScope.scopeFor(session),
    );
  }
}
