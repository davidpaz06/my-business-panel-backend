import { CustomerService } from './customer.service';
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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NewClientDto } from './dto/newClient.dto';
import { UpdateClientDto } from './dto/updateClient.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  getAllCustomersForTenantDoc,
  getOneCustomerByIdDoc,
  getOneCustomerDoc,
  createCustomerDoc,
  updateCustomerDoc,
  deleteCustomerDoc,
} from '@/docs/contexts/general/customer';

// Aislamiento por tenant: el tenant sale SIEMPRE de la sesion. Las rutas que
// conservan :tenantId (compatibilidad con el frontend) lo validan contra la
// sesion; ningun endpoint confia en un tenant_id enviado por el cliente.
@ApiTags('Customer')
@Controller('customers')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  // Listado global: solo superusuario de plataforma. Debe declararse ANTES de
  // las rutas con parametro.
  @Get('all')
  @RequiredRole('superuser')
  async getAllCustomersGlobal(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    return this.customerService.getAllCustomersGlobal(
      parseInt(page),
      parseInt(limit),
    );
  }

  // Sonda de unicidad usada por el frontend antes de crear/editar. Siempre
  // sobre el tenant de la sesion: con un tenant ajeno serviria para averiguar
  // si un documento, email o telefono existe en otra empresa.
  @Get('availability')
  async checkAvailability(
    @Session() session: IUserSession,
    @Query('field') field: string,
    @Query('value') value: string,
    @Query('tenant_id') requestedTenantId?: string,
    @Query('exclude_id') excludeId?: string,
  ) {
    return this.customerService.checkAvailability(
      this.tenantScope.resolveRequestedTenant(session, requestedTenantId),
      field,
      value,
      excludeId,
    );
  }

  @ApiOperation(getAllCustomersForTenantDoc.operation)
  @ApiResponse(getAllCustomersForTenantDoc.responses[200])
  @ApiResponse(getAllCustomersForTenantDoc.responses[401])
  @Get('tenant/:tenantId')
  async getAllCustomersForTenant(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('segment_id') segmentId?: string,
  ) {
    return this.customerService.getAllCustomersPaginated(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      parseInt(page),
      parseInt(limit),
      segmentId,
    );
  }

  @Get('tenant/:tenantId/search')
  async searchCustomers(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
    @Query('q') query: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('segment_id') segmentId?: string,
  ) {
    return this.customerService.search(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
      query,
      parseInt(page),
      parseInt(limit),
      segmentId,
    );
  }

  // Busqueda por documento (buscador de la venta): estrictamente el tenant de
  // la sesion, tambien para el superusuario.
  @ApiOperation(getOneCustomerDoc.operation)
  @ApiResponse(getOneCustomerDoc.responses[200])
  @ApiResponse(getOneCustomerDoc.responses[401])
  @ApiResponse(getOneCustomerDoc.responses[404])
  @Get('doc/:documentId')
  async getOneCustomer(
    @Session() session: IUserSession,
    @Param('documentId') documentId: string,
  ) {
    return this.customerService.findCustomerByDocumentId(
      documentId,
      session.tenant_id,
    );
  }

  @ApiOperation(getOneCustomerByIdDoc.operation)
  @ApiResponse(getOneCustomerByIdDoc.responses[200])
  @ApiResponse(getOneCustomerByIdDoc.responses[401])
  @ApiResponse(getOneCustomerByIdDoc.responses[404])
  @Get(':id/detail')
  async getCustomerDetail(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.customerService.getCustomerDetail(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @Get(':id/sales')
  async getCustomerSalesHistory(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.customerService.getCustomerSalesHistory(
      id,
      this.tenantScope.scopeFor(session),
      parseInt(page),
      parseInt(limit),
    );
  }

  @Get(':id')
  async getOneCustomerById(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.customerService.findCustomerById(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(createCustomerDoc.operation)
  @ApiResponse(createCustomerDoc.responses[201])
  @ApiResponse(createCustomerDoc.responses[400])
  @ApiResponse(createCustomerDoc.responses[401])
  @Post()
  async createCustomer(
    @Session() session: IUserSession,
    @Body() request: NewClientDto,
  ) {
    return this.customerService.createCustomer(session.tenant_id, request);
  }

  @ApiOperation(updateCustomerDoc.operation)
  @ApiResponse(updateCustomerDoc.responses[200])
  @ApiResponse(updateCustomerDoc.responses[400])
  @ApiResponse(updateCustomerDoc.responses[401])
  @Patch(':id')
  async updateCustomer(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() request: UpdateClientDto,
  ) {
    return this.customerService.updateCustomer(
      id,
      request,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(deleteCustomerDoc.operation)
  @ApiResponse(deleteCustomerDoc.responses[200])
  @ApiResponse(deleteCustomerDoc.responses[401])
  @ApiResponse(deleteCustomerDoc.responses[404])
  @Delete(':id')
  async deleteCustomer(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.customerService.deleteCustomer(
      id,
      this.tenantScope.scopeFor(session),
    );
  }
}
