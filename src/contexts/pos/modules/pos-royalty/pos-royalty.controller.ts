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
import { ApiTags } from '@nestjs/swagger';
import { PosRoyaltyService } from './pos-royalty.service';
import {
  CreateRoyaltyOptionDto,
  CreateRoyaltyRuleDto,
  SetRuleDimensionsDto,
  UpdateRoyaltyOptionDto,
  UpdateRoyaltyRuleDto,
} from './dto/pos-royalty.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import type { RoyaltyInterval } from './interface/royalty-analytics.interface';

// Aislamiento por tenant: el tenant sale de la sesion; las rutas que conservan
// :tenantId o tenant_id lo validan contra ella, y todo id de regla, opcion,
// grupo o sucursal debe pertenecer al tenant de la sesion (404 si no).
@ApiTags('POS Royalty')
@UseGuards(AuthenticationGuard)
@Controller('pos-royalty')
export class PosRoyaltyController {
  constructor(
    private readonly service: PosRoyaltyService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  // ── Rules ──────────────────────────────────────────────────────────────────

  @Get('rules/:tenantId')
  listRules(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.listRules(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  @Get('rules/detail/:royaltyRuleId')
  async getRule(
    @Session() session: IUserSession,
    @Param('royaltyRuleId') royaltyRuleId: string,
  ) {
    await this.tenantScope.assertOwns('royaltyRule', royaltyRuleId, session);
    return this.service.getRule(royaltyRuleId);
  }

  @Post('rules')
  createRule(
    @Session() session: IUserSession,
    @Body() dto: CreateRoyaltyRuleDto,
  ) {
    return this.service.createRule(session.tenant_id, dto);
  }

  @Put('rules/:royaltyRuleId')
  async updateRule(
    @Session() session: IUserSession,
    @Param('royaltyRuleId') royaltyRuleId: string,
    @Body() dto: UpdateRoyaltyRuleDto,
  ) {
    await this.tenantScope.assertOwns('royaltyRule', royaltyRuleId, session);
    return this.service.updateRule(royaltyRuleId, dto);
  }

  @Delete('rules/:royaltyRuleId')
  async deleteRule(
    @Session() session: IUserSession,
    @Param('royaltyRuleId') royaltyRuleId: string,
  ) {
    await this.tenantScope.assertOwns('royaltyRule', royaltyRuleId, session);
    return this.service.deleteRule(royaltyRuleId);
  }

  @Put('rules/:royaltyRuleId/dimensions')
  async setRuleDimensions(
    @Session() session: IUserSession,
    @Param('royaltyRuleId') royaltyRuleId: string,
    @Body() dto: SetRuleDimensionsDto,
  ) {
    await this.tenantScope.assertOwns('royaltyRule', royaltyRuleId, session);
    // Los tipos de agrupacion (dimensiones) tambien deben ser del tenant.
    for (const typeId of new Set(dto.tenant_product_group_type_ids ?? [])) {
      await this.tenantScope.assertOwns(
        'tenantProductGroupType',
        typeId,
        session,
      );
    }
    return this.service.setRuleDimensions(royaltyRuleId, dto);
  }

  // ── Options ────────────────────────────────────────────────────────────────

  @Post('options')
  async createOption(
    @Session() session: IUserSession,
    @Body() dto: CreateRoyaltyOptionDto,
  ) {
    await this.tenantScope.assertOwns(
      'royaltyRule',
      dto.royalty_rule_id,
      session,
    );
    await this.tenantScope.assertOwns(
      'tenantProductGroup',
      dto.tenant_product_group_id,
      session,
    );
    return this.service.createOption(dto);
  }

  @Put('options/:royaltyOptionId')
  async updateOption(
    @Session() session: IUserSession,
    @Param('royaltyOptionId') royaltyOptionId: string,
    @Body() dto: UpdateRoyaltyOptionDto,
  ) {
    await this.tenantScope.assertOwns(
      'royaltyOption',
      royaltyOptionId,
      session,
    );
    return this.service.updateOption(royaltyOptionId, dto);
  }

  @Delete('options/:royaltyOptionId')
  async deleteOption(
    @Session() session: IUserSession,
    @Param('royaltyOptionId') royaltyOptionId: string,
  ) {
    await this.tenantScope.assertOwns(
      'royaltyOption',
      royaltyOptionId,
      session,
    );
    return this.service.deleteOption(royaltyOptionId);
  }

  // ── POS integration ────────────────────────────────────────────────────────

  @Get('applicable')
  getApplicableRules(
    @Session() session: IUserSession,
    @Query('tenant_id') tenantId: string,
    @Query('amount') amount: string,
  ) {
    return this.service.getApplicableRules(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      parseFloat(amount),
    );
  }

  @Get('giftable-products/:tenantProductGroupId')
  async getGiftableProducts(
    @Session() session: IUserSession,
    @Param('tenantProductGroupId') tenantProductGroupId: string,
  ) {
    await this.tenantScope.assertOwns(
      'tenantProductGroup',
      tenantProductGroupId,
      session,
    );
    return this.service.getGiftableProductsByGroup(tenantProductGroupId);
  }

  // ── Analytics (Regalias) ─────────────────────────────────────────────────────

  @Get('analytics/:tenantId')
  async getRoyaltyAnalytics(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('interval') interval?: RoyaltyInterval,
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
    return this.service.getRoyaltyAnalytics(scopedTenantId, interval, branchId);
  }
}
