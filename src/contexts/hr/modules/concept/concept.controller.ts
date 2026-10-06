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
import { ConceptService } from './concept.service';
import { NewConceptDto } from './dto/newConcept.dto';
import { UpdateConceptDto } from './dto/updateConcept.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  getConceptsByTenantDoc,
  createConceptDoc,
  updateConceptDoc,
  softDeleteConceptDoc,
  deleteConceptDoc,
  provisionConceptsDoc,
} from '@/docs/contexts/hr/concept';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Concept')
@UseGuards(AuthenticationGuard)
@Controller('concept')
export class ConceptController {
  constructor(
    private readonly conceptService: ConceptService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getConceptsByTenantDoc.operation)
  @ApiResponse(getConceptsByTenantDoc.responses[200])
  @ApiResponse(getConceptsByTenantDoc.responses[401])
  @Get(':tenantId')
  async getConceptsByTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    tenantId = this.tenantScope.resolveRequestedTenant(session, tenantId);
    return this.conceptService.getAllConceptsByTenant(tenantId);
  }

  @ApiOperation(provisionConceptsDoc.operation)
  @ApiResponse(provisionConceptsDoc.responses[201])
  @ApiResponse(provisionConceptsDoc.responses[401])
  @Post('provision')
  async provisionDefaults(@Session() user: IUserSession) {
    return this.conceptService.provisionDefaults(user.tenant_id);
  }

  @ApiOperation(createConceptDoc.operation)
  @ApiResponse(createConceptDoc.responses[201])
  @ApiResponse(createConceptDoc.responses[400])
  @ApiResponse(createConceptDoc.responses[401])
  @Post()
  async createConcept(
    @Session() session: IUserSession,
    @Body() body: NewConceptDto,
  ) {
    body.tenantId = this.tenantScope.resolveRequestedTenant(
      session,
      body.tenantId,
    );
    return this.conceptService.createNewConcept(body);
  }

  @ApiOperation(updateConceptDoc.operation)
  @ApiResponse(updateConceptDoc.responses[200])
  @ApiResponse(updateConceptDoc.responses[400])
  @ApiResponse(updateConceptDoc.responses[401])
  @ApiResponse(updateConceptDoc.responses[404])
  @Patch(':conceptId')
  async updateConcept(
    @Session() session: IUserSession,
    @Param('conceptId') conceptId: number,
    @Body() body: UpdateConceptDto,
  ) {
    await this.tenantScope.assertOwns('payrollConcept', conceptId, session);
    // un concepto no cambia de empresa
    delete body.tenantId;
    return this.conceptService.updateConcept(body, conceptId);
  }

  @ApiOperation(softDeleteConceptDoc.operation)
  @ApiResponse(softDeleteConceptDoc.responses[200])
  @ApiResponse(softDeleteConceptDoc.responses[401])
  @ApiResponse(softDeleteConceptDoc.responses[404])
  @Patch(':conceptId/soft-delete')
  async softDeleteConcept(
    @Session() session: IUserSession,
    @Param('conceptId') conceptId: number,
  ) {
    await this.tenantScope.assertOwns('payrollConcept', conceptId, session);
    return this.conceptService.softDeleteConcept(conceptId);
  }

  @Patch(':conceptId/reactivate')
  async reactivateConcept(
    @Session() session: IUserSession,
    @Param('conceptId') conceptId: number,
  ) {
    await this.tenantScope.assertOwns('payrollConcept', conceptId, session);
    return this.conceptService.reactivateConcept(conceptId);
  }

  @ApiOperation(deleteConceptDoc.operation)
  @ApiResponse(deleteConceptDoc.responses[200])
  @ApiResponse(deleteConceptDoc.responses[401])
  @ApiResponse(deleteConceptDoc.responses[404])
  @Delete(':conceptId')
  async deleteConcept(
    @Session() session: IUserSession,
    @Param('conceptId') conceptId: number,
  ) {
    await this.tenantScope.assertOwns('payrollConcept', conceptId, session);
    return this.conceptService.deleteConcept(conceptId);
  }
}
