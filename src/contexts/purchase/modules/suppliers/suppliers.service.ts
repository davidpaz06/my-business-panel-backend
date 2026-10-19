import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import Database from '@resonance-components/datahandler';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { purchaseQueries } from '@purchase/purchase.queries';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { InvalidSessionError } from '@/common/errors/invalid_session.error';

const { suppliers } = purchaseQueries;

@Injectable()
export class SuppliersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createSupplier(
    createSupplierDto: CreateSupplierDto,
    userSession: IUserSession,
  ) {
    const txn = await this.db.transaction();
    try {
      if (!userSession || !userSession.tenant_id) {
        throw new InvalidSessionError('INVALID');
      }

      const {
        supplier_name,
        supplier_contact_info,
        supplier_address,
        supplier_notes,
      } = createSupplierDto;

      const branchResult = await txn.query(suppliers.getTenantPrimaryBranch, [
        userSession.tenant_id,
      ]);

      const primaryBranchId = branchResult.rows[0]?.branch_id;
      if (!primaryBranchId) {
        throw new BadRequestException(
          'El tenant no tiene una sucursal disponible para asociar el proveedor',
        );
      }

      const newSupplier = await txn.query(suppliers.create, [
        supplier_name,
        supplier_contact_info,
        supplier_address,
        supplier_notes,
        userSession.tenant_id,
      ]);

      await txn.query(suppliers.createBranchLink, [
        newSupplier.rows[0].supplier_id,
        primaryBranchId,
      ]);

      await txn.commit();

      return newSupplier.rows[0];
    } catch (error) {
      await txn.rollback();
      console.error('Error creating supplier:', error);
      if (error instanceof InvalidSessionError) {
        throw error;
      }
      throw error instanceof BadRequestException
        ? error
        : new Error('Failed to create supplier');
    }
  }

  async createSuppliersBulk(
    createSuppliersDto: CreateSupplierDto[],
    userSession: IUserSession,
  ) {
    const txn = await this.db.transaction();
    try {
      if (!userSession || !userSession.tenant_id) {
        throw new InvalidSessionError('INVALID');
      }

      const branchResult = await txn.query(suppliers.getTenantPrimaryBranch, [
        userSession.tenant_id,
      ]);

      const primaryBranchId = branchResult.rows[0]?.branch_id;
      if (!primaryBranchId) {
        throw new BadRequestException(
          'El tenant no tiene una sucursal disponible para asociar los proveedores',
        );
      }

      const createdSuppliers: Array<{
        supplier_id: string;
        supplier_name: string;
      }> = [];

      for (const dto of createSuppliersDto) {
        const created = await txn.query(suppliers.create, [
          dto.supplier_name,
          dto.supplier_contact_info,
          dto.supplier_address,
          dto.supplier_notes,
          userSession.tenant_id,
        ]);

        const supplier = created.rows[0];
        await txn.query(suppliers.createBranchLink, [
          supplier.supplier_id,
          primaryBranchId,
        ]);

        createdSuppliers.push({
          supplier_id: supplier.supplier_id,
          supplier_name: supplier.supplier_name,
        });
      }

      await txn.commit();

      return {
        message: 'suppliers added successfully!',
        count: createdSuppliers.length,
        suppliers: createdSuppliers,
      };
    } catch (error) {
      await txn.rollback();
      console.error('Error bulk creating suppliers:', error);
      if (error instanceof InvalidSessionError) {
        throw error;
      }
      throw error instanceof BadRequestException
        ? error
        : new Error('Failed to bulk create suppliers');
    }
  }

  async getAllSuppliers() {
    try {
      const result = await this.db.query(suppliers.getAll);
      return result.rows;
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      throw new Error('Failed to fetch suppliers');
    }
  }

  async getAllSuppliersByTenant(tenantId: string) {
    try {
      const result = await this.db.query(suppliers.getAllByTenant, [tenantId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      throw new Error('Failed to fetch suppliers');
    }
  }

  async getSupplierById(id: string, tenantId: string) {
    try {
      const result = await this.db.query(suppliers.getByIdAndTenant, [
        id,
        tenantId,
      ]);
      return result.rows[0] ?? null;
    } catch (error) {
      console.error(`Error fetching supplier with id ${id}:`, error);
      throw new Error('Failed to fetch supplier');
    }
  }

  async updateSupplier(
    supplierId: string,
    updateSupplierDto: UpdateSupplierDto,
    tenantId: string,
  ) {
    const existing = await this.getSupplierById(supplierId, tenantId);
    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    const result = await this.db.query(suppliers.update, [
      updateSupplierDto.supplier_name ?? existing.supplier_name,
      updateSupplierDto.supplier_contact_info ?? existing.supplier_contact_info,
      updateSupplierDto.supplier_address ?? existing.supplier_address,
      updateSupplierDto.supplier_notes ?? existing.supplier_notes,
      supplierId,
      tenantId,
    ]);

    return {
      message: 'Supplier updated successfully',
      supplier: result.rows[0],
    };
  }

  async deleteSupplier(supplierId: string, tenantId: string) {
    const exist = await this.getSupplierById(supplierId, tenantId);
    if (!exist) {
      throw new NotFoundException('Supplier not found');
    }

    const ordersResult = await this.db.query(suppliers.countOrders, [
      supplierId,
    ]);

    if ((ordersResult.rows[0]?.total ?? 0) > 0) {
      throw new BadRequestException(
        'No se puede eliminar un proveedor con órdenes de compra asociadas',
      );
    }

    const result = await this.db.query(suppliers.delete, [
      supplierId,
      tenantId,
    ]);
    return {
      message: 'Supplier deleted successfully',
      supplier: result.rows[0],
    };
  }
}
