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

interface AccountListQuery {
  status?: string;
  sort_by?: string;
  sort_dir?: string;
  branch_id?: string;
}

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

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateService: StateService,
  ) {}

  async getAccountsOverview(session: IUserSession, branchId?: string) {
    const isSuperuser =
      this.stateService.getRole(session.role_id).role_name ===
      SUPERUSER_ROLE_NAME;

    const { alertConfig } = accountsOverviewQueries;
    const branch = branchId || null;

    // CxP: filtro multi-tenant (salvo superuser) + sucursal opcional (via warehouse->branch).
    const apValues: unknown[] = [];
    const apConditions: string[] = ['ap.is_paid = false'];
    if (!isSuperuser) {
      apValues.push(session.tenant_id);
      apConditions.push(`b.tenant_id = $${apValues.length}`);
    }
    if (branch) {
      apValues.push(branch);
      apConditions.push(`b.branch_id = $${apValues.length}`);
    }
    const apSql = `
      ${apOverviewSelect}
      WHERE ${apConditions.join(' AND ')}
      ORDER BY ap.due_date DESC, pap.created_at DESC
    `;

    // CxC: filtro multi-tenant (salvo superuser) + sucursal opcional (via sale.branch_id).
    const arValues: unknown[] = [];
    const arConditions: string[] = ['ar.is_paid = false'];
    if (!isSuperuser) {
      arValues.push(session.tenant_id);
      arConditions.push(`ar.tenant_id = $${arValues.length}`);
    }
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
        session.tenant_id
          ? this.db
              .query(alertConfig.getPayableConfig, [session.tenant_id])
              .catch(() => ({ rows: [] }))
          : Promise.resolve({ rows: [] }),
        session.tenant_id
          ? this.db
              .query(alertConfig.getReceivableConfig, [session.tenant_id])
              .catch(() => ({ rows: [] }))
          : Promise.resolve({ rows: [] }),
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

  async getPayablesList(query: AccountListQuery, session: IUserSession) {
    const isSuperuser =
      this.stateService.getRole(session.role_id).role_name ===
      SUPERUSER_ROLE_NAME;

    const values: unknown[] = [];
    const conditions: string[] = ['ap.is_paid = false'];

    if (!isSuperuser) {
      values.push(session.tenant_id);
      conditions.push(`b.tenant_id = $${values.length}`);
    }

    if (query.status && /^\d+$/.test(query.status)) {
      values.push(parseInt(query.status, 10));
      conditions.push(`pap.account_payable_status = $${values.length}`);
    }

    if (query.branch_id) {
      values.push(query.branch_id);
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

  async getReceivablesList(query: AccountListQuery, session: IUserSession) {
    const isSuperuser =
      this.stateService.getRole(session.role_id).role_name ===
      SUPERUSER_ROLE_NAME;

    const values: unknown[] = [];
    const conditions: string[] = ['ar.is_paid = false'];

    if (!isSuperuser) {
      values.push(session.tenant_id);
      conditions.push(`ar.tenant_id = $${values.length}`);
    }

    if (query.status && /^\d+$/.test(query.status)) {
      values.push(parseInt(query.status, 10));
      conditions.push(`sar.account_receivable_status = $${values.length}`);
    }

    if (query.branch_id) {
      values.push(query.branch_id);
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
