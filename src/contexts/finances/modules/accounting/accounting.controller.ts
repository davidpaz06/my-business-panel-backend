import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/create-account.dto';
import {
  CreateCostCenterDto,
  UpdateCostCenterDto,
} from './dto/cost-center.dto';
import { CreateJournalEntryDto } from './dto/journal-entry.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import {
  FINANCE_READ_ROLES,
  FINANCE_ADMIN_ROLES,
} from '@/contexts/finances/finances.roles';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import {
  getAccountTypesDoc,
  getSourceTypesDoc,
  getJournalEntryStatusesDoc,
  getAccountsDoc,
  getAccountByIdDoc,
  createAccountDoc,
  updateAccountDoc,
  provisionAccountsDoc,
  getCostCentersDoc,
  getCostCenterByIdDoc,
  createCostCenterDoc,
  updateCostCenterDoc,
  getJournalEntriesDoc,
  getJournalEntryByIdDoc,
  createJournalEntryDoc,
  voidJournalEntryDoc,
} from '@/docs/contexts/finances/accounting';

@ApiTags('Accounting')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@RequiredRole(...FINANCE_READ_ROLES)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // -------------------------------------------------------
  // CATALOGS
  // -------------------------------------------------------

  @ApiOperation(getAccountTypesDoc.operation)
  @ApiResponse(getAccountTypesDoc.responses[200])
  @ApiResponse(getAccountTypesDoc.responses[401])
  @Get('account-types')
  getAccountTypes() {
    return this.accountingService.getAccountTypes();
  }

  @ApiOperation(getSourceTypesDoc.operation)
  @ApiResponse(getSourceTypesDoc.responses[200])
  @ApiResponse(getSourceTypesDoc.responses[401])
  @Get('source-types')
  getSourceTypes() {
    return this.accountingService.getSourceTypes();
  }

  @ApiOperation(getJournalEntryStatusesDoc.operation)
  @ApiResponse(getJournalEntryStatusesDoc.responses[200])
  @ApiResponse(getJournalEntryStatusesDoc.responses[401])
  @Get('entry-statuses')
  getJournalEntryStatuses() {
    return this.accountingService.getJournalEntryStatuses();
  }

  // -------------------------------------------------------
  // CHART OF ACCOUNTS
  // -------------------------------------------------------

  @ApiOperation(getAccountsDoc.operation)
  @ApiResponse(getAccountsDoc.responses[200])
  @ApiResponse(getAccountsDoc.responses[401])
  @Get('accounts')
  getAccounts(@Session() session: IUserSession) {
    return this.accountingService.getAccountsByTenant(session.tenant_id);
  }

  @ApiOperation(getAccountByIdDoc.operation)
  @ApiResponse(getAccountByIdDoc.responses[200])
  @ApiResponse(getAccountByIdDoc.responses[401])
  @ApiResponse(getAccountByIdDoc.responses[404])
  @Get('accounts/:id')
  getAccountById(@Param('id') id: string, @Session() session: IUserSession) {
    return this.accountingService.getAccountById(id, session.tenant_id);
  }

  @ApiOperation(createAccountDoc.operation)
  @ApiResponse(createAccountDoc.responses[201])
  @ApiResponse(createAccountDoc.responses[400])
  @ApiResponse(createAccountDoc.responses[401])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post('accounts')
  createAccount(
    @Body() dto: CreateAccountDto,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.createAccount(session.tenant_id, dto);
  }

  @ApiOperation(updateAccountDoc.operation)
  @ApiResponse(updateAccountDoc.responses[200])
  @ApiResponse(updateAccountDoc.responses[400])
  @ApiResponse(updateAccountDoc.responses[401])
  @ApiResponse(updateAccountDoc.responses[404])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Patch('accounts/:id')
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.updateAccount(id, session.tenant_id, dto);
  }

  @ApiOperation(provisionAccountsDoc.operation)
  @ApiResponse(provisionAccountsDoc.responses[201])
  @ApiResponse(provisionAccountsDoc.responses[401])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post('accounts/provision')
  provisionAccounts(@Session() session: IUserSession) {
    return this.accountingService.provisionTenantAccounts(session.tenant_id);
  }

  // -------------------------------------------------------
  // COST CENTERS
  // -------------------------------------------------------

  @ApiOperation(getCostCentersDoc.operation)
  @ApiResponse(getCostCentersDoc.responses[200])
  @ApiResponse(getCostCentersDoc.responses[401])
  @Get('cost-centers')
  getCostCenters(@Session() session: IUserSession) {
    return this.accountingService.getCostCentersByTenant(session.tenant_id);
  }

  @ApiOperation(getCostCenterByIdDoc.operation)
  @ApiResponse(getCostCenterByIdDoc.responses[200])
  @ApiResponse(getCostCenterByIdDoc.responses[401])
  @ApiResponse(getCostCenterByIdDoc.responses[404])
  @Get('cost-centers/:id')
  getCostCenterById(@Param('id') id: string, @Session() session: IUserSession) {
    return this.accountingService.getCostCenterById(id, session.tenant_id);
  }

  @ApiOperation(createCostCenterDoc.operation)
  @ApiResponse(createCostCenterDoc.responses[201])
  @ApiResponse(createCostCenterDoc.responses[400])
  @ApiResponse(createCostCenterDoc.responses[401])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post('cost-centers')
  createCostCenter(
    @Body() dto: CreateCostCenterDto,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.createCostCenter(session.tenant_id, dto);
  }

  @ApiOperation(updateCostCenterDoc.operation)
  @ApiResponse(updateCostCenterDoc.responses[200])
  @ApiResponse(updateCostCenterDoc.responses[400])
  @ApiResponse(updateCostCenterDoc.responses[401])
  @ApiResponse(updateCostCenterDoc.responses[404])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Patch('cost-centers/:id')
  updateCostCenter(
    @Param('id') id: string,
    @Body() dto: UpdateCostCenterDto,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.updateCostCenter(id, session.tenant_id, dto);
  }

  // -------------------------------------------------------
  // JOURNAL ENTRIES
  // -------------------------------------------------------

  @ApiOperation(getJournalEntriesDoc.operation)
  @ApiResponse(getJournalEntriesDoc.responses[200])
  @ApiResponse(getJournalEntriesDoc.responses[401])
  @Get('journal-entries')
  getJournalEntries(@Session() session: IUserSession) {
    return this.accountingService.getJournalEntriesByTenant(session.tenant_id);
  }

  @ApiOperation(getJournalEntryByIdDoc.operation)
  @ApiResponse(getJournalEntryByIdDoc.responses[200])
  @ApiResponse(getJournalEntryByIdDoc.responses[401])
  @ApiResponse(getJournalEntryByIdDoc.responses[404])
  @Get('journal-entries/:id')
  getJournalEntryById(
    @Param('id') id: string,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.getJournalEntryById(id, session.tenant_id);
  }

  @ApiOperation(createJournalEntryDoc.operation)
  @ApiResponse(createJournalEntryDoc.responses[201])
  @ApiResponse(createJournalEntryDoc.responses[400])
  @ApiResponse(createJournalEntryDoc.responses[401])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post('journal-entries')
  createJournalEntry(
    @Body() dto: CreateJournalEntryDto,
    @Session() session: IUserSession,
  ) {
    return this.accountingService.createJournalEntry(
      session.tenant_id,
      session.user_id,
      dto,
    );
  }

  @ApiOperation(voidJournalEntryDoc.operation)
  @ApiResponse(voidJournalEntryDoc.responses[201])
  @ApiResponse(voidJournalEntryDoc.responses[401])
  @ApiResponse(voidJournalEntryDoc.responses[404])
  @RequiredRole(...FINANCE_ADMIN_ROLES)
  @Post('journal-entries/:id/void')
  voidJournalEntry(@Param('id') id: string, @Session() session: IUserSession) {
    return this.accountingService.voidJournalEntry(
      id,
      session.tenant_id,
      session.user_id,
    );
  }
}
