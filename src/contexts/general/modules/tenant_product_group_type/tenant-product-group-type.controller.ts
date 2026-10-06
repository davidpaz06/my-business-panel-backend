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
import { TenantProductGroupTypeService } from './tenant-product-group-type.service';
import {
  CreateTenantProductGroupTypeDto,
  UpdateTenantProductGroupTypeDto,
} from './dto/tenant-product-group-type.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Tenant Product Group Type')
@UseGuards(AuthenticationGuard)
@Controller('tenant-product-group-type')
export class TenantProductGroupTypeController {
  constructor(
    private readonly service: TenantProductGroupTypeService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId')
  async getByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByTenant(tenantId);
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

  @Post()
  async create(
    @Session() session: IUserSession,
    @Body() body: CreateTenantProductGroupTypeDto,
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
    @Body() body: UpdateTenantProductGroupTypeDto,
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
