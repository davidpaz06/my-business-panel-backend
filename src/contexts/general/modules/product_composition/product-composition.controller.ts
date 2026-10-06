import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductCompositionService } from './product-composition.service';
import {
  ReplaceCompositionDto,
  UpdateComponentQuantityDto,
} from './dto/product-composition.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Product Composition')
@Controller('product-composition')
@UseGuards(AuthenticationGuard)
export class ProductCompositionController {
  constructor(
    private readonly service: ProductCompositionService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId/parent/:parentId')
  async byParent(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('parentId') parentId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByParent(tenantId, parentId);
  }

  @Get(':tenantId/child/:childId')
  async byChild(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('childId') childId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByChild(tenantId, childId);
  }

  @Get(':tenantId/availability/:parentId/:warehouseId')
  async availability(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('parentId') parentId: string,
    @Param('warehouseId') warehouseId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return {
      available: await this.service.getAvailability(
        tenantId,
        parentId,
        warehouseId,
      ),
    };
  }

  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async replace(
    @Session() session: IUserSession,
    @Body() body: ReplaceCompositionDto,
  ) {
    body.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      body.tenant_id,
    );
    return this.service.replace(body);
  }

  @Patch(':tenantId/parent/:parentId/component/:childId')
  async updateQuantity(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('parentId') parentId: string,
    @Param('childId') childId: string,
    @Body() body: UpdateComponentQuantityDto,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.updateQuantity(tenantId, parentId, childId, body);
  }

  @Delete(':tenantId/parent/:parentId')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async clear(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('parentId') parentId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.deleteAllForParent(tenantId, parentId);
  }
}
