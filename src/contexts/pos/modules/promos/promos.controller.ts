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
  constructor(private readonly promosService: PromosService) {}

  @Get('analytics/:tenantId')
  getAnalytics(
    @Param('tenantId') tenantId: string,
    @Query('interval') interval: string = '30d',
    @Query('isActive') isActive?: string,
    @Query('branchId') branchId?: string,
  ) {
    const activeFilter =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.promosService.getAnalytics(
      tenantId,
      interval,
      activeFilter,
      branchId,
    );
  }

  @ApiOperation(getTenantPromosDoc.operation)
  @ApiResponse(getTenantPromosDoc.responses[200])
  @ApiResponse(getTenantPromosDoc.responses[401])
  @Get(':tenantId')
  getTenantPromos(@Param('tenantId') tenantId: string) {
    return this.promosService.getPromos(tenantId);
  }

  /**
   * Active default promotions for a tenant — the POS pre-applies these to
   * every new sale while they are active.
   */
  @Get('defaults/:tenantId')
  getActiveDefaults(@Param('tenantId') tenantId: string) {
    return this.promosService.getActiveDefaults(tenantId);
  }

  @ApiOperation(getPromoInfoDoc.operation)
  @ApiResponse(getPromoInfoDoc.responses[200])
  @ApiResponse(getPromoInfoDoc.responses[401])
  @ApiResponse(getPromoInfoDoc.responses[404])
  @Get('info/:promo')
  getPromoInfo(@Param('promo') promo: string) {
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
  createPromoWithRule(@Body() newPromoDto: NewPromoDto) {
    return this.promosService.createPromoWithRule(newPromoDto);
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
    @Param('id') id: string,
    @Body() updatePromoDto: UpdatePromotionDto,
  ) {
    return this.promosService.updatePromotion(id, updatePromoDto);
  }

  @ApiOperation(deletePromotionDoc.operation)
  @ApiResponse(deletePromotionDoc.responses[200])
  @ApiResponse(deletePromotionDoc.responses[401])
  @ApiResponse(deletePromotionDoc.responses[404])
  @Delete(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(3)
  deletePromotion(@Param('id') id: string) {
    return this.promosService.deletePromotion(id);
  }

  @Get(':promoId/targets')
  getTargets(@Param('promoId') promoId: string) {
    return this.promosService.getTargets(promoId);
  }

  @Get('applicable/:tenantId/:variantId')
  getApplicable(
    @Param('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.promosService.getApplicableToVariant(tenantId, variantId);
  }
}
