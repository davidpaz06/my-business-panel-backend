import { Inject, Injectable } from '@nestjs/common';
import Database from '@resonance-components/datahandler';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { generalQueries } from '@general/general.queries';

const { currency } = generalQueries;

@Injectable()
export class CurrencyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAll() {
    const result = await this.db.query(currency.all);
    return result.rows;
  }

  async getById(id: number) {
    const result = await this.db.query(currency.byId, [id]);
    return result.rows[0] ?? null;
  }
}
