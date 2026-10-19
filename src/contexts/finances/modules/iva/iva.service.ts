import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { ivaQueries } from './iva.queries';
import type {
  IvaSummaryResponse,
  IvaSummaryRowFromDb,
} from './interface/iva.interface';

@Injectable()
export class IvaService {
  private readonly logger = new Logger(IvaService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getSummary(
    tenantId: string,
    start: string,
    end: string,
  ): Promise<IvaSummaryResponse> {
    const { rows } = await this.db.query<IvaSummaryRowFromDb>(
      ivaQueries.getSummary,
      [tenantId, start, end],
    );

    return {
      components: rows.map((row) => ({
        component: row.component,
        total_usd: Number(row.total_usd),
        total_ves: Number(row.total_ves),
      })),
    };
  }
}
