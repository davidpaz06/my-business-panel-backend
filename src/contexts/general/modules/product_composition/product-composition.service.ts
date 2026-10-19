import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import {
  bulkProductVariantCompositions,
  generalQueries,
} from '@general/general.queries';
import {
  ReplaceCompositionDto,
  UpdateComponentQuantityDto,
} from './dto/product-composition.dto';

const { productComposition, products } = generalQueries;

@Injectable()
export class ProductCompositionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getByParent(tenantId: string, parentId: string) {
    const result = await this.db.query(productComposition.byParent, [
      tenantId,
      parentId,
    ]);
    return result.rows;
  }

  async getByChild(tenantId: string, childId: string) {
    const result = await this.db.query(productComposition.byChild, [
      tenantId,
      childId,
    ]);
    return result.rows;
  }

  async replace(data: ReplaceCompositionDto) {
    if (!data.components || data.components.length === 0) {
      throw new BadRequestException('At least one component is required');
    }

    // Self-reference check
    for (const c of data.components) {
      if (c.child_product_variant_id === data.parent_product_variant_id) {
        throw new BadRequestException(
          'A composition component cannot be the same as its parent',
        );
      }
    }

    const txn = await this.db.transaction();
    try {
      // Cycle prevention: for each component C, ensure the parent P is not a
      // descendant of C (which would make P -> C -> ... -> P).
      for (const c of data.components) {
        const desc = await txn.query(productComposition.descendants, [
          data.tenant_id,
          c.child_product_variant_id,
        ]);
        const ids = desc.rows.map((r) => r.node);
        if (ids.includes(data.parent_product_variant_id)) {
          throw new BadRequestException(
            'Cycle detected: parent appears as a descendant of one of its components',
          );
        }
      }

      // Replace existing components
      await txn.query(productComposition.deleteAllForParent, [
        data.tenant_id,
        data.parent_product_variant_id,
      ]);

      await txn.bulkInsert(
        'general_schema.product_variant_composition',
        bulkProductVariantCompositions,
        data.components.map((c) => [
          data.tenant_id,
          data.parent_product_variant_id,
          c.child_product_variant_id,
          c.quantity,
        ]),
      );

      // Mark parent as composite
      await txn.query(products.setComposite, [
        data.tenant_id,
        data.parent_product_variant_id,
        true,
      ]);

      await txn.commit();
      return {
        message: 'Composition replaced',
        count: data.components.length,
      };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async updateQuantity(
    tenantId: string,
    parentId: string,
    childId: string,
    data: UpdateComponentQuantityDto,
  ) {
    const result = await this.db.query(productComposition.updateQuantity, [
      tenantId,
      parentId,
      childId,
      data.quantity,
    ]);
    return result.rows[0];
  }

  async deleteAllForParent(tenantId: string, parentId: string) {
    const txn = await this.db.transaction();
    try {
      await txn.query(productComposition.deleteAllForParent, [
        tenantId,
        parentId,
      ]);
      await txn.query(products.setComposite, [tenantId, parentId, false]);
      await txn.commit();
      return { message: 'Composition cleared' };
    } catch (error) {
      await txn.rollback();
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Returns the virtual stock of a composite variant in a warehouse:
   * the floor of (child_stock / quantity_per_parent) across all components.
   * Recursively expands children that are themselves composite.
   */
  async getAvailability(
    tenantId: string,
    parentId: string,
    warehouseId: string,
  ): Promise<number> {
    return this.computeAvailability(tenantId, parentId, warehouseId);
  }

  private async computeAvailability(
    tenantId: string,
    parentId: string,
    warehouseId: string,
  ): Promise<number> {
    const meta = await this.db.query(
      `SELECT is_composite FROM general_schema.product_variant
       WHERE tenant_id = $1 AND product_variant_id = $2 LIMIT 1`,
      [tenantId, parentId],
    );
    const isComposite = meta.rows[0]?.is_composite === true;

    if (!isComposite) {
      // Leaf: read its own stock in this warehouse
      const stockRes = await this.db.query(
        `SELECT COALESCE(stock, 0)::numeric AS stock
         FROM inventory_schema.inventory
         WHERE tenant_id = $1 AND product_variant_id = $2 AND warehouse_id = $3
         LIMIT 1`,
        [tenantId, parentId, warehouseId],
      );
      return Number(stockRes.rows[0]?.stock ?? 0);
    }

    const components = await this.db.query(productComposition.byParent, [
      tenantId,
      parentId,
    ]);
    if (components.rows.length === 0) return 0;

    let bottleneck = Number.POSITIVE_INFINITY;
    for (const c of components.rows) {
      const childAvail = await this.computeAvailability(
        tenantId,
        c.child_product_variant_id,
        warehouseId,
      );
      const possible = Math.floor(childAvail / Number(c.quantity));
      if (possible < bottleneck) bottleneck = possible;
    }
    return bottleneck === Number.POSITIVE_INFINITY ? 0 : bottleneck;
  }
}
