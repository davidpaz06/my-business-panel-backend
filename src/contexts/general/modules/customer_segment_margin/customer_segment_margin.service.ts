import Database from '@resonance-components/datahandler';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../db/db.provider';
import { NewMarginDto } from './dto/newMargin.dto';
import { generalQueries } from '@general/general.queries';
import { UpdateMarginDto } from './dto/updateMargin.dto';
import { CustomerSegmentMargin } from './interface/customer_segment_margin.interface';
import { UpdateMarginError } from '@/common/errors/update_margin.error';

const { customerSegmentMargin } = generalQueries;

@Injectable()
export class CustomerSegmentMarginService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createMargins(marginData: NewMarginDto) {
    const {
      tenant_id,
      customer_segment_id,
      customer_segment_margin_type,
      spending_threshold,
      seniority_months,
      frequency_per_month,
    } = marginData;
    await this.db.query(customerSegmentMargin.create, [
      tenant_id,
      customer_segment_id,
      customer_segment_margin_type,
      spending_threshold,
      seniority_months,
      frequency_per_month,
    ]);

    return { message: 'Margin created.' };
  }

  async updateMargins(id: string, newMarginData: UpdateMarginDto) {
    const { ...newMargins } = newMarginData;
    const updatedMarginKeys = Object.keys(newMargins).filter(
      (key) => newMargins[key as keyof typeof newMargins] !== undefined,
    );

    if (updatedMarginKeys.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause: string[] = [];
    const paramsArray: any[] = [];
    let index = 1;

    for (const key of updatedMarginKeys) {
      const validKey = key as keyof typeof newMargins;
      setClause.push(`${key} = $${index}`);
      paramsArray.push(newMargins[validKey]);
      index++;
    }

    paramsArray.push(id);

    const setString = setClause.join(', ');

    const qString = `
      UPDATE general_schema.customer_segment_margin
      SET ${setString}
      WHERE customer_segment_margin_id = $${index}
    `;
    try {
      await this.db.query(qString, paramsArray);
      return { message: `Margin with id ${id} updated` };
    } catch (error) {
      throw new UpdateMarginError();
    }
  }

  /**
   * @returns: CustomerSegmentMargin[]
   */
  async getMarginInfo(): Promise<CustomerSegmentMargin[]> {
    const marginInfo = await this.db.query(customerSegmentMargin.all);
    return marginInfo.rows;
  }

  async getTenantMarginsInfo(
    tenantId: string,
  ): Promise<CustomerSegmentMargin[]> {
    const info = await this.db.query(customerSegmentMargin.getInfo, [tenantId]);
    return info.rows;
  }

  async deleteMargin(id: string) {
    await this.db.query(customerSegmentMargin.delete, [id]);
    return { message: `Margin with id: ${id} deleted.` };
  }
}
