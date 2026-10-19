import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DutiesTypeService } from './duties-type.service';
import {
  CreateDutiesTypeDto,
  UpdateDutiesTypeDto,
} from './dto/duties-type.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';

@ApiTags('DutiesType')
@Controller('duties-type')
@UseGuards(AuthenticationGuard, RateLimitGuard)
export class DutiesTypeController {
  constructor(
    private readonly dutiesTypeService: DutiesTypeService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get()
  async listByTenant(
    @Session() session: IUserSession,
    @Query('tenant_id') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.dutiesTypeService.listByTenant(tenantId);
  }

  @Post()
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async create(
    @Body() body: CreateDutiesTypeDto,
    @Session() session: IUserSession,
  ) {
    // El tenant sale de la sesion; solo el superusuario puede crear en otro.
    const tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      body.tenant_id,
    );
    return this.dutiesTypeService.create(tenantId, body);
  }

  @Patch(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDutiesTypeDto,
    @Session() session: IUserSession,
  ) {
    await this.tenantScope.assertOwns('dutiesType', id, session);
    return this.dutiesTypeService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(LevelAuthorizationGuard)
  @RequiredLevel(2)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: IUserSession,
  ) {
    await this.tenantScope.assertOwns('dutiesType', id, session);
    return this.dutiesTypeService.remove(id);
  }
}
