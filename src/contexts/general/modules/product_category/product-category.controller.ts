import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductCategoryService } from './product-category.service';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import {
  getAllCategoriesDoc,
  createProductCategoryDoc,
  updateProductCategoryDoc,
  deleteProductCategoryDoc,
} from '@/docs/contexts/general/product_category';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';

// general_schema.product_category es un catalogo global (sin tenant_id):
// solo la plataforma lo modifica; el resto de roles solo lo lee.
const SUPERUSER_LEVEL = 4;

@ApiTags('Product Category')
@Controller('category')
@UseGuards(AuthenticationGuard, RateLimitGuard)
export class ProductCategoryController {
  constructor(
    private readonly productCategoryService: ProductCategoryService,
  ) {}

  @ApiOperation(getAllCategoriesDoc.operation)
  @ApiResponse(getAllCategoriesDoc.responses[200])
  @ApiResponse(getAllCategoriesDoc.responses[401])
  @Get()
  async getAll(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    if (limit !== undefined || offset !== undefined || search !== undefined) {
      return this.productCategoryService.getAllCategoriesPaginated(
        search || null,
        parsedLimit,
        parsedOffset,
      );
    }
    return this.productCategoryService.getAllCategories();
  }

  @ApiOperation(createProductCategoryDoc.operation)
  @ApiResponse(createProductCategoryDoc.responses[201])
  @ApiResponse(createProductCategoryDoc.responses[400])
  @ApiResponse(createProductCategoryDoc.responses[401])
  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async createCategory(@Body() req: { name: string }) {
    return this.productCategoryService.createCategory(req.name);
  }

  @ApiOperation(updateProductCategoryDoc.operation)
  @ApiResponse(updateProductCategoryDoc.responses[200])
  @ApiResponse(updateProductCategoryDoc.responses[401])
  @ApiResponse(updateProductCategoryDoc.responses[404])
  @Put(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async updateCategory(@Param('id') id: string, @Body() req: { name: string }) {
    return this.productCategoryService.updateCategory(id, req.name);
  }

  @ApiOperation(deleteProductCategoryDoc.operation)
  @ApiResponse(deleteProductCategoryDoc.responses[200])
  @ApiResponse(deleteProductCategoryDoc.responses[401])
  @ApiResponse(deleteProductCategoryDoc.responses[404])
  @Delete(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(SUPERUSER_LEVEL)
  async deleteCategory(@Param('id') id: string) {
    return this.productCategoryService.deleteCategory(id);
  }
}
