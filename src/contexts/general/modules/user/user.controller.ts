import {
  Controller,
  Delete,
  Post,
  Get,
  Put,
  Patch,
  Param,
  Query,
  ParseBoolPipe,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserService } from '@/contexts/general/modules/user/user.service';
import { CreateUserDto } from '@/contexts/general/modules/user/dto/create_user.dto';
import { AssignRoleDto } from '@/contexts/general/modules/user/dto/assign_role.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { ResetEmployeePasswordDto } from '@/contexts/general/modules/user/dto/reset_employee_password.dto';
import { CreateUserBulkDto } from '@/contexts/general/modules/user/dto/create_user_bulk.dto';
import { UpdateUserDto } from '@/contexts/general/modules/user/dto/update_user.dto';
import {
  createUserDoc,
  createUsersBulkDoc,
  assignRoleDoc,
  getUserRolesDoc,
  getSelfInfoDoc,
  getUserByEmailDoc,
  getUserByIdDoc,
  deleteUserDoc,
} from '@/docs/contexts/general/user';

// Aislamiento por tenant: el tenant sale SIEMPRE de la sesion. Un usuario de
// otro tenant responde 404 y nadie puede otorgar un rol superior al suyo.
@ApiTags('User')
@Controller('user')
@UseGuards(AuthenticationGuard, LevelAuthorizationGuard, RoleAuthorizationGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(createUserDoc.operation)
  @ApiResponse(createUserDoc.responses[201])
  @ApiResponse(createUserDoc.responses[400])
  @ApiResponse(createUserDoc.responses[401])
  @Post()
  @RequiredLevel(3)
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @Session() session: IUserSession,
  ) {
    this.userService.assertCanCreateFor(session, createUserDto);
    return this.userService.createUser(createUserDto);
  }

  @ApiOperation(createUsersBulkDoc.operation)
  @ApiResponse(createUsersBulkDoc.responses[201])
  @ApiResponse(createUsersBulkDoc.responses[400])
  @ApiResponse(createUsersBulkDoc.responses[401])
  @Post('bulk')
  @RequiredLevel(3)
  async createUsersBulk(
    @Body() createUserDtos: CreateUserBulkDto,
    @Session() session: IUserSession,
  ) {
    createUserDtos.users.forEach((dto) =>
      this.userService.assertCanCreateFor(session, dto),
    );
    return this.userService.createUsersBulk(createUserDtos.users);
  }

  @ApiOperation(assignRoleDoc.operation)
  @ApiResponse(assignRoleDoc.responses[200])
  @ApiResponse(assignRoleDoc.responses[401])
  @Put()
  @RequiredLevel(3)
  async assignRole(
    @Body() assignRoleDto: AssignRoleDto,
    @Session() session: IUserSession,
  ) {
    await this.tenantScope.assertOwns('user', assignRoleDto.user_id, session);
    this.userService.assertCanGrantRole(session, assignRoleDto.role_id);
    return this.userService.assignRole(assignRoleDto);
  }

  @ApiOperation(getUserRolesDoc.operation)
  @ApiResponse(getUserRolesDoc.responses[200])
  @ApiResponse(getUserRolesDoc.responses[401])
  @Get('roles')
  @RequiredLevel(1)
  getUserRoles() {
    return this.userService.getUserRoles();
  }

  // Uniqueness probe — checks the global unique constraint on users.email.
  @Get('availability')
  @RequiredLevel(3)
  async checkAvailability(
    @Query('email') email: string,
    @Query('exclude_id') excludeId?: string,
  ) {
    return this.userService.checkEmailAvailability(email, excludeId);
  }

  @ApiOperation(getSelfInfoDoc.operation)
  @ApiResponse(getSelfInfoDoc.responses[200])
  @ApiResponse(getSelfInfoDoc.responses[401])
  @Get()
  getSelfInfo(@Session() session: IUserSession) {
    return this.userService.getSelfInfo(session);
  }

  @ApiOperation(getUserByIdDoc.operation)
  @ApiResponse(getUserByIdDoc.responses[200])
  @ApiResponse(getUserByIdDoc.responses[401])
  @ApiResponse(getUserByIdDoc.responses[404])
  @RequiredLevel(3)
  @Get(':userId')
  async getUserById(
    @Param('userId') userId: string,
    @Session() session: IUserSession,
    @Query('full', new ParseBoolPipe({ optional: true })) full?: boolean,
  ) {
    await this.tenantScope.assertOwns('user', userId, session);
    return this.userService.getUserById(userId, full);
  }

  @ApiOperation(getUserByEmailDoc.operation)
  @ApiResponse(getUserByEmailDoc.responses[200])
  @ApiResponse(getUserByEmailDoc.responses[401])
  @ApiResponse(getUserByEmailDoc.responses[404])
  @RequiredLevel(3)
  @Get(':email')
  async getUserByEmail(
    @Param('email') email: string,
    @Session() session: IUserSession,
  ) {
    const found = await this.userService.getUserByEmail(email);
    if (!found) return null;
    await this.tenantScope.assertOwns('user', found.user_id, session);
    // Nunca exponer el hash de la contrasena.
    const { password_hash: _omit, ...safe } = found;
    void _omit;
    return safe;
  }

  // Solo el rol admin (no superuser ni manager) restablece claves de empleados.
  @Patch(':userId/password')
  @RequiredRole('admin')
  async resetEmployeePassword(
    @Param('userId') userId: string,
    @Body() dto: ResetEmployeePasswordDto,
    @Session() session: IUserSession,
  ) {
    return this.userService.resetEmployeePassword(
      session,
      userId,
      dto.new_password,
    );
  }

  @Patch(':userId')
  @RequiredLevel(3)
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Session() session: IUserSession,
  ) {
    await this.tenantScope.assertOwns('user', userId, session);
    if (updateUserDto.role_id !== undefined) {
      this.userService.assertCanGrantRole(session, updateUserDto.role_id);
    }
    return this.userService.updateUser(userId, updateUserDto);
  }

  @ApiOperation(deleteUserDoc.operation)
  @ApiResponse(deleteUserDoc.responses[200])
  @ApiResponse(deleteUserDoc.responses[401])
  @ApiResponse(deleteUserDoc.responses[404])
  @RequiredLevel(3)
  @Delete(':userId')
  async deleteUser(
    @Param('userId') userId: string,
    @Session() session: IUserSession,
  ) {
    await this.tenantScope.assertOwns('user', userId, session);
    return this.userService.deleteUser(userId);
  }
}
