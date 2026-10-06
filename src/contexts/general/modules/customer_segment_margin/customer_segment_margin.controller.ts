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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomerSegmentMarginService } from './customer_segment_margin.service';
import { NewMarginDto } from './dto/newMargin.dto';
import { UpdateMarginDto } from './dto/updateMargin.dto';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import {
  getMarginsInfoDoc,
  getMarginsByTenantDoc,
  createMarginDoc,
  updateMarginDoc,
  deleteMarginDoc,
} from '@/docs/contexts/general/customer_segment_margin';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

// ? UseGuards(AuthorizationGuard)
//Lets try to think about a better name for the route
@ApiTags('Customer Segment Margin')
@UseGuards(AuthenticationGuard)
@Controller('margin')
export class CustomerSegmentMarginController {
  constructor(
    private readonly csegmentService: CustomerSegmentMarginService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  //Tomorrow ill optimize this endpoint
  @ApiOperation(getMarginsInfoDoc.operation)
  @ApiResponse(getMarginsInfoDoc.responses[200])
  @ApiResponse(getMarginsInfoDoc.responses[401])
  @Get()
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('superuser')
  async getMarginsInfo() {
    return this.csegmentService.getMarginInfo();
  }

  @ApiOperation(getMarginsByTenantDoc.operation)
  @ApiResponse(getMarginsByTenantDoc.responses[200])
  @ApiResponse(getMarginsByTenantDoc.responses[401])
  @Get(':tenantId')
  async getMarginsByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.csegmentService.getTenantMarginsInfo(tenantId);
  }

  @ApiOperation(createMarginDoc.operation)
  @ApiResponse(createMarginDoc.responses[201])
  @ApiResponse(createMarginDoc.responses[400])
  @ApiResponse(createMarginDoc.responses[401])
  @Post()
  async createNewMargin(
    @Session() session: IUserSession,
    @Body() req: NewMarginDto,
  ) {
    req.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      req.tenant_id,
    );
    return this.csegmentService.createMargins(req);
  }

  @ApiOperation(updateMarginDoc.operation)
  @ApiResponse(updateMarginDoc.responses[200])
  @ApiResponse(updateMarginDoc.responses[400])
  @ApiResponse(updateMarginDoc.responses[401])
  @ApiResponse(updateMarginDoc.responses[404])
  @Patch(':id')
  async updateMargin(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() req: UpdateMarginDto,
  ) {
    await this.tenantScope.assertOwns('customerSegmentMargin', id, session);
    // un margen no cambia de empresa
    delete req.tenant_id;
    return this.csegmentService.updateMargins(id, req);
  }

  @ApiOperation(deleteMarginDoc.operation)
  @ApiResponse(deleteMarginDoc.responses[200])
  @ApiResponse(deleteMarginDoc.responses[401])
  @ApiResponse(deleteMarginDoc.responses[404])
  @Delete(':id')
  async deleteMargin(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('customerSegmentMargin', id, session);
    return this.csegmentService.deleteMargin(id);
  }
}
