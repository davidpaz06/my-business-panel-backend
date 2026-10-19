import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { accountingQueries } from './accounting.queries';
import { CreateAccountDto, UpdateAccountDto } from './dto/create-account.dto';
import {
  CreateCostCenterDto,
  UpdateCostCenterDto,
} from './dto/cost-center.dto';
import { CreateJournalEntryDto } from './dto/journal-entry.dto';
import {
  AccountFromDb,
  CostCenterFromDb,
  JournalEntryFromDb,
} from './interface/accounting.interface';

@Injectable()
export class AccountingService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // -------------------------------------------------------
  // CHART OF ACCOUNTS
  // -------------------------------------------------------

  async getAccountsByTenant(tenantId: string): Promise<AccountFromDb[]> {
    const { rows } = await this.db.query(
      accountingQueries.getAccountsByTenant,
      [tenantId],
    );
    return rows;
  }

  async getAccountById(
    accountId: string,
    tenantId: string,
  ): Promise<AccountFromDb> {
    const { rows } = await this.db.query(accountingQueries.getAccountById, [
      accountId,
      tenantId,
    ]);
    if (!rows.length) {
      throw new NotFoundException('Cuenta contable no encontrada');
    }
    return rows[0];
  }

  async createAccount(tenantId: string, dto: CreateAccountDto) {
    const { rows } = await this.db.query(accountingQueries.createAccount, [
      tenantId,
      dto.account_code,
      dto.account_name,
      dto.account_type_id,
      dto.parent_account_id ?? null,
      dto.cost_center_id ?? null,
      dto.allows_transactions ?? true,
    ]);
    return rows[0];
  }

  async updateAccount(
    accountId: string,
    tenantId: string,
    dto: UpdateAccountDto,
  ) {
    const { rows } = await this.db.query(accountingQueries.updateAccount, [
      accountId,
      tenantId,
      dto.account_name ?? null,
      dto.is_active ?? null,
      dto.cost_center_id ?? null,
    ]);
    if (!rows.length) {
      throw new BadRequestException(
        'No se pudo actualizar la cuenta. Verifique que no sea una cuenta del sistema.',
      );
    }
    return rows[0];
  }

  async getAccountTypes() {
    const { rows } = await this.db.query(accountingQueries.getAccountTypes);
    return rows;
  }

  async provisionTenantAccounts(tenantId: string) {
    const { rows } = await this.db.query(
      accountingQueries.provisionTenantAccounts,
      [tenantId],
    );
    return { accounts_created: rows[0].accounts_created };
  }

  // -------------------------------------------------------
  // COST CENTERS
  // -------------------------------------------------------

  async getCostCentersByTenant(tenantId: string): Promise<CostCenterFromDb[]> {
    const { rows } = await this.db.query(
      accountingQueries.getCostCentersByTenant,
      [tenantId],
    );
    return rows;
  }

  async getCostCenterById(
    costCenterId: string,
    tenantId: string,
  ): Promise<CostCenterFromDb> {
    const { rows } = await this.db.query(accountingQueries.getCostCenterById, [
      costCenterId,
      tenantId,
    ]);
    if (!rows.length) {
      throw new NotFoundException('Centro de costo no encontrado');
    }
    return rows[0];
  }

  async createCostCenter(tenantId: string, dto: CreateCostCenterDto) {
    const { rows } = await this.db.query(accountingQueries.createCostCenter, [
      tenantId,
      dto.center_code,
      dto.center_name,
    ]);
    return rows[0];
  }

  async updateCostCenter(
    costCenterId: string,
    tenantId: string,
    dto: UpdateCostCenterDto,
  ) {
    const { rows } = await this.db.query(accountingQueries.updateCostCenter, [
      costCenterId,
      tenantId,
      dto.center_name ?? null,
      dto.is_active ?? null,
    ]);
    if (!rows.length) {
      throw new NotFoundException('Centro de costo no encontrado');
    }
    return rows[0];
  }

  // -------------------------------------------------------
  // JOURNAL ENTRIES
  // -------------------------------------------------------

  async getJournalEntriesByTenant(
    tenantId: string,
  ): Promise<JournalEntryFromDb[]> {
    const { rows } = await this.db.query(
      accountingQueries.getJournalEntriesByTenant,
      [tenantId],
    );
    return rows;
  }

  async getJournalEntryById(
    entryId: string,
    tenantId: string,
  ): Promise<JournalEntryFromDb> {
    const { rows } = await this.db.query(
      accountingQueries.getJournalEntryById,
      [entryId, tenantId],
    );
    if (!rows.length) {
      throw new NotFoundException('Asiento contable no encontrado');
    }
    return rows[0];
  }

  async createJournalEntry(
    tenantId: string,
    userId: string,
    dto: CreateJournalEntryDto,
  ) {
    const totalDebit = dto.lines.reduce((sum, l) => sum + l.debit_amount, 0);
    const totalCredit = dto.lines.reduce((sum, l) => sum + l.credit_amount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(
        `El asiento no está balanceado: débitos=${totalDebit} créditos=${totalCredit}`,
      );
    }

    const txn = await this.db.transaction();
    try {
      const { rows } = await txn.query(accountingQueries.createJournalEntry, [
        tenantId,
        dto.source_type_id,
        dto.source_id ?? null,
        dto.entry_date,
        dto.description ?? null,
        userId,
      ]);
      const entryId = rows[0].entry_id;

      await txn.bulkInsert(
        'accounting_schema.journal_entry_line',
        [
          'entry_id',
          'account_id',
          'cost_center_id',
          'debit_amount',
          'credit_amount',
          'description',
        ],
        dto.lines.map((line) => [
          entryId,
          line.account_id,
          line.cost_center_id ?? null,
          line.debit_amount,
          line.credit_amount,
          line.description ?? null,
        ]),
      );

      // Validate balance and confirm via DB function
      await txn.query(accountingQueries.confirmJournalEntry, [entryId]);

      await txn.commit();
      return { entry_id: entryId };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Error al crear el asiento contable: ' + (error as Error).message,
      );
    }
  }

  async voidJournalEntry(entryId: string, tenantId: string, userId: string) {
    await this.getJournalEntryById(entryId, tenantId);

    const { rows } = await this.db.query(accountingQueries.voidJournalEntry, [
      entryId,
      userId,
    ]);
    return { reversal_entry_id: rows[0].reversal_entry_id };
  }

  async getSourceTypes() {
    const { rows } = await this.db.query(accountingQueries.getSourceTypes);
    return rows;
  }

  async getJournalEntryStatuses() {
    const { rows } = await this.db.query(
      accountingQueries.getJournalEntryStatuses,
    );
    return rows;
  }
}
