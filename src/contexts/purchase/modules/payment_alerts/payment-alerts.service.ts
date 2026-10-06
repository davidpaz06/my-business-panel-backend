import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Database from '@crane-technologies/database/dist/components/Database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { purchaseQueries } from '@purchase/purchase.queries';
import { UpsertPaymentAlertConfigDto } from './dto/upsert-payment-alert-config.dto';

const { alerts } = purchaseQueries;
// role_hierarchy 1 es employee; el superusuario se identifica por nombre de rol
const SUPERUSER_ROLE_NAME = 'superuser';

@Injectable()
export class PaymentAlertsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateService: StateService,
  ) {}

  async getPendingAlerts(session: IUserSession, tenantId?: string) {
    const scopedTenantId = this.resolveTenantId(session, tenantId);
    const result = await this.db.query(alerts.getPendingByTenant, [
      scopedTenantId,
    ]);
    return result.rows;
  }

  async getStats(session: IUserSession, tenantId?: string) {
    const scopedTenantId = this.resolveTenantId(session, tenantId);
    const result = await this.db.query(alerts.getStatsByTenant, [
      scopedTenantId,
    ]);
    return (
      result.rows[0] ?? {
        total_alerts: 0,
        overdue_count: 0,
        urgent_count: 0,
        warning_count: 0,
        total_amount_at_risk: 0,
      }
    );
  }

  async getConfig(session: IUserSession, tenantId?: string) {
    const scopedTenantId = this.resolveTenantId(session, tenantId);
    const [configResult, typesResult] = await Promise.all([
      this.db.query(alerts.getConfigByTenant, [scopedTenantId]),
      this.db.query(alerts.getTypes),
    ]);

    return {
      tenant_id: scopedTenantId,
      config: configResult.rows[0] ?? null,
      alert_types: typesResult.rows,
    };
  }

  async upsertConfig(dto: UpsertPaymentAlertConfigDto, session: IUserSession) {
    const scopedTenantId = this.resolveTenantId(session, dto.tenant_id);

    await this.db.query(alerts.upsertConfig, [
      scopedTenantId,
      dto.warning_days_before_due,
      dto.urgent_days_before_due,
      dto.email_notifications_enabled,
      dto.sms_notifications_enabled,
    ]);

    return this.getConfig(session, scopedTenantId);
  }

  async generate(session: IUserSession, tenantId?: string) {
    const scopedTenantId = this.resolveTenantId(session, tenantId);
    await this.db.query(alerts.generate);

    const [items, stats] = await Promise.all([
      this.getPendingAlerts(session, scopedTenantId),
      this.getStats(session, scopedTenantId),
    ]);

    return {
      tenant_id: scopedTenantId,
      alerts: items,
      stats,
    };
  }

  async resolve(alertId: string, session: IUserSession) {
    const accessResult = await this.db.query(alerts.getAccessById, [alertId]);
    const access = accessResult.rows[0];

    if (!access) {
      throw new NotFoundException('Alerta de pago no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    await this.db.query(alerts.resolve, [alertId]);

    return {
      payment_alert_id: alertId,
      is_resolved: true,
    };
  }

  private resolveTenantId(session: IUserSession, tenantId?: string) {
    if (!tenantId || tenantId === session.tenant_id) {
      return session.tenant_id;
    }

    if (!this.isSuperuser(session.role_id)) {
      throw new ForbiddenException(
        'No tienes permisos para consultar alertas de otro tenant',
      );
    }

    return tenantId;
  }

  private assertTenantAccess(resourceTenantId: string, session: IUserSession) {
    if (this.isSuperuser(session.role_id)) {
      return;
    }

    if (resourceTenantId !== session.tenant_id) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a esta alerta',
      );
    }
  }

  private isSuperuser(roleId: number) {
    return this.stateService.getRole(roleId).role_name === SUPERUSER_ROLE_NAME;
  }
}
