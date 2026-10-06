import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { TenantService } from './tenant.service';
import { NewTenantDto } from './dto/newTenant.dto';
import { UpdateTenantDto } from './dto/updateTenant.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { UserService } from '../user/user.service';
import { InvalidTenantError } from '@/common/errors/invalid_tenant.error';
import {
  getAllTenantsDoc,
  getSingleTenantDoc,
  getUsersByTenantDoc,
  createTenantDoc,
  updateTenantDoc,
  deleteTenantDoc,
} from '@/docs/contexts/general/tenant';

// Rutas publicas a proposito (onboarding, usuario aun sin cuenta):
//   GET  /tenant/availability  y  POST /tenant (solo con user + subscription).
// El resto exige sesion; un tenant ajeno responde 404 salvo para el
// superusuario de plataforma.
const SAFE_TENANT_UPDATE_FIELDS = [
  'tenant_name',
  'contact_email',
  'contact_phone',
  'identification_type_id',
  'identification',
  'economic_activity',
  'sign',
] as const;

@ApiTags('Tenant')
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly userService: UserService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getAllTenantsDoc.operation)
  @ApiResponse(getAllTenantsDoc.responses[200])
  @ApiResponse(getAllTenantsDoc.responses[401])
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser')
  @Get()
  async getAllTenants() {
    return this.tenantService.getAllTenants();
  }

  /**
   * Sonda pública del onboarding: el frontend valida si el correo,
   * documento, identificación tributaria o nombre comercial ya están
   * tomados antes de pasar el formulario. Sin autenticación porque el
   * usuario aún no se ha registrado.
   */
  @Get('availability')
  async checkOnboardingAvailability(
    @Query('field') field: string,
    @Query('value') value: string,
  ) {
    const allowed = [
      'email',
      'doc_number',
      'tenant_identification',
      'tenant_name',
    ];
    if (!allowed.includes(field)) {
      throw new BadRequestException(
        `Campo no soportado. Usa uno de: ${allowed.join(', ')}`,
      );
    }
    return this.tenantService.checkOnboardingAvailability(
      field as 'email' | 'doc_number' | 'tenant_identification' | 'tenant_name',
      value ?? '',
    );
  }

  @ApiOperation(getSingleTenantDoc.operation)
  @ApiResponse(getSingleTenantDoc.responses[200])
  @ApiResponse(getSingleTenantDoc.responses[401])
  @UseGuards(AuthenticationGuard)
  @Get(':id')
  async getSingleTenant(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    return this.tenantService.getTenantById(
      this.tenantScope.resolveRequestedTenant(session, id),
    );
  }

  @ApiOperation(getUsersByTenantDoc.operation)
  @ApiResponse(getUsersByTenantDoc.responses[200])
  @ApiResponse(getUsersByTenantDoc.responses[400])
  @ApiResponse(getUsersByTenantDoc.responses[401])
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser', 'admin', 'manager')
  @Get(':id/users')
  async getUsersByTenant(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    if (!id) throw new InvalidTenantError(id);
    return this.userService.getUsersByTenant(
      this.tenantScope.resolveRequestedTenant(session, id),
    );
  }

  @ApiOperation(createTenantDoc.operation)
  @ApiResponse(createTenantDoc.responses[201])
  @ApiResponse(createTenantDoc.responses[400])
  @ApiResponse(createTenantDoc.responses[401])
  @Post()
  async createTenant(
    @Body() req: NewTenantDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Alta publica: solo el flujo de onboarding completo (tenant + usuario +
    // suscripcion). Crear un tenant suelto es de plataforma: POST /tenant/bare.
    if (!req.user || !req.subscription) {
      throw new BadRequestException(
        'El registro publico requiere los datos de usuario y suscripcion',
      );
    }
    const result = await this.tenantService.createTenant(req);

    if (result.token) {
      response.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
      });
      const { token, ...data } = result;
      return data;
    }

    return result;
  }

  @ApiOperation({
    summary: 'Crear un tenant suelto (solo plataforma)',
  })
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser')
  @Post('bare')
  async createBareTenant(@Body() req: NewTenantDto) {
    return this.tenantService.createTenant({
      ...req,
      user: undefined,
      subscription: undefined,
    });
  }

  @ApiOperation(updateTenantDoc.operation)
  @ApiResponse(updateTenantDoc.responses[200])
  @ApiResponse(updateTenantDoc.responses[400])
  @ApiResponse(updateTenantDoc.responses[401])
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser', 'admin')
  @Patch(':id')
  async updateTenant(
    @Session() session: IUserSession,
    @Param('id') id: string,
    @Body() req: UpdateTenantDto,
  ) {
    const tenantId = this.tenantScope.resolveRequestedTenant(session, id);
    if (this.tenantScope.isSuperuser(session)) {
      return this.tenantService.updateTenant(tenantId, req);
    }
    // un admin edita los datos de su empresa, no su estado de suscripcion ni
    // su region
    const safe: Record<string, unknown> = {};
    for (const field of SAFE_TENANT_UPDATE_FIELDS) {
      if (req[field] !== undefined) safe[field] = req[field];
    }
    return this.tenantService.updateTenant(tenantId, safe as UpdateTenantDto);
  }

  @ApiOperation(deleteTenantDoc.operation)
  @ApiResponse(deleteTenantDoc.responses[200])
  @ApiResponse(deleteTenantDoc.responses[401])
  @ApiResponse(deleteTenantDoc.responses[404])
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser')
  @Delete(':id')
  async deleteTenant(@Param('id') id: string) {
    return this.tenantService.deleteTenant(id);
  }
}
