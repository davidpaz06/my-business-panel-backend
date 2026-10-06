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
import { ApiTags } from '@nestjs/swagger';
import { TenantProductGroupService } from './tenant-product-group.service';
import {
  CreateTenantProductGroupDto,
  UpdateTenantProductGroupDto,
} from './dto/tenant-product-group.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Tenant Product Group')
@UseGuards(AuthenticationGuard)
@Controller('tenant-product-group')
export class TenantProductGroupController {
  constructor(
    private readonly service: TenantProductGroupService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId')
  async list(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByTenant(tenantId);
  }

  @Get(':tenantId/tree')
  async tree(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('typeId') typeId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getTree(tenantId, typeId);
  }

  @Get(':tenantId/:id')
  async getById(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getById(id, tenantId);
  }

  @Get(':tenantId/:id/descendants')
  async descendants(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getDescendants(tenantId, id);
  }

  @Post()
  async create(
    @Session() session: IUserSession,
    @Body() body: CreateTenantProductGroupDto,
  ) {
    body.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      body.tenant_id,
    );
    return this.service.create(body);
  }

  @Patch(':tenantId/:id')
  async update(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateTenantProductGroupDto,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.update(id, tenantId, body);
  }

  @Delete(':tenantId/:id')
  async delete(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.delete(id, tenantId);
  }
}
