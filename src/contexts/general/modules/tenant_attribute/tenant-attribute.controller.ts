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
import { TenantAttributeService } from './tenant-attribute.service';
import {
  CreateTenantAttributeDto,
  UpdateTenantAttributeDto,
} from './dto/tenant-attribute.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Tenant Attribute')
@UseGuards(AuthenticationGuard)
@Controller('tenant-attribute')
export class TenantAttributeController {
  constructor(
    private readonly service: TenantAttributeService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId/search')
  async searchUnified(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.searchUnified(
      tenantId,
      q,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

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
    @Body() body: CreateTenantAttributeDto,
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
    @Body() body: UpdateTenantAttributeDto,
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
