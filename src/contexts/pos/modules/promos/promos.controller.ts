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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PromosService } from './promos.service';
import { NewPromoDto } from './dto/newPromo.dto';
import { UpdatePromotionDto } from './dto/updatePromo.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  getTenantPromosDoc,
  getPromoInfoDoc,
  getPromoTypesDoc,
  createPromoWithRuleDoc,
  updatePromotionDoc,
  deletePromotionDoc,
} from '@/docs/contexts/pos/promos';

@ApiBearerAuth()
@ApiTags('Promos')
@Controller('promos')
@UseGuards(AuthenticationGuard)
export class PromosController {
  constructor(
    private readonly promosService: PromosService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('analytics/:tenantId')
  async getAnalytics(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('interval') interval: string = '30d',
    @Query('isActive') isActive?: string,
    @Query('branchId') branchId?: string,
  ) {
    const scopedTenantId = this.tenantScope.resolveRequestedTenant(
      session,
      tenantId,
    );
    if (branchId) {
      await this.tenantScope.assertOwnedByTenant(
        'branch',
        branchId,
        scopedTenantId,
      );
    }
    const activeFilter =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.promosService.getAnalytics(
      scopedTenantId,
      interval,
      activeFilter,
      branchId,
    );
  }

  @ApiOperation(getTenantPromosDoc.operation)
  @ApiResponse(getTenantPromosDoc.responses[200])
  @ApiResponse(getTenantPromosDoc.responses[401])
  @Get(':tenantId')
  getTenantPromos(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.promosService.getPromos(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  /**
   * Active default promotions for a tenant — the POS pre-applies these to
   * every new sale while they are active.
   */
  @Get('defaults/:tenantId')
  getActiveDefaults(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.promosService.getActiveDefaults(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  @ApiOperation(getPromoInfoDoc.operation)
  @ApiResponse(getPromoInfoDoc.responses[200])
  @ApiResponse(getPromoInfoDoc.responses[401])
  @ApiResponse(getPromoInfoDoc.responses[404])
  @Get('info/:promo')
  async getPromoInfo(
    @Session() session: IUserSession,
    @Param('promo') promo: string,
  ) {
    await this.tenantScope.assertOwns('promotion', promo, session);
    return this.promosService.getPromoInfo(promo);
  }

  @ApiOperation(getPromoTypesDoc.operation)
  @ApiResponse(getPromoTypesDoc.responses[200])
  @ApiResponse(getPromoTypesDoc.responses[401])
  @Get()
  getPromoTypes() {
    return this.promosService.getPromoTypes();
  }

  @ApiOperation(createPromoWithRuleDoc.operation)
  @ApiResponse(createPromoWithRuleDoc.responses[201])
  @ApiResponse(createPromoWithRuleDoc.responses[400])
  @ApiResponse(createPromoWithRuleDoc.responses[401])
  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(3)
  createPromoWithRule(
    @Session() session: IUserSession,
    @Body() newPromoDto: NewPromoDto,
  ) {
    return this.promosService.createPromoWithRule(
      session.tenant_id,
      newPromoDto,
    );
  }

  @ApiOperation(updatePromotionDoc.operation)
  @ApiResponse(updatePromotionDoc.responses[200])
  @ApiResponse(updatePromotionDoc.responses[400])
  @ApiResponse(updatePromotionDoc.responses[401])
  @ApiResponse(updatePromotionDoc.responses[404])
  @Patch(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(3)
  updatePromotion(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() updatePromoDto: UpdatePromotionDto,
  ) {
    return this.promosService.updatePromotion(
      id,
      updatePromoDto,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(deletePromotionDoc.operation)
  @ApiResponse(deletePromotionDoc.responses[200])
  @ApiResponse(deletePromotionDoc.responses[401])
  @ApiResponse(deletePromotionDoc.responses[404])
  @Delete(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(3)
  deletePromotion(@Session() session: IUserSession, @Param('id') id: string) {
    return this.promosService.deletePromotion(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @Get(':promoId/targets')
  async getTargets(
    @Session() session: IUserSession,
    @Param('promoId') promoId: string,
  ) {
    await this.tenantScope.assertOwns('promotion', promoId, session);
    return this.promosService.getTargets(promoId);
  }

  @Get('applicable/:tenantId/:variantId')
  getApplicable(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.promosService.getApplicableToVariant(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      variantId,
    );
  }
}
