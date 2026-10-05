import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SaleItemService } from './sale-item.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  getItemsDoc,
  getItemDoc,
  deleteItemDoc,
} from '@/docs/contexts/pos/sale-item';

// Las lineas de venta se crean unicamente a traves de POST /sale (flujo
// transaccional con stock, factura y pagos). El antiguo POST /items insertaba
// con la columna inexistente product_id y confiaba en el tenant_id del body:
// se retiro.
@ApiTags('Sale Item')
@Controller('items')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
export class SaleItemController {
  constructor(
    private readonly itemService: SaleItemService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getItemsDoc.operation)
  @ApiResponse(getItemsDoc.responses[200])
  @ApiResponse(getItemsDoc.responses[401])
  @Get(':sale_id')
  async getItems(
    @Session() session: IUserSession,
    @Param('sale_id') sale_id: string,
  ) {
    return this.itemService.getAllItems(
      sale_id,
      this.tenantScope.scopeFor(session),
    );
  }

  // Antes compartia el patron ':id' con ':sale_id' y nunca era alcanzable.
  @ApiOperation(getItemDoc.operation)
  @ApiResponse(getItemDoc.responses[200])
  @ApiResponse(getItemDoc.responses[401])
  @ApiResponse(getItemDoc.responses[404])
  @Get('item/:id')
  async getItem(@Session() session: IUserSession, @Param('id') id: string) {
    return this.itemService.getItemById(id, this.tenantScope.scopeFor(session));
  }

  // Borrar una linea altera totales e inventario: solo admin y superusuario.
  @ApiOperation(deleteItemDoc.operation)
  @ApiResponse(deleteItemDoc.responses[200])
  @ApiResponse(deleteItemDoc.responses[401])
  @ApiResponse(deleteItemDoc.responses[404])
  @RequiredRole('admin', 'superuser')
  @Delete(':id')
  async deleteItem(@Session() session: IUserSession, @Param('id') id: string) {
    return this.itemService.deleteItem(id, this.tenantScope.scopeFor(session));
  }
}
