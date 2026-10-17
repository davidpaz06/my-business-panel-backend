import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { StateService } from '@/contexts/general/modules/state/state.service';
import {
  accountsOverviewQueries,
  apOverviewSelect,
  arGroupByClause,
  arOverviewSelect,
} from './accounts.queries';
import { IUserSession } from '@/common/interfaces/user_session.interface';

import { AccountListQueryDto } from './dto/accounts-query.dto';

// role_hierarchy 1 es employee; el superusuario se identifica por nombre de rol
const SUPERUSER_ROLE_NAME = 'superuser';

export interface AlertConfig {
  warning_days_before_due: number;
  urgent_days_before_due: number;
}

const AP_SORT_COLS: Record<string, string> = {
  due_date: 'ap.due_date',
  created_at: 'pap.created_at',
  balance_due: 'balance_due',
};

const AR_SORT_COLS: Record<string, string> = {
  due_date: 'ar.due_date',
  created_at: 'sar.created_at',
  balance_due: 'balance_due',
};

// Todas las vistas de Cuentas filtran SIEMPRE por un tenant (el de la sesion,
// o el que el superusuario pida explicitamente, ver el controller): mezclar
// CxP/CxC de varias empresas en una tabla y aplicarles la configuracion de
// alertas de otro tenant no tiene sentido de negocio.
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateService: StateService,
  ) {}

  async getAccountsOverview(tenantId: string, branchId?: string) {
    const { alertConfig } = accountsOverviewQueries;
    const branch = branchId || null;

    // CxP: tenant + sucursal opcional (via warehouse->branch).
    const apValues: unknown[] = [tenantId];
    const apConditions: string[] = ['ap.is_paid = false', 'b.tenant_id = $1'];
    if (branch) {
      apValues.push(branch);
      apConditions.push(`b.branch_id = $${apValues.length}`);
    }
    const apSql = `
      ${apOverviewSelect}
      WHERE ${apConditions.join(' AND ')}
      ORDER BY ap.due_date DESC, pap.created_at DESC
    `;

    // CxC: tenant + sucursal opcional (via sale.branch_id).
    const arValues: unknown[] = [tenantId];
    const arConditions: string[] = ['ar.is_paid = false', 'ar.tenant_id = $1'];
    if (branch) {
      arValues.push(branch);
      arConditions.push(`sale_b.branch_id = $${arValues.length}`);
    }
    const arSql = `
      ${arOverviewSelect}
      WHERE ${arConditions.join(' AND ')}
      ${arGroupByClause}
      ORDER BY ar.due_date DESC, sar.created_at DESC
    `;

    const [payablesResult, receivablesResult, apConfigResult, arConfigResult] =
      await Promise.all([
        this.db.query(apSql, apValues),
        this.db.query(arSql, arValues),
        this.db
          .query(alertConfig.getPayableConfig, [tenantId])
          .catch(() => ({ rows: [] })),
        this.db
          .query(alertConfig.getReceivableConfig, [tenantId])
          .catch(() => ({ rows: [] })),
      ]);

    const payablesAlertConfig: AlertConfig | null =
      apConfigResult.rows[0] ?? null;
    const receivablesAlertConfig: AlertConfig | null =
      arConfigResult.rows[0] ?? null;

    return {
      payables: payablesResult.rows,
      receivables: receivablesResult.rows,
      payables_alert_config: payablesAlertConfig,
      receivables_alert_config: receivablesAlertConfig,
    };
  }

  async getPayablesList(query: AccountListQueryDto, tenantId: string) {
    const values: unknown[] = [tenantId];
    const conditions: string[] = ['ap.is_paid = false', 'b.tenant_id = $1'];

    if (query.status) {
      values.push(parseInt(query.status, 10));
      conditions.push(`pap.account_payable_status = $${values.length}`);
    }

    if (query.branchId) {
      values.push(query.branchId);
      conditions.push(`b.branch_id = $${values.length}`);
    }

    const sortCol =
      AP_SORT_COLS[query.sort_by ?? ''] ?? AP_SORT_COLS['due_date'];
    const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';

    const sql = `
      ${apOverviewSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortCol} ${sortDir}, pap.created_at DESC
    `;

    const result = await this.db.query(sql, values);
    return result.rows;
  }

  async getReceivablesList(query: AccountListQueryDto, tenantId: string) {
    const values: unknown[] = [tenantId];
    const conditions: string[] = ['ar.is_paid = false', 'ar.tenant_id = $1'];

    if (query.status) {
      values.push(parseInt(query.status, 10));
      conditions.push(`sar.account_receivable_status = $${values.length}`);
    }

    if (query.branchId) {
      values.push(query.branchId);
      conditions.push(`sale_b.branch_id = $${values.length}`);
    }

    const sortCol =
      AR_SORT_COLS[query.sort_by ?? ''] ?? AR_SORT_COLS['due_date'];
    const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';

    const sql = `
      ${arOverviewSelect}
      WHERE ${conditions.join(' AND ')}
      ${arGroupByClause}
      ORDER BY ${sortCol} ${sortDir}, sar.created_at DESC
    `;

    const result = await this.db.query(sql, values);
    return result.rows;
  }

  async getPayablePayments(payableId: string, session: IUserSession) {
    const isSuperuser =
      this.stateService.getRole(session.role_id).role_name ===
      SUPERUSER_ROLE_NAME;

    const { payableDetail } = accountsOverviewQueries;

    const accessResult = await this.db.query(payableDetail.getAccess, [
      payableId,
    ]);

    if (!accessResult.rows[0]) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    if (!isSuperuser && accessResult.rows[0].tenant_id !== session.tenant_id) {
      throw new ForbiddenException('Sin acceso a esta cuenta');
    }

    const result = await this.db.query(payableDetail.getPayments, [payableId]);
    return result.rows;
  }

  async getReceivableCollections(receivableId: string, session: IUserSession) {
    const isSuperuser =
      this.stateService.getRole(session.role_id).role_name ===
      SUPERUSER_ROLE_NAME;

    const { receivableDetail } = accountsOverviewQueries;

    const accessResult = await this.db.query(receivableDetail.getAccess, [
      receivableId,
    ]);

    if (!accessResult.rows[0]) {
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    }

    if (!isSuperuser && accessResult.rows[0].tenant_id !== session.tenant_id) {
      throw new ForbiddenException('Sin acceso a esta cuenta');
    }

    const result = await this.db.query(receivableDetail.getCollections, [
      receivableId,
    ]);
    return result.rows;
  }
}
