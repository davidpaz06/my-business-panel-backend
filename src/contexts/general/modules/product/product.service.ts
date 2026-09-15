import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE } from '../db/db.provider';
import Database from '@crane-technologies/database';
import {
  bulkAttributeAssignations,
  bulkProducts,
  bulkProductVariantGroupAssignments,
  generalQueries,
} from '@general/general.queries';
import {
  // NewProductDto,
  ProductInsert,
  ProductInsertDto,
} from './dto/newProduct.dto';
import { UpdateProductDto } from './dto/updateProduct.dto';
import { Product } from './interface/product.interface';
import { isUUID } from 'class-validator';

const {
  products,
  attributeAssignation,
  tenantProductGroup,
  productVariantGroupAssignment,
} = generalQueries;

@Injectable()
export class ProductService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAllProducts(tenantId: string): Promise<Product[]> {
    const result = await this.db.query(products.getAll, [tenantId]);
    return result.rows;
  }

  async getAllProductsPaginated(
    tenantId: string,
    page = 1,
    limit = 100,
  ): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(products.getAllPaginated, [tenantId, limit, offset]),
      this.db.query(products.countByTenant, [tenantId]),
    ]);
    return {
      products: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getAllProductsGlobal(
    page = 1,
    limit = 100,
  ): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(products.getAllGlobal, [limit, offset]),
      this.db.query(products.countAll, []),
    ]);
    return {
      products: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getProductBySku(sku: string): Promise<Product> {
    const product = await this.db.query(products.getBySku, [sku]);
    return product.rows[0];
  }

  async searchProductsByTenant(
    tenantId: string,
    query: string,
    page = 1,
    limit = 50,
    groupIds?: string[],
    attributeValueIds?: string[],
    noSupplier?: boolean,
  ): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!isUUID(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }
    const offset = (page - 1) * limit;
    const term = (query ?? '').trim();
    const groups = groupIds && groupIds.length > 0 ? groupIds : null;
    const attrValues =
      attributeValueIds && attributeValueIds.length > 0
        ? attributeValueIds
        : null;
    const noSup = noSupplier === true ? true : null;

    const [dataResult, countResult] = await Promise.all([
      this.db.query(products.searchByTenantFiltered, [
        tenantId,
        term,
        limit,
        offset,
        groups,
        attrValues,
        noSup,
      ]),
      this.db.query(products.countSearchByTenantFiltered, [
        tenantId,
        term,
        groups,
        attrValues,
        noSup,
      ]),
    ]);
    return {
      products: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getProductById(productId: string, tenantId: string): Promise<Product> {
    if (!isUUID(productId)) {
      throw new BadRequestException('Invalid product ID format');
    }
    if (!isUUID(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }
    const product = await this.db.query(products.getById, [
      productId,
      tenantId,
    ]);
    return product.rows[0];
  }

  async getProductByIdWithAttributes(productId: string, tenantId: string) {
    if (!isUUID(productId) || !isUUID(tenantId)) {
      throw new BadRequestException('Invalid id format');
    }
    const result = await this.db.query(products.getByIdWithAttributes, [
      productId,
      tenantId,
    ]);
    return result.rows[0];
  }

  async createProduct(data: ProductInsertDto) {
    const { products: items } = data;

    if (!Array.isArray(items) || items.length === 0) {
      return { message: 'No products to create', product: [] };
    }

    const insertData = this.bulkInsertProducts(
      items as unknown as ProductInsert[],
    );

    const txn = await this.db.transaction();
    try {
      const newProducts = await txn.query(insertData.query, insertData.values);
      const created = newProducts.rows;

      // Attach EAV assignments and group assignments per item.
      // The DB-side ON CONFLICT may have skipped a row; we map by sku via a lookup.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const variantId = created[i]?.product_variant_id;
        if (!variantId) continue;

        if (item.attribute_value_ids?.length) {
          const owned = await txn.query(
            attributeAssignation.validateValuesOwnedByTenant,
            [item.tenant_id, item.attribute_value_ids],
          );
          if ((owned.rows[0]?.owned ?? 0) !== item.attribute_value_ids.length) {
            throw new BadRequestException(
              'One or more attribute_value_ids do not belong to this tenant',
            );
          }
          await txn.bulkInsert(
            'general_schema.attribute_assignation',
            bulkAttributeAssignations,
            item.attribute_value_ids.map((avid) => [
              item.tenant_id,
              variantId,
              avid,
            ]),
          );
        }

        if (item.group_ids?.length) {
          const owned = await txn.query(
            tenantProductGroup.validateGroupsOwnedByTenant,
            [item.tenant_id, item.group_ids],
          );
          if ((owned.rows[0]?.owned ?? 0) !== item.group_ids.length) {
            throw new BadRequestException(
              'One or more group_ids do not belong to this tenant',
            );
          }
          await txn.bulkInsert(
            'general_schema.product_variant_group_assignment',
            bulkProductVariantGroupAssignments,
            item.group_ids.map((gid) => [item.tenant_id, variantId, gid]),
          );
        }
      }

      await txn.commit();
      return {
        message: 'Products created successfully!',
        product: created,
      };
    } catch (error: any) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      if (
        error?.code === '23503' &&
        error?.constraint === 'product_variant_product_id_fkey'
      ) {
        throw new BadRequestException(
          `The product_id provided does not exist in the product catalog`,
        );
      }
      throw new InternalServerErrorException(error);
    }
  }

  bulkInsertProducts(products: ProductInsert[]): {
    query: string;
    values: any[];
  } {
    if (!Array.isArray(products) || products.length === 0)
      return { query: '', values: [] };

    const values: any[] = [];
    const placeholders: string[] = [];
    let index = 1;

    const tuples = bulkProducts.length;

    products.forEach((p) => {
      const rowPlaceholder = [];

      for (let i = 0; i < tuples; i++) {
        rowPlaceholder.push(`$${index++}`);
      }
      placeholders.push(`(${rowPlaceholder.join(', ')})`);

      bulkProducts.forEach((k) => {
        const valInsert = p[k as keyof ProductInsert];

        if (k === 'product_description') {
          values.push(
            valInsert === undefined ? 'No existe descripcion' : valInsert,
          );
        } else if (k === 'cost_price') {
          values.push(
            valInsert === undefined || valInsert === null ? 0 : valInsert,
          );
        } else {
          values.push(valInsert === undefined ? null : valInsert);
        }
      });
    });

    const query = `
        INSERT INTO general_schema.product_variant (${bulkProducts.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (tenant_id, sku) DO NOTHING
        RETURNING product_variant_id
      `;

    return { query, values };
  }

  async updateProduct(data: UpdateProductDto, productId: string) {
    const { attribute_value_ids, group_ids, ...updates } = data;

    const updateKeys = Object.keys(updates).filter(
      (key) => updates[key as keyof typeof updates] !== undefined,
    );

    const hasAttributeUpdate = attribute_value_ids !== undefined;
    const hasGroupUpdate = group_ids !== undefined;

    if (updateKeys.length === 0 && !hasAttributeUpdate && !hasGroupUpdate) {
      throw new BadRequestException('No valid fields to update');
    }

    const txn = await this.db.transaction();
    try {
      let updatedRow: any = null;

      if (updateKeys.length > 0) {
        const setClause: string[] = [];
        const paramsArray: any[] = [];
        let index = 1;
        for (const key of updateKeys) {
          const validKey = key as keyof typeof updates;
          setClause.push(`"${key}" = $${index}`);
          const value = updates[validKey];
          paramsArray.push(value);
          index++;
        }
        paramsArray.push(productId);
        const queryString = `
          UPDATE general_schema.product_variant
          SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE product_variant_id = $${index}
          RETURNING *
        `;
        const res = await txn.query(queryString, paramsArray);
        updatedRow = res.rows[0];
      } else {
        const res = await txn.query(
          'SELECT * FROM general_schema.product_variant WHERE product_variant_id = $1 LIMIT 1',
          [productId],
        );
        updatedRow = res.rows[0];
      }

      if (!updatedRow) {
        throw new BadRequestException('Product variant not found');
      }
      const tenantId = updatedRow.tenant_id;

      if (hasAttributeUpdate) {
        await txn.query(attributeAssignation.deleteForVariant, [
          tenantId,
          productId,
        ]);
        if (attribute_value_ids && attribute_value_ids.length > 0) {
          const owned = await txn.query(
            attributeAssignation.validateValuesOwnedByTenant,
            [tenantId, attribute_value_ids],
          );
          if ((owned.rows[0]?.owned ?? 0) !== attribute_value_ids.length) {
            throw new BadRequestException(
              'One or more attribute_value_ids do not belong to this tenant',
            );
          }
          await txn.bulkInsert(
            'general_schema.attribute_assignation',
            bulkAttributeAssignations,
            attribute_value_ids.map((avid) => [tenantId, productId, avid]),
          );
        }
      }

      if (hasGroupUpdate) {
        await txn.query(productVariantGroupAssignment.deleteForVariant, [
          tenantId,
          productId,
        ]);
        if (group_ids && group_ids.length > 0) {
          const owned = await txn.query(
            tenantProductGroup.validateGroupsOwnedByTenant,
            [tenantId, group_ids],
          );
          if ((owned.rows[0]?.owned ?? 0) !== group_ids.length) {
            throw new BadRequestException(
              'One or more group_ids do not belong to this tenant',
            );
          }
          await txn.bulkInsert(
            'general_schema.product_variant_group_assignment',
            bulkProductVariantGroupAssignments,
            group_ids.map((gid) => [tenantId, productId, gid]),
          );
        }
      }

      await txn.commit();
      return { message: 'Product updated successfully!', product: updatedRow };
    } catch (error) {
      await txn.rollback();
      if (error instanceof BadRequestException) throw error;
      console.error('Error updating product:', error);
      throw new InternalServerErrorException(error);
    }
  }

  async deleteProduct(productId: string) {
    await this.db.query(products.delete, [productId]);
    return { message: `Product with id ${productId} deleted` };
  }
}
