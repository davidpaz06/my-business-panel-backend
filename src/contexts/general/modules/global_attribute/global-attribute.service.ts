import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';

const { globalAttribute } = generalQueries;

@Injectable()
export class GlobalAttributeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAll() {
    const result = await this.db.query(globalAttribute.all);
    return result.rows;
  }

  async getById(id: string) {
    const result = await this.db.query(globalAttribute.byId, [id]);
    return result.rows[0];
  }
}
