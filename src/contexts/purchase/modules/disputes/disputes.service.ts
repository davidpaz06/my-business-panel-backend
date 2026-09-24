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
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

const { disputes } = purchaseQueries;
const SUPERUSER_HIERARCHY = 1;

@Injectable()
export class DisputesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateService: StateService,
  ) {}

  async create(dto: CreateDisputeDto, session: IUserSession) {
    const accessResult = await this.db.query(
      disputes.getOrderAccessForDispute,
      [dto.purchase_order_id],
    );
    const access = accessResult.rows[0] as
      | { purchase_order_id: string; tenant_id: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Orden de compra no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(disputes.create, [
      dto.purchase_order_id,
      dto.supplier_invoice_id ?? null,
      access.tenant_id,
      dto.dispute_type,
      dto.description,
    ]);

    return result.rows[0];
  }

  async listByOrder(purchaseOrderId: string, session: IUserSession) {
    const accessResult = await this.db.query(
      disputes.getOrderAccessForDispute,
      [purchaseOrderId],
    );
    const access = accessResult.rows[0] as
      | { purchase_order_id: string; tenant_id: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Orden de compra no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(disputes.listByOrder, [purchaseOrderId]);
    return result.rows;
  }

  async resolve(
    disputeId: string,
    dto: ResolveDisputeDto,
    session: IUserSession,
  ) {
    const accessResult = await this.db.query(disputes.getAccessById, [
      disputeId,
    ]);
    const access = accessResult.rows[0] as
      | { dispute_id: string; tenant_id: string; status: string }
      | undefined;

    if (!access) {
      throw new NotFoundException('Discrepancia no encontrada');
    }

    this.assertTenantAccess(access.tenant_id, session);

    const result = await this.db.query(disputes.resolve, [
      dto.resolution_notes,
      disputeId,
    ]);

    return result.rows[0];
  }

  private assertTenantAccess(resourceTenantId: string, session: IUserSession) {
    if (this.isSuperuser(session.role_id)) {
      return;
    }

    if (resourceTenantId !== session.tenant_id) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso',
      );
    }
  }

  private isSuperuser(roleId: number) {
    return (
      this.stateService.getRole(roleId).role_hierarchy === SUPERUSER_HIERARCHY
    );
  }
}
