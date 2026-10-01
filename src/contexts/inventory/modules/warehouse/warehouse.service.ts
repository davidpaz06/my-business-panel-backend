import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Database from '@crane-technologies/database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { Warehouse } from './interfaces/warehouse.interface';
import { CreateWarehouseDto } from './dto/create_warehouse.dto';
import { UpdateWarehouseDto } from './dto/update_warehouse.dto';
import { BulkInsertInventoryDto } from './dto/bulk_insert_inventory.dto';
import { ProductService } from '@/contexts/general/modules/product/product.service';
import { explodeForInventory } from '@/contexts/general/modules/product_composition/helpers/explode';
import { ProductCount } from './interfaces/product_count.interface';
import { InventoryItem } from './interfaces/inventory_item.interface';
import { InventoryTransferSummary } from './interfaces/inventory_transfer_summary.interface';
// import { InvalidTenantError } from '@/common/errors/invalid_tenant.error';
import { InventoryTransferProduct } from './interfaces/inventory_transfer_product.interface';
import { InventoryTransfer } from './interfaces/inventory_transfer.interface';
import { inventoryQueries } from '../../inventory.queries';
import { generalQueries } from '@/contexts/general/general.queries';
import { StateService } from '@/contexts/general/modules/state/state.service';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly state: StateService,
    private readonly products: ProductService,
  ) {}

  async createWarehouse(
    createWarehouseDto: CreateWarehouseDto,
    tenant_id: string,
  ): Promise<Warehouse> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const result = await this.db.query(inventoryQueries.branchByIdAndTenant, [
      createWarehouseDto.branch_id,
      tenant_id,
    ]);
    if (result.rowCount === 0)
      throw new NotFoundException(
        `Branch with ID ${createWarehouseDto.branch_id} not found for Tenant with ID ${tenant_id}`,
      );

    // Always create as auxiliary bodega â€” the sales-floor warehouse is
    // provisioned automatically by inventory_schema.fn_branch_create_warehouse
    // when a branch is inserted. We never let the API client pass is_branch.
    const { rows } = await this.db.query(inventoryQueries.create, [
      createWarehouseDto.branch_id,
      createWarehouseDto.warehouse_name,
      createWarehouseDto.warehouse_address,
      false,
    ]);

    return rows[0] ?? new NotFoundException('Warehouse could not be created');
  }

  async updateWarehouse(
    warehouse_id: string,
    tenant_id: string,
    updateWarehouseDto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    // Pin is_branch to its current value so the type of warehouse can never
    // be toggled through this endpoint.
    const { rows } = await this.db.query(inventoryQueries.update, [
      warehouse_id,
      updateWarehouseDto.warehouse_name ?? null,
      updateWarehouseDto.warehouse_address ?? null,
      null,
    ]);
    return rows[0];
  }

  async deleteWarehouse(
    warehouse_id: string,
    tenant_id: string,
  ): Promise<{ message: string }> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    if (warehouse.rows[0]?.is_branch) {
      throw new BadRequestException(
        'No se puede eliminar el piso de venta de una sucursal. ' +
          'Elimina la sucursal asociada para retirar este almacén.',
      );
    }

    await this.db.query(inventoryQueries.delete, [warehouse_id]);
    return { message: 'Warehouse deleted successfully' };
  }

  async listInventoryByWarehouse(
    warehouse_id: string,
    tenant_id: string,
    search?: string,
    group_id?: string,
    include_catalog?: boolean,
  ): Promise<InventoryItem[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    const { rows } = await this.db.query(
      inventoryQueries.listInventoryByWarehouse,
      [
        warehouse_id,
        tenant_id,
        search ?? null,
        group_id ?? null,
        include_catalog ?? false,
      ],
    );
    return rows as InventoryItem[];
  }

  async listInventoryAggregated(
    warehouse_id: string,
    tenant_id: string,
    search?: string,
  ): Promise<InventoryItem[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    const { rows } = await this.db.query(
      inventoryQueries.listInventoryByWarehouseAggregated,
      [warehouse_id, tenant_id, search ?? null],
    );
    return rows as InventoryItem[];
  }

  async updateInventoryItem(
    inventory_id: string,
    tenant_id: string,
    stock?: number,
    expiration_date?: string | null,
  ): Promise<InventoryItem> {
    const { rows } = await this.db.query(inventoryQueries.updateInventoryItem, [
      inventory_id,
      stock ?? null,
      expiration_date ?? null,
      tenant_id,
    ]);
    if (rows.length === 0)
      throw new NotFoundException(
        `Inventory item ${inventory_id} not found for tenant ${tenant_id}`,
      );
    return rows[0] as InventoryItem;
  }

  async deleteInventoryItem(
    inventory_id: string,
    tenant_id: string,
  ): Promise<{ message: string }> {
    await this.db.query(inventoryQueries.deleteInventoryItem, [
      inventory_id,
      tenant_id,
    ]);
    return { message: 'Inventory item deleted successfully' };
  }

  async bulkInsertInventory(
    tenant_id: string,
    dto: BulkInsertInventoryDto,
  ): Promise<{ inserted: number }> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      dto.warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${dto.warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    if (dto.items.length === 0)
      throw new BadRequestException('items must contain at least one entry');

    const payload = dto.items.map((it) => ({
      product_variant_id: it.product_variant_id,
      stock: it.stock,
      expiration_date: it.expiration_date ?? null,
    }));

    const txn = await this.db.transaction();
    let committed = false;
    try {
      const { rowCount } = await txn.query(
        inventoryQueries.bulkInsertInventory,
        [tenant_id, dto.warehouse_id, JSON.stringify(payload)],
      );

      for (const item of dto.items) {
        await txn.query(inventoryQueries.logInventoryMovement, [
          1,
          dto.warehouse_id,
          tenant_id,
          item.product_variant_id,
          item.stock,
        ]);
      }

      await txn.commit();
      committed = true;
      return { inserted: rowCount ?? 0 };
    } catch (error) {
      if (!committed) {
        try {
          await txn.rollback();
        } catch (rollbackError) {
          console.error(
            '[WarehouseService.bulkInsertInventory] Rollback failed:',
            rollbackError,
          );
        }
      }
      throw error;
    }
  }

  async addProductToWarehouse(
    warehouse_id: string,
    product_id: string,
    tenant_id: string,
    amount: number,
    expiration_date?: string,
  ) {
    if (amount <= 0)
      throw new NotFoundException('Amount must be greater than zero');

    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);

    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found`,
      );

    const product = await this.products.getProductById(product_id, tenant_id);
    if (!product)
      throw new NotFoundException(`Product with ID ${product_id} not found`);

    await this.db.query(inventoryQueries.insertIntoInventory, [
      tenant_id,
      warehouse_id,
      product_id,
      amount,
      expiration_date,
    ]);
    return { message: 'Product added to warehouse successfully' };
  }

  async addStockToProduct(
    warehouse_id: string,
    product_id: string,
    tenant_id: string,
    amount: number,
    costInfo?: {
      purchaseOrderId: string;
      unitCost: number;
      currencyId?: number;
      exchangeRate?: number;
    },
  ): Promise<void> {
    if (amount <= 0) {
      throw new NotFoundException('Amount must be greater than zero');
    }
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
    }

    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);
    if (warehouse.rowCount === 0) {
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found`,
      );
    }

    const product = await this.products.getProductById(product_id, tenant_id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    await this.db.query(inventoryQueries.addStock, [
      amount,
      warehouse_id,
      product_id,
      tenant_id,
    ]);
  }

  async removeStockFromProduct(
    warehouse_id: string,
    product_id: string,
    tenant_id: string,
    amount: number,
  ): Promise<void> {
    if (amount <= 0) {
      throw new NotFoundException('Amount must be greater than zero');
    }
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
    }

    await this.db.query(inventoryQueries.removeStock, [
      amount,
      warehouse_id,
      product_id,
      tenant_id,
    ]);
  }

  async getWarehousesByTenant(tenant_id: string): Promise<Warehouse[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const { rows } = await this.db.query(inventoryQueries.byTenant, [
      tenant_id,
    ]);
    return rows;
  }

  async getWarehousesByBranch(
    branch_id: string,
    tenant_id: string,
  ): Promise<Warehouse[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const result = await this.db.query(inventoryQueries.branchByIdAndTenant, [
      branch_id,
      tenant_id,
    ]);
    if (result.rowCount === 0)
      throw new NotFoundException(
        `Branch with ID ${branch_id} not found for Tenant with ID ${tenant_id}`,
      );

    const { rows } = await this.db.query(inventoryQueries.byBranch, [
      branch_id,
      tenant_id,
    ]);
    return rows;
  }

  async countAllInWarehouse(
    warehouse_id: string,
    tenant_id: string,
  ): Promise<ProductCount[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found`,
      );

    const { rows } = await this.db.query(inventoryQueries.countAllInWarehouse, [
      warehouse_id,
      tenant_id,
    ]);
    return rows;
  }

  async getStockByWarehouse(
    warehouse_id: string,
    tenant_id: string,
  ): Promise<ProductCount[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byTenantAndId, [
      warehouse_id,
      tenant_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found for Tenant with ID ${tenant_id}`,
      );

    const { rows } = await this.db.query(inventoryQueries.countAllInWarehouse, [
      warehouse_id,
      tenant_id,
    ]);
    return rows;
  }

  async createDiscrepancyReport(
    tenant_id: string,
    product_id: string,
    warehouse_id: string,
    stored_quantity: number,
    physical_cuantity: number,
    discrepancy_reason: string,
  ): Promise<void> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found`,
      );

    const product = await this.products.getProductById(product_id, tenant_id);
    if (!product)
      throw new NotFoundException(`Product with ID ${product_id} not found`);

    await this.db.query(inventoryQueries.createDiscrepancyReport, [
      tenant_id,
      product_id,
      warehouse_id,
      stored_quantity,
      physical_cuantity,
      discrepancy_reason,
    ]);
  }

  async getDiscrepancyReports(
    tenant_id: string,
    warehouse_id: string,
  ): Promise<any[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);
    if (warehouse.rowCount === 0)
      throw new NotFoundException(
        `Warehouse with ID ${warehouse_id} not found`,
      );

    const { rows } = await this.db.query(
      inventoryQueries.getAllDiscrepancyReports,
      [warehouse_id, tenant_id],
    );
    return rows;
  }

  async getDiscrepancyReportById(
    tenant_id: string,
    discrepancy_count_id: string,
  ) {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const { rows } = await this.db.query(
      inventoryQueries.getDiscrepancyReportById,
      [tenant_id, discrepancy_count_id],
    );
    if (rows.length === 0)
      throw new NotFoundException(
        `Discrepancy Report with ID ${discrepancy_count_id} not found`,
      );

    return rows[0];
  }

  async receiveStockFromPurchase(
    warehouse_id: string,
    product_variant_id: string,
    tenant_id: string,
    quantity: number,
    costInfo?: {
      purchaseOrderId: string;
      unitCost: number;
      currencyId?: number;
      exchangeRate?: number;
    },
  ): Promise<void> {
    const warehouse = await this.db.query(inventoryQueries.byId, [
      warehouse_id,
    ]);
    const isBranch = warehouse.rows[0]?.is_branch === true;

    // Composite parents are virtual: explode into child components and apply
    // reception per-child, dividing unit cost proportionally to the ratio.
    const meta = await this.db.query(inventoryQueries.checkIsComposite, [
      tenant_id,
      product_variant_id,
    ]);
    if (meta.rows[0]?.is_composite === true && isBranch) {
      const components = await this.db.query(inventoryQueries.getComponents, [
        product_variant_id,
        tenant_id,
      ]);
      for (const c of components.rows) {
        const ratio = Number(c.quantity);
        const childQty = quantity * ratio;
        const childCost = costInfo
          ? {
              ...costInfo,
              unitCost: ratio > 0 ? costInfo.unitCost / ratio : 0,
            }
          : undefined;
        await this.receiveStockFromPurchase(
          warehouse_id,
          c.child_product_variant_id,
          tenant_id,
          childQty,
          childCost,
        );
      }
      return;
    }

    // Update product cost BEFORE adding stock (weighted avg needs current stock level)
    if (costInfo && costInfo.unitCost > 0) {
      await this.db.query(inventoryQueries.updateProductCost, [
        tenant_id,
        product_variant_id,
        costInfo.purchaseOrderId,
        quantity,
        costInfo.unitCost,
        costInfo.currencyId ?? null,
        costInfo.exchangeRate ?? null,
      ]);
    }

    const updateResult = await this.db.query(inventoryQueries.addStock, [
      quantity,
      warehouse_id,
      product_variant_id,
      tenant_id,
    ]);

    if (updateResult.rowCount === 0) {
      await this.db.query(inventoryQueries.insertIntoInventory, [
        tenant_id,
        warehouse_id,
        product_variant_id,
        quantity,
        null,
      ]);
    }

    await this.db.query(inventoryQueries.logInventoryMovement, [
      1, // IN
      warehouse_id,
      tenant_id,
      product_variant_id,
      quantity,
    ]);
  }

  /**
   * Decrements stock for sale items. Composite items are exploded recursively
   * to their leaf children before consuming. Throws if any leaf would go below
   * zero so the surrounding transaction can rollback.
   */
  async consumeStockForSale(
    tenantId: string,
    warehouseId: string,
    items: Array<{ product_variant_id: string; quantity: number }>,
    txn: {
      query: (
        text: string,
        params?: any[],
      ) => Promise<{ rows: any[]; rowCount?: number | null }>;
    },
  ): Promise<void> {
    for (const item of items) {
      // 1. Try to consume the item directly (requested variant, could be composite or simple)
      const directStockRes = await txn.query(inventoryQueries.getStock, [
        tenantId,
        item.product_variant_id,
        warehouseId,
      ]);
      const directAvailable = Number(directStockRes.rows[0]?.stock ?? 0);
      let quantityToProcess = Number(item.quantity);

      if (directAvailable > 0) {
        const toConsumeDirectly = Math.min(directAvailable, quantityToProcess);
        await txn.query(inventoryQueries.removeStock, [
          toConsumeDirectly,
          warehouseId,
          item.product_variant_id,
          tenantId,
        ]);
        await txn.query(inventoryQueries.logInventoryMovement, [
          2, // OUT
          warehouseId,
          tenantId,
          item.product_variant_id,
          toConsumeDirectly,
        ]);
        quantityToProcess -= toConsumeDirectly;
      }

      if (quantityToProcess <= 0) continue;

      // 2. If shortfall remains, explode it (if composite) and consume leaves
      const leaves = await explodeForInventory(
        txn,
        tenantId,
        item.product_variant_id,
        quantityToProcess,
      );
      for (const leaf of leaves) {
        let stockRes = await txn.query(inventoryQueries.getStock, [
          tenantId,
          leaf.product_variant_id,
          warehouseId,
        ]);
        let current = Number(stockRes.rows[0]?.stock ?? 0);

        // If insufficient, attempt automatic disaggregation from parent composites
        if (current < leaf.quantity) {
          // Find candidate parents that include this child
          const { rows: parents } = await txn.query(
            generalQueries.productComposition.byChild,
            [tenantId, leaf.product_variant_id],
          );

          // Try parents with available stock until shortfall is covered or no parents left
          let shortfall = leaf.quantity - current;
          for (const p of parents) {
            if (shortfall <= 0) break;
            const parentId = p.parent_product_variant_id;
            const parentStockRes = await txn.query(inventoryQueries.getStock, [
              tenantId,
              parentId,
              warehouseId,
            ]);
            let parentStock = Number(parentStockRes.rows[0]?.stock ?? 0);
            while (parentStock > 0 && shortfall > 0) {
              // Disaggregate one unit of parent into its components
              const { rows: components } = await txn.query(
                inventoryQueries.getComponents,
                [parentId, tenantId],
              );
              if (components.length === 0) break;

              // Remove one parent
              const { rows: removed } = await txn.query(
                inventoryQueries.removeStock,
                [1, warehouseId, parentId, tenantId],
              );
              if (!removed || removed.length === 0) break;
              await txn.query(inventoryQueries.logInventoryMovement, [
                2,
                warehouseId,
                tenantId,
                parentId,
                1,
              ]);

              // Add children quantities
              for (const comp of components) {
                const addedQty = Number(comp.quantity) * 1;
                const { rows: existing } = await txn.query(
                  inventoryQueries.getInventoryId,
                  [warehouseId, comp.child_product_variant_id, tenantId],
                );
                if (existing.length > 0) {
                  await txn.query(inventoryQueries.addStock, [
                    addedQty,
                    warehouseId,
                    comp.child_product_variant_id,
                    tenantId,
                  ]);
                } else {
                  await txn.query(inventoryQueries.insertIntoInventory, [
                    tenantId,
                    warehouseId,
                    comp.child_product_variant_id,
                    addedQty,
                    null,
                  ]);
                }
                await txn.query(inventoryQueries.logInventoryMovement, [
                  1,
                  warehouseId,
                  tenantId,
                  comp.child_product_variant_id,
                  addedQty,
                ]);
              }

              // Update counters
              parentStock -= 1;

              // Refresh current for the leaf
              stockRes = await txn.query(inventoryQueries.getStock, [
                tenantId,
                leaf.product_variant_id,
                warehouseId,
              ]);
              current = Number(stockRes.rows[0]?.stock ?? 0);
              shortfall = leaf.quantity - current;
            }
          }
        }

        // Final check
        stockRes = await txn.query(inventoryQueries.getStock, [
          tenantId,
          leaf.product_variant_id,
          warehouseId,
        ]);
        current = Number(stockRes.rows[0]?.stock ?? 0);
        if (current < leaf.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para variante ${leaf.product_variant_id}: disponible ${current}, requerido ${leaf.quantity}`,
          );
        }

        await txn.query(inventoryQueries.removeStock, [
          leaf.quantity,
          warehouseId,
          leaf.product_variant_id,
          tenantId,
        ]);
        await txn.query(inventoryQueries.logInventoryMovement, [
          2, // OUT
          warehouseId,
          tenantId,
          leaf.product_variant_id,
          leaf.quantity,
        ]);
      }
    }
  }

  async listTransfersByTenant(
    tenant_id: string,
  ): Promise<InventoryTransferSummary[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const { rows } = await this.db.query(
      inventoryQueries.getInventoryTransfersByTenant,
      [tenant_id],
    );
    return rows as InventoryTransferSummary[];
  }

  async moveProductToWarehouse(
    origin_warehouse_id: string,
    destination_warehouse_id: string,
    tenant_id: string,
    products: InventoryTransferProduct[],
    departure_date?: string | null,
    arrival_date?: string | null,
  ) {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    if (origin_warehouse_id === destination_warehouse_id)
      throw new BadRequestException(
        'Origin and destination warehouses must be different',
      );

    if (!products || products.length === 0)
      throw new BadRequestException(
        'At least one product is required to transfer',
      );

    const origin = await this.db.query(inventoryQueries.byTenantAndId, [
      origin_warehouse_id,
      tenant_id,
    ]);
    if (origin.rowCount === 0)
      throw new NotFoundException(
        `Origin warehouse ${origin_warehouse_id} not found for tenant ${tenant_id}`,
      );

    const destination = await this.db.query(inventoryQueries.byTenantAndId, [
      destination_warehouse_id,
      tenant_id,
    ]);
    if (destination.rowCount === 0)
      throw new NotFoundException(
        `Destination warehouse ${destination_warehouse_id} not found for tenant ${tenant_id}`,
      );

    const txn = await this.db.transaction();
    let committed = false;
    try {
      const { rows: transferRows } = await txn.query(
        inventoryQueries.createInventoryTransfer,
        [
          origin_warehouse_id,
          destination_warehouse_id,
          departure_date ?? null,
          arrival_date ?? null,
        ],
      );
      const transfer = transferRows[0] as InventoryTransfer;

      for (const product of products) {
        if (product.amount <= 0)
          throw new BadRequestException(
            `Quantity for product ${product.product_id} must be greater than zero`,
          );

        // Disaggregate from composite if needed before moving stock
        if (product.from_composite_id) {
          const { rows: stockRows } = await txn.query(
            inventoryQueries.getStock,
            [tenant_id, product.product_id, origin_warehouse_id],
          );
          const standaloneStock = Number(stockRows[0]?.stock ?? 0);

          if (standaloneStock < product.amount) {
            const { rows: comps } = await txn.query(
              inventoryQueries.getComponents,
              [product.from_composite_id, tenant_id],
            );
            const comp = comps.find(
              (c: { child_product_variant_id: string; quantity: number }) =>
                c.child_product_variant_id === product.product_id,
            );
            const qtyPerLote = comp ? Number(comp.quantity) : 1;
            const shortage = product.amount - standaloneStock;
            const lotesToDisaggregate = Math.ceil(shortage / qtyPerLote);

            const { rows: removed } = await txn.query(
              inventoryQueries.removeStock,
              [
                lotesToDisaggregate,
                origin_warehouse_id,
                product.from_composite_id,
                tenant_id,
              ],
            );
            if (!removed || removed.length === 0)
              throw new BadRequestException(
                `Insufficient composite stock to disaggregate for product ${product.product_id}`,
              );

            await txn.query(inventoryQueries.logInventoryMovement, [
              2,
              origin_warehouse_id,
              tenant_id,
              product.from_composite_id,
              lotesToDisaggregate,
            ]);

            for (const c of comps) {
              const addedQty = lotesToDisaggregate * Number(c.quantity);
              const { rows: existing } = await txn.query(
                inventoryQueries.getInventoryId,
                [origin_warehouse_id, c.child_product_variant_id, tenant_id],
              );
              if (existing.length > 0) {
                await txn.query(inventoryQueries.addStock, [
                  addedQty,
                  origin_warehouse_id,
                  c.child_product_variant_id,
                  tenant_id,
                ]);
              } else {
                await txn.query(inventoryQueries.insertIntoInventory, [
                  tenant_id,
                  origin_warehouse_id,
                  c.child_product_variant_id,
                  addedQty,
                  null,
                ]);
              }
              await txn.query(inventoryQueries.logInventoryMovement, [
                1,
                origin_warehouse_id,
                tenant_id,
                c.child_product_variant_id,
                addedQty,
              ]);
            }
          }
        }

        const { rowCount: outCount, rows: outRows } = await txn.query(
          inventoryQueries.removeStock,
          [product.amount, origin_warehouse_id, product.product_id, tenant_id],
        );

        if (outCount === 0 || outRows.length === 0)
          throw new BadRequestException(
            `Insufficient stock for product ${product.product_id} in origin warehouse`,
          );

        // If destination is a branch, check if we need to expand composite
        const metaRes = await txn.query(inventoryQueries.checkIsComposite, [
          tenant_id,
          product.product_id,
        ]);
        const isComposite = metaRes.rows[0]?.is_composite === true;

        if (isComposite && destination.rows[0]?.is_branch) {
          const { rows: comps } = await txn.query(
            inventoryQueries.getComponents,
            [product.product_id, tenant_id],
          );

          for (const comp of comps) {
            const addedQty = product.amount * Number(comp.quantity);
            const { rows: existing } = await txn.query(
              inventoryQueries.getInventoryId,
              [
                destination_warehouse_id,
                comp.child_product_variant_id,
                tenant_id,
              ],
            );
            if (existing.length > 0) {
              await txn.query(inventoryQueries.addStock, [
                addedQty,
                destination_warehouse_id,
                comp.child_product_variant_id,
                tenant_id,
              ]);
            } else {
              await txn.query(inventoryQueries.insertIntoInventory, [
                tenant_id,
                destination_warehouse_id,
                comp.child_product_variant_id,
                addedQty,
                null,
              ]);
            }
            await txn.query(inventoryQueries.logInventoryMovement, [
              1,
              destination_warehouse_id,
              tenant_id,
              comp.child_product_variant_id,
              addedQty,
            ]);
          }
        } else {
          const { rowCount: inCount } = await txn.query(
            inventoryQueries.addStock,
            [
              product.amount,
              destination_warehouse_id,
              product.product_id,
              tenant_id,
            ],
          );
          if (inCount === 0) {
            await txn.query(inventoryQueries.insertIntoInventory, [
              tenant_id,
              destination_warehouse_id,
              product.product_id,
              product.amount,
              null,
            ]);
          }
          await txn.query(inventoryQueries.logInventoryMovement, [
            1,
            destination_warehouse_id,
            tenant_id,
            product.product_id,
            product.amount,
          ]);
        }

        await txn.query(inventoryQueries.addProductToInventoryTransfer, [
          transfer.inventory_transfer_id,
          tenant_id,
          product.product_id,
          product.amount,
        ]);

        await txn.query(inventoryQueries.logInventoryMovement, [
          2,
          origin_warehouse_id,
          tenant_id,
          product.product_id,
          product.amount,
        ]);
      }

      await txn.commit();
      committed = true;
      return {
        message: 'Products transferred successfully between warehouses',
        inventory_transfer_id: transfer.inventory_transfer_id,
      };
    } catch (error) {
      if (!committed) {
        try {
          await txn.rollback();
        } catch (rollbackError) {
          console.error(
            '[WarehouseService.moveProductToWarehouse] Rollback failed:',
            rollbackError,
          );
        }
      }
      throw error;
    }
  }

  async applyDiscrepancyAdjustment(
    discrepancyCountId: string,
    tenantId: string,
  ) {
    const tenant = this.state.getTenant(tenantId);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);

    const { rows } = await this.db.query(
      inventoryQueries.getDiscrepancyReportById,
      [tenantId, discrepancyCountId],
    );
    if (rows.length === 0)
      throw new NotFoundException(
        `Discrepancy Report with ID ${discrepancyCountId} not found`,
      );

    const report = rows[0];

    if (report.is_applied)
      throw new ConflictException(
        `Discrepancy Report ${discrepancyCountId} has already been applied`,
      );

    const {
      warehouse_id,
      product_variant_id,
      stored_quantity,
      physical_quantity,
    } = report;
    const delta = physical_quantity - stored_quantity;

    const txn = await this.db.transaction();
    try {
      if (delta > 0) {
        await txn.query(inventoryQueries.addStock, [
          delta,
          warehouse_id,
          product_variant_id,
          tenantId,
        ]);
        await txn.query(inventoryQueries.logInventoryMovement, [
          1,
          warehouse_id,
          tenantId,
          product_variant_id,
          delta,
        ]);
      } else if (delta < 0) {
        await txn.query(inventoryQueries.removeStock, [
          Math.abs(delta),
          warehouse_id,
          product_variant_id,
          tenantId,
        ]);
        await txn.query(inventoryQueries.logInventoryMovement, [
          2,
          warehouse_id,
          tenantId,
          product_variant_id,
          Math.abs(delta),
        ]);
      }
      await txn.query(inventoryQueries.applyDiscrepancyReport, [
        discrepancyCountId,
        tenantId,
      ]);
      await txn.commit();
      return { success: true };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }

  async getExpiringProducts(
    tenant_id: string,
    days: number = 30,
  ): Promise<any[]> {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    const { rows } = await this.db.query(inventoryQueries.getExpiringStock, [
      tenant_id,
      days,
    ]);
    return rows;
  }

  // --- TRANSFER REQUEST WORKFLOW ---

  async createTransferRequest(tenant_id: string, dto: any, user_id: string) {
    const { rows } = await this.db.query(
      inventoryQueries.createTransferRequest,
      [
        tenant_id,
        dto.origin_warehouse_id,
        dto.destination_warehouse_id,
        user_id,
      ],
    );
    const request = rows[0];
    const products: { product_id: string; amount: number }[] =
      dto.products ?? [];
    for (const product of products) {
      await this.db.query(inventoryQueries.insertTransferRequestProduct, [
        request.inventory_transfer_request_id,
        tenant_id,
        product.product_id,
        product.amount,
      ]);
    }
    return request;
  }

  async getTransferDetail(transferId: string, tenantId: string) {
    const { rows } = await this.db.query(
      inventoryQueries.getInventoryTransferDetail,
      [transferId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException(`Transfer ${transferId} not found`);
    return rows[0];
  }

  async getTransferRequestDetail(requestId: string, tenantId: string) {
    const { rows } = await this.db.query(
      inventoryQueries.getTransferRequestById,
      [requestId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException(`Transfer request ${requestId} not found`);
    return rows[0];
  }

  async getTransferRequests(tenant_id: string) {
    const { rows } = await this.db.query(
      inventoryQueries.getTransferRequestsByTenant,
      [tenant_id],
    );
    return rows;
  }

  async updateTransferRequestStatus(
    tenant_id: string,
    request_id: string,
    status: string,
    rejection_reason: string | null,
    user_id: string,
  ) {
    const { rows: requests } = await this.db.query(
      inventoryQueries.getTransferRequestById,
      [request_id, tenant_id],
    );
    if (requests.length === 0)
      throw new NotFoundException('Transfer request not found');

    const req = requests[0];
    if (req.status_name !== 'pending') {
      throw new BadRequestException('Can only update pending requests');
    }

    const transferId = null;

    if (status === 'approved') {
      const rawProducts: { product_variant_id: string; amount: number }[] =
        Array.isArray(req.products) ? req.products : [];
      const products: InventoryTransferProduct[] = rawProducts.map((p) => ({
        product_id: p.product_variant_id,
        amount: p.amount,
      }));
      await this.moveProductToWarehouse(
        req.from_warehouse_id,
        req.to_warehouse_id,
        tenant_id,
        products,
      );
    }

    const { rows: updated } = await this.db.query(
      inventoryQueries.updateTransferRequestStatus,
      [
        request_id,
        tenant_id,
        status,
        user_id,
        rejection_reason || null,
        transferId,
      ],
    );

    return updated[0];
  }

  // --- LOTE DISAGGREGATION ---

  async disaggregateLote(
    tenant_id: string,
    warehouse_id: string,
    composite_product_variant_id: string,
    quantity_to_disaggregate: number,
    user_id?: string,
  ) {
    const tenant = this.state.getTenant(tenant_id);
    if (!tenant)
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);

    if (quantity_to_disaggregate <= 0) {
      throw new BadRequestException(
        'Quantity to disaggregate must be greater than 0',
      );
    }

    // 1. Verify product is composite
    const { rows: products } = await this.db.query(
      inventoryQueries.checkIsComposite,
      [tenant_id, composite_product_variant_id],
    );

    if (products.length === 0) throw new NotFoundException('Product not found');
    if (!products[0].is_composite)
      throw new BadRequestException('Product is not a composite (lote)');

    // 2. Fetch components
    const { rows: components } = await this.db.query(
      inventoryQueries.getComponents,
      [composite_product_variant_id, tenant_id],
    );

    if (components.length === 0)
      throw new BadRequestException(
        'Composite product has no components defined',
      );

    // 3. Start transaction
    const txn = await this.db.transaction();
    try {
      // 4. Decrease composite stock
      const { rows: removed } = await txn.query(inventoryQueries.removeStock, [
        quantity_to_disaggregate,
        warehouse_id,
        composite_product_variant_id,
        tenant_id,
      ]);

      if (removed.length === 0) {
        throw new BadRequestException(
          'Not enough stock of the composite product to disaggregate',
        );
      }

      // Log out for parent
      const OUT_LOG_TYPE_ID = 2; // OUT
      await txn.query(inventoryQueries.logInventoryMovement, [
        OUT_LOG_TYPE_ID,
        warehouse_id,
        tenant_id,
        composite_product_variant_id,
        quantity_to_disaggregate,
      ]);

      // 5. Increase children stock
      const IN_LOG_TYPE_ID = 1; // IN
      for (const comp of components) {
        const addedQty = quantity_to_disaggregate * Number(comp.quantity);

        const { rows: existing } = await txn.query(
          inventoryQueries.getInventoryId,
          [warehouse_id, comp.child_product_variant_id, tenant_id],
        );

        if (existing.length > 0) {
          await txn.query(inventoryQueries.addStock, [
            addedQty,
            warehouse_id,
            comp.child_product_variant_id,
            tenant_id,
          ]);
        } else {
          await txn.query(inventoryQueries.insertIntoInventory, [
            tenant_id,
            warehouse_id,
            comp.child_product_variant_id,
            addedQty,
            null,
          ]);
        }

        // Log in for child
        await txn.query(inventoryQueries.logInventoryMovement, [
          IN_LOG_TYPE_ID,
          warehouse_id,
          tenant_id,
          comp.child_product_variant_id,
          addedQty,
        ]);
      }

      await txn.commit();
      return { message: 'Lote disaggregated successfully' };
    } catch (e) {
      await txn.rollback();
      throw e;
    }
  }
  @Cron('0 8 * * *')
  async notifyExpiringProducts() {
    const logger = new Logger('WarehouseScheduler');
    logger.log('[IN-04] Checking products expiring in the next 7 days...');
    // Integrar con sistema de notificaciones cuando esté disponible
  }
}
