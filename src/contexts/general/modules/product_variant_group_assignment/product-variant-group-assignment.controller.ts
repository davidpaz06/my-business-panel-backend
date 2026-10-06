import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductVariantGroupAssignmentService } from './product-variant-group-assignment.service';
import { ReplaceVariantGroupsDto } from './dto/product-variant-group-assignment.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Product Variant Group Assignment')
@Controller('product-variant-group')
@UseGuards(AuthenticationGuard)
export class ProductVariantGroupAssignmentController {
  constructor(
    private readonly service: ProductVariantGroupAssignmentService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId/variant/:variantId')
  async getByVariant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByVariant(tenantId, variantId);
  }

  @Get(':tenantId/group/:groupId/variants')
  async getVariantsByGroup(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getVariantsByGroup(tenantId, groupId);
  }

  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async replace(
    @Session() session: IUserSession,
    @Body() body: ReplaceVariantGroupsDto,
  ) {
    body.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      body.tenant_id,
    );
    return this.service.replaceForVariant(body);
  }
}
