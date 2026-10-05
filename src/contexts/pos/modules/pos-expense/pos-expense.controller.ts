import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PosExpenseService } from './pos-expense.service';
import {
  CreateExpenseDto,
  CreateExpenseTypeDto,
  UpdateExpenseStatusDto,
} from './dto/pos-expense.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('POS Expense')
@UseGuards(AuthenticationGuard)
@Controller('pos-expense')
export class PosExpenseController {
  constructor(
    private readonly service: PosExpenseService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('types/:tenantId')
  listTypes(
    @Session() session: IUserSession,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.listTypesByTenant(
      this.tenantScope.resolveRequestedTenant(session, tenantId),
    );
  }

  @Post('types')
  createType(
    @Session() session: IUserSession,
    @Body() data: CreateExpenseTypeDto,
  ) {
    return this.service.createType(session.tenant_id, data);
  }

  @Get('branch/:branchId')
  listByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    return this.service.listByBranch(branchId, session);
  }

  @Post()
  create(@Body() data: CreateExpenseDto, @Session() session: IUserSession) {
    return this.service.create(data, session);
  }

  @Patch(':expenseId/status')
  updateStatus(
    @Param('expenseId') expenseId: string,
    @Body() data: UpdateExpenseStatusDto,
    @Session() session: IUserSession,
  ) {
    return this.service.updateStatus(
      expenseId,
      data.status,
      session,
      data.rejection_reason,
    );
  }
}
