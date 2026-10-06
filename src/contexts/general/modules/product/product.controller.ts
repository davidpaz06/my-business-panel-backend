import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { ProductInsertDto } from './dto/newProduct.dto';
import { UpdateProductDto } from './dto/updateProduct.dto';
import { isUUID } from 'class-validator';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import {
  getAllProductsByTenantDoc,
  getProductBySkuDoc,
  createNewProductDoc,
  updateProductDoc,
  deleteProductDoc,
} from '@/docs/contexts/general/product';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Product')
@Controller('product')
@UseGuards(AuthenticationGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  // Global list for superusers — declared BEFORE :tenantId to avoid conflict
  @Get('all')
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('superuser')
  async getAllProductsGlobal(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    return this.productService.getAllProductsGlobal(
      parseInt(page),
      parseInt(limit),
    );
  }

  @ApiOperation(getProductBySkuDoc.operation)
  @ApiResponse(getProductBySkuDoc.responses[200])
  @ApiResponse(getProductBySkuDoc.responses[401])
  @Get('sku/:sku')
  async getProductBySku(
    @Session() session: IUserSession,
    @Param('sku') sku: string,
  ) {
    return this.productService.getProductBySku(
      sku,
      this.tenantScope.scopeFor(session),
    );
  }

  @Get(':tenantId/search')
  async searchProductsByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('group_ids') groupIds?: string,
    @Query('attribute_value_ids') attributeValueIds?: string,
    @Query('no_supplier') noSupplier?: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    const groups = groupIds
      ? groupIds
          .split(',')
          .map((g) => g.trim())
          .filter((g) => g.length > 0)
      : undefined;
    const attrValues = attributeValueIds
      ? attributeValueIds
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const noSup = noSupplier === 'true' ? true : undefined;
    return this.productService.searchProductsByTenant(
      tenantId,
      q,
      parseInt(page),
      parseInt(limit),
      groups,
      attrValues,
      noSup,
    );
  }

  @Get(':tenantId/:id/with-attributes')
  async getProductByIdWithAttributes(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.productService.getProductByIdWithAttributes(id, tenantId);
  }

  @ApiOperation(getAllProductsByTenantDoc.operation)
  @ApiResponse(getAllProductsByTenantDoc.responses[200])
  @ApiResponse(getAllProductsByTenantDoc.responses[400])
  @ApiResponse(getAllProductsByTenantDoc.responses[401])
  @Get(':tenantId')
  async getAllProductsByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    if (!tenantId || !isUUID(tenantId)) {
      return this.productService.getAllProductsGlobal(
        parseInt(page),
        parseInt(limit),
      );
    }
    return this.productService.getAllProductsPaginated(
      tenantId,
      parseInt(page),
      parseInt(limit),
    );
  }

  @ApiOperation(createNewProductDoc.operation)
  @ApiResponse(createNewProductDoc.responses[201])
  @ApiResponse(createNewProductDoc.responses[400])
  @ApiResponse(createNewProductDoc.responses[401])
  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async createNewProduct(
    @Session() session: IUserSession,
    @Body() req: ProductInsertDto,
  ) {
    // cada producto nuevo pertenece al tenant de la sesion (el superusuario
    // puede crear en otro tenant indicandolo explicitamente)
    for (const item of req.products ?? []) {
      item.tenant_id = this.tenantScope.resolveRequestedTenant(
        session,
        item.tenant_id,
      );
    }
    return this.productService.createProduct(req);
  }

  @ApiOperation(updateProductDoc.operation)
  @ApiResponse(updateProductDoc.responses[200])
  @ApiResponse(updateProductDoc.responses[400])
  @ApiResponse(updateProductDoc.responses[401])
  @Patch(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async updateProduct(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() req: UpdateProductDto,
  ) {
    await this.tenantScope.assertOwns('productVariant', id, session);
    return this.productService.updateProduct(req, id);
  }

  @ApiOperation(deleteProductDoc.operation)
  @ApiResponse(deleteProductDoc.responses[200])
  @ApiResponse(deleteProductDoc.responses[401])
  @Delete(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async deleteProduct(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('productVariant', id, session);
    return this.productService.deleteProduct(id);
  }
}
