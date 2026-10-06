import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import Database from '@crane-technologies/database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { IUserSession } from '@/common/interfaces/user_session.interface';

/**
 * Recursos cuya pertenencia a un tenant se puede verificar por id. Cada entrada
 * es una consulta fija ($1 = id del recurso, $2 = tenant_id): nunca se
 * interpola texto del cliente.
 */
const OWNERSHIP_QUERIES = {
  branch: `
    SELECT 1 FROM general_schema.branch
    WHERE branch_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  customer: `
    SELECT 1 FROM general_schema.tenant_customer
    WHERE tenant_customer_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  user: `
    SELECT 1 FROM general_schema.users
    WHERE user_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  promotion: `
    SELECT 1 FROM pos_schema.promotion
    WHERE promotion_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  royaltyRule: `
    SELECT 1 FROM pos_schema.royalty_rule
    WHERE royalty_rule_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  royaltyOption: `
    SELECT 1 FROM pos_schema.royalty_option
    WHERE royalty_option_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  expenseType: `
    SELECT 1 FROM pos_schema.expense_type
    WHERE expense_type_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  expense: `
    SELECT 1 FROM pos_schema.expense e
    INNER JOIN general_schema.branch b ON b.branch_id = e.branch_id
    WHERE e.expense_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  tenantProductGroup: `
    SELECT 1 FROM general_schema.tenant_product_group
    WHERE tenant_product_group_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  tenantProductGroupType: `
    SELECT 1 FROM general_schema.tenant_product_group_type
    WHERE tenant_product_group_type_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  sale: `
    SELECT 1 FROM pos_schema.sale s
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    WHERE s.sale_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  customerPayment: `
    SELECT 1 FROM pos_schema.customer_payment cp
    INNER JOIN pos_schema.sale s ON s.sale_id = cp.sale_id
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    WHERE cp.customer_payment_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  customerSegmentMargin: `
    SELECT 1 FROM general_schema.customer_segment_margin
    WHERE customer_segment_margin_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  payrollConcept: `
    SELECT 1 FROM hr_schema.payroll_concept
    WHERE concept_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  employee: `
    SELECT 1 FROM hr_schema.employee
    WHERE employee_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  contract: `
    SELECT 1 FROM hr_schema.contract
    WHERE contract_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  turn: `
    SELECT 1 FROM hr_schema.turn t
    INNER JOIN general_schema.branch b ON b.branch_id = t.branch_id
    WHERE t.turn_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  suspention: `
    SELECT 1 FROM hr_schema.suspention s
    INNER JOIN general_schema.branch b ON b.branch_id = s.branch_id
    WHERE s.suspention_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  incapacity: `
    SELECT 1 FROM hr_schema.incapacity i
    INNER JOIN general_schema.branch b ON b.branch_id = i.branch_id
    WHERE i.incapacity_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  clocking: `
    SELECT 1 FROM hr_schema.clocking c
    INNER JOIN general_schema.branch b ON b.branch_id = c.branch_id
    WHERE c.clocking_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  paysheet: `
    SELECT 1 FROM hr_schema.paysheet
    WHERE paysheet_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  paysheetDetail: `
    SELECT 1 FROM hr_schema.paysheet_detail d
    INNER JOIN hr_schema.paysheet p ON p.paysheet_id = d.paysheet_id
    WHERE d.detail_id = $1 AND p.tenant_id = $2 LIMIT 1
  `,
  productVariant: `
    SELECT 1 FROM general_schema.product_variant
    WHERE product_variant_id = $1 AND tenant_id = $2 LIMIT 1
  `,
  cashRegister: `
    SELECT 1 FROM pos_schema.cash_register cr
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    WHERE cr.cash_register_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
  cashRegisterSession: `
    SELECT 1 FROM pos_schema.cash_register_session crs
    INNER JOIN pos_schema.cash_register cr
      ON cr.cash_register_id = crs.cash_register_id
    INNER JOIN general_schema.branch b ON b.branch_id = cr.branch_id
    WHERE crs.cash_register_session_id = $1 AND b.tenant_id = $2 LIMIT 1
  `,
} as const;

export type OwnedResource = keyof typeof OWNERSHIP_QUERIES;

const SUPERUSER_ROLE_NAME = 'superuser';

/**
 * Aislamiento por tenant a nivel de aplicacion ("RLS" del backend).
 *
 * Reglas:
 *  - El tenant sale SIEMPRE de la sesion, nunca de la URL, query o body.
 *  - Un recurso de otro tenant responde 404 (no 403) para no revelar que existe.
 *  - Solo el superusuario de plataforma puede operar fuera de su tenant, y solo
 *    en los endpoints que lo declaran de forma explicita.
 */
@Injectable()
export class TenantScopeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateService: StateService,
  ) {}

  isSuperuser(session: IUserSession): boolean {
    try {
      return (
        this.stateService.getRole(session.role_id).role_name ===
        SUPERUSER_ROLE_NAME
      );
    } catch {
      return false;
    }
  }

  /**
   * Tenant sobre el que se opera cuando el endpoint recibe un tenant "pedido"
   * (por compatibilidad con rutas /tenant/:tenantId). Un usuario normal solo
   * puede pedir el suyo; el superusuario puede pedir cualquiera.
   */
  resolveRequestedTenant(
    session: IUserSession,
    requestedTenantId?: string | null,
  ): string {
    if (!requestedTenantId || requestedTenantId === session.tenant_id) {
      return session.tenant_id;
    }
    if (this.isSuperuser(session)) return requestedTenantId;
    throw new NotFoundException('Recurso no encontrado');
  }

  /**
   * Tenant con el que se filtran las consultas por id de recurso: el de la
   * sesion, o null (sin filtro) para el superusuario de plataforma.
   */
  scopeFor(session: IUserSession): string | null {
    return this.isSuperuser(session) ? null : session.tenant_id;
  }

  /** 404 si el recurso no existe en el tenant de la sesion. */
  async assertOwns(
    resource: OwnedResource,
    id: string | number,
    session: IUserSession,
  ): Promise<void> {
    if (this.isSuperuser(session)) return;
    await this.assertOwnedByTenant(resource, id, session.tenant_id);
  }

  async assertOwnedByTenant(
    resource: OwnedResource,
    id: string | number,
    tenantId: string,
  ): Promise<void> {
    const { rows } = await this.db.query(OWNERSHIP_QUERIES[resource], [
      id,
      tenantId,
    ]);
    if (rows.length === 0) throw new NotFoundException('Recurso no encontrado');
  }
}
