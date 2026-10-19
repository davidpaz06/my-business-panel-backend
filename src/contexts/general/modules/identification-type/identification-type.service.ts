import { Inject, Injectable } from '@nestjs/common';
import { IdentificationType } from './interface/identification-type.interface';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { generalQueries } from '@general/general.queries';

const { identificationType } = generalQueries;

@Injectable()
export class IdentificationTypeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  //Delete this when the database is implemented

  async getAll(): Promise<IdentificationType[]> {
    const { rows } = await this.db.query(identificationType.all);
    return rows;
  }

  /**
   * Gets a document type by its ID
   * @param id: string
   * @returns: IdentificationType | undefined
   */
  async getById(id: string): Promise<IdentificationType> {
    const { rows } = await this.db.query(identificationType.byId, [id]);
    return rows[0];
  }

  async delete(id: string) {
    const { rows } = await this.db.query(identificationType.delete, [id]);
    return {
      message: `Document type with ID ${rows[0].document_type_id} deleted successfully`,
    };
  }
}
