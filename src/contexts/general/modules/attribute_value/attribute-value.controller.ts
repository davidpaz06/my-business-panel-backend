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
import { AttributeValueService } from './attribute-value.service';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute-value.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Attribute Value')
@UseGuards(AuthenticationGuard)
@Controller('attribute-value')
export class AttributeValueController {
  constructor(
    private readonly service: AttributeValueService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get(':tenantId/by-attribute/:tenantAttributeId')
  async getByTenantAttribute(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Param('tenantAttributeId') tenantAttributeId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.service.getByTenantAttribute(tenantAttributeId, tenantId);
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
    @Body() body: CreateAttributeValueDto,
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
    @Body() body: UpdateAttributeValueDto,
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
