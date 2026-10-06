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
import { BranchService } from './branch.service';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { CreateBranchDto } from '@/contexts/general/modules/branch/dto/create_branch.dto';
import { UpdateBranchDto } from '@/contexts/general/modules/branch/dto/update_branch.dto';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  findBranchByIdDoc,
  findAllBranchesDoc,
  createBranchDoc,
} from '@/docs/contexts/general/branch';

// Aislamiento por tenant: toda ruta exige sesion; una sucursal de otro tenant
// responde 404. Solo el superusuario de plataforma ve o crea fuera de su tenant.
@ApiBearerAuth()
@ApiTags('Branch')
@UseGuards(AuthenticationGuard, LevelAuthorizationGuard)
@Controller('branch')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(findBranchByIdDoc.operation)
  @ApiResponse(findBranchByIdDoc.responses[200])
  @ApiResponse(findBranchByIdDoc.responses[401])
  @ApiResponse(findBranchByIdDoc.responses[404])
  @Get('/:id')
  async findById(@Session() session: IUserSession, @Param('id') id: string) {
    await this.tenantScope.assertOwns('branch', id, session);
    return this.branchService.findById(id);
  }

  @ApiOperation(findAllBranchesDoc.operation)
  @ApiResponse(findAllBranchesDoc.responses[200])
  @ApiResponse(findAllBranchesDoc.responses[401])
  @Get('/')
  async findAll(
    @Session() session: IUserSession,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    if (this.tenantScope.isSuperuser(session)) {
      return this.branchService.findAllGlobal(parseInt(page), parseInt(limit));
    }
    return this.branchService.findByTenantPaginated(
      session.tenant_id,
      parseInt(page),
      parseInt(limit),
    );
  }

  // Explicit tenant endpoint (for frontend filtering by tenant)
  @Get('/tenant/:tenantId')
  async findByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    return this.branchService.findByTenantPaginated(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      parseInt(page),
      parseInt(limit),
    );
  }

  @ApiOperation(createBranchDoc.operation)
  @ApiResponse(createBranchDoc.responses[201])
  @ApiResponse(createBranchDoc.responses[400])
  @ApiResponse(createBranchDoc.responses[401])
  @Post('/')
  @RequiredLevel(2)
  async createBranch(
    @Body() createBranchDto: CreateBranchDto,
    @Session() session: IUserSession,
  ) {
    const tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      createBranchDto.tenant_id,
    );
    return this.branchService.createBranch(tenantId, createBranchDto);
  }

  @Delete('/:id')
  @RequiredLevel(2)
  async deleteBranch(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('branch', id, session);
    return this.branchService.deleteBranch(id);
  }

  @Patch('/:id')
  @RequiredLevel(2)
  async updateBranch(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
  ) {
    await this.tenantScope.assertOwns('branch', id, session);
    // una sucursal no cambia de empresa
    delete updateBranchDto.tenant_id;
    return this.branchService.updateBranch(id, updateBranchDto);
  }
}
