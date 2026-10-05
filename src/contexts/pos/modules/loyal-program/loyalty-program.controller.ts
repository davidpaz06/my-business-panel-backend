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
import { LoyalProgramService } from './loyalty-program.service';
import { NewLoyalProgramDto } from './dto/newLoyalProgram.dto';
import { UpdateLoyalProgramDto } from './dto/updateLoyalProgram.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  getLoyalProgramsByTenantDoc,
  getLoyalProgramByIdDoc,
  createLoyalProgramDoc,
  updateLoyalProgramDoc,
  deleteLoyalProgramDoc,
} from '@/docs/contexts/pos/loyal-program';

// El tenant sale de la sesion. :tenant_id se conserva por compatibilidad con
// el frontend pero se valida contra la sesion.
@ApiTags('Loyal Program')
@Controller('loyal-program')
@UseGuards(AuthenticationGuard)
export class LoyalProgramController {
  constructor(
    private readonly loyalService: LoyalProgramService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getLoyalProgramsByTenantDoc.operation)
  @ApiResponse(getLoyalProgramsByTenantDoc.responses[200])
  @ApiResponse(getLoyalProgramsByTenantDoc.responses[401])
  @Get(':tenant_id')
  async getLoyalProgramsByTenant(
    @Session() session: IUserSession,
    @Param('tenant_id') tenant_id: string,
  ) {
    return this.loyalService.getLoyalProgramsByTenant(
      this.tenantScope.resolveRequestedTenant(session, tenant_id),
    );
  }

  @ApiOperation(getLoyalProgramByIdDoc.operation)
  @ApiResponse(getLoyalProgramByIdDoc.responses[200])
  @ApiResponse(getLoyalProgramByIdDoc.responses[401])
  @ApiResponse(getLoyalProgramByIdDoc.responses[404])
  @Get('program/:id')
  async getLoyalProgramById(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.loyalService.getLoyalProgramById(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(createLoyalProgramDoc.operation)
  @ApiResponse(createLoyalProgramDoc.responses[201])
  @ApiResponse(createLoyalProgramDoc.responses[400])
  @ApiResponse(createLoyalProgramDoc.responses[401])
  @Post()
  async createLoyalProgram(
    @Session() session: IUserSession,
    @Body() req: NewLoyalProgramDto,
  ) {
    return this.loyalService.createLoyalProgram(session.tenant_id, req);
  }

  @ApiOperation(updateLoyalProgramDoc.operation)
  @ApiResponse(updateLoyalProgramDoc.responses[200])
  @ApiResponse(updateLoyalProgramDoc.responses[400])
  @ApiResponse(updateLoyalProgramDoc.responses[401])
  @ApiResponse(updateLoyalProgramDoc.responses[404])
  @Patch(':id')
  async updateLoyalProgram(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() req: UpdateLoyalProgramDto,
  ) {
    return this.loyalService.updateLoyalProgram(
      req,
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(deleteLoyalProgramDoc.operation)
  @ApiResponse(deleteLoyalProgramDoc.responses[200])
  @ApiResponse(deleteLoyalProgramDoc.responses[401])
  @ApiResponse(deleteLoyalProgramDoc.responses[404])
  @Delete(':id')
  async deleteLoyalProgram(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.loyalService.deleteLoyalProgram(
      id,
      this.tenantScope.scopeFor(session),
    );
  }
}
