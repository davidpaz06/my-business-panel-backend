import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';

const { region } = generalQueries;

@Injectable()
export class RegionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAllRegions() {
    const { rows } = await this.db.query(region.all);
    return rows;
  }
}
