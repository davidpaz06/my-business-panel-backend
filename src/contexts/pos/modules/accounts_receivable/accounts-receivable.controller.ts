import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { AccountsReceivableService } from './accounts-receivable.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@ApiTags('Accounts Receivable')
@UseGuards(AuthenticationGuard)
@Controller('pos/receivables')
export class AccountsReceivableController {
  constructor(
    private readonly accountsReceivableService: AccountsReceivableService,
  ) {}

  @ApiOperation({ summary: 'Listar cuentas por cobrar' })
  @Get()
  findAll(
    @Session() session: IUserSession,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.accountsReceivableService.getAccountsReceivable(
      session,
      parseInt(page),
      parseInt(limit),
    );
  }

  @ApiOperation({ summary: 'Obtener catálogos para el módulo CxC' })
  @Get('catalogs')
  getCatalogs() {
    return this.accountsReceivableService.getCatalogs();
  }

  @ApiOperation({ summary: 'Registrar cobro sobre una cuenta por cobrar' })
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('admin', 'manager')
  @Post('collection')
  registerCollection(
    @Body() dto: CreateCollectionDto,
    @Session() session: IUserSession,
  ) {
    return this.accountsReceivableService.registerCollection(dto, session);
  }

  @ApiOperation({ summary: 'Actualizar cobro registrado' })
  @UseGuards(RoleAuthorizationGuard)
  @RequiredRole('admin', 'manager')
  @Patch('collection/:id')
  updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @Session() session: IUserSession,
  ) {
    return this.accountsReceivableService.updateCollection(id, dto, session);
  }
}
