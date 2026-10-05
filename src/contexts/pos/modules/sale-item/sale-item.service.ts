import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { FullItem, Item, ItemFromDb } from './interface/sale-item.interface';
import { bulkItems, posQueries } from '@pos/pos.queries';

const { saleItems } = posQueries;

@Injectable()
export class SaleItemService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // scopeTenantId: tenant de la sesion; null solo para el superusuario de
  // plataforma. Una linea de otro tenant responde como si no existiera.
  async getAllItems(
    sale_id: string,
    scopeTenantId: string | null,
  ): Promise<ItemFromDb[]> {
    const items = await this.db.query(saleItems.getItems, [
      sale_id,
      scopeTenantId,
    ]);
    return items.rows;
  }

  async getItemById(
    id: string,
    scopeTenantId: string | null,
  ): Promise<FullItem> {
    const item = await this.db.query(saleItems.getItemById, [
      id,
      scopeTenantId,
    ]);
    if (item.rows.length === 0) throw new NotFoundException('Item not found');
    return item.rows[0];
  }

  async deleteItem(id: string, scopeTenantId: string | null) {
    const deleted = await this.db.query(saleItems.delete, [id, scopeTenantId]);
    if (deleted.rows.length === 0)
      throw new NotFoundException('Item not found');
    return { message: `Deleted item with id ${id}` };
  }

  async bulkInsert(items: Item[], saleId: string) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const val: any[] = [];
    const placeholders: string[] = [];
    let i = 1;

    const tuples = bulkItems.length;

    items.forEach((item) => {
      const rowPlaceholder = [];

      for (let a = 0; a < tuples; a++) {
        rowPlaceholder.push(`$${i++}`);
      }

      placeholders.push(`(${rowPlaceholder.join(',')})`);

      bulkItems.forEach((key) => {
        if (key === 'sale_id') {
          val.push(saleId);
        } else {
          val.push(item[key as keyof Item]);
        }
      });
    });

    const q = `
      INSERT INTO pos_schema.sale_item (sale_id, tenant_id, product_id, quantity, unit_price, total_price)
      VALUES ${placeholders.join(',')}
    `;

    await this.db.query(q, val);
    return { message: `Inserted ${items.length} items for sale ${saleId}` };
  }
}
