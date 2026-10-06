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
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('DutiesType')
@Controller('duties-type')
@UseGuards(AuthenticationGuard)
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
  async create(@Body() body: CreateDutiesTypeDto) {
    return this.dutiesTypeService.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDutiesTypeDto,
  ) {
    return this.dutiesTypeService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.dutiesTypeService.remove(id);
  }
}
