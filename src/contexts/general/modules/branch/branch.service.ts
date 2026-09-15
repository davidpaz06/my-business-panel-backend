import Database from '@crane-technologies/database';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { Branch } from '@/contexts/general/modules/branch/interfaces/branch.interface';
import { CreateBranchDto } from '@/contexts/general/modules/branch/dto/create_branch.dto';
import { UpdateBranchDto } from '@/contexts/general/modules/branch/dto/update_branch.dto';
import { generalQueries } from '@general/general.queries';
import { InvalidBranchError } from '@/common/errors/invalid_branch.error';
import { InvalidSessionError } from '@/common/errors/invalid_session.error';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { InvalidTenantError } from '@/common/errors/invalid_tenant.error';

const { branch } = generalQueries;

@Injectable()
export class BranchService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly state: StateService,
  ) {}

  async findById(branchId: string): Promise<Branch> {
    const { rows } = await this.db.query(branch.byId, [branchId]);
    return rows[0];
  }

  async findByTenant(tenantId: string): Promise<Branch[]> {
    const { rows } = await this.db.query(branch.byTenant, [tenantId]);
    return rows;
  }

  async findByTenantPaginated(
    tenantId: string,
    page = 1,
    limit = 100,
  ): Promise<{
    branches: Branch[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(branch.byTenantPaginated, [tenantId, limit, offset]),
      this.db.query(branch.countByTenant, [tenantId]),
    ]);
    return {
      branches: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async findAllGlobal(
    page = 1,
    limit = 100,
  ): Promise<{
    branches: Branch[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(branch.allPaginated, [limit, offset]),
      this.db.query(branch.countAll, []),
    ]);
    return {
      branches: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async findBranchByName(branchName: string): Promise<Branch> {
    const { rows } = await this.db.query(branch.byName, [branchName]);
    return rows[0];
  }

  async createBranch(
    user_tenant_id: string,
    createBranchDto: CreateBranchDto,
  ): Promise<Branch> {
    const {
      tenant_id,
      branch_name,
      branch_number,
      branch_address,
      contact_email,
      is_main_branch,
    } = createBranchDto;

    if (user_tenant_id !== tenant_id)
      throw new InvalidSessionError('UNAUTHORIZED');

    const txn = await this.db.transaction();
    let committed = false;

    try {
      const { rows } = await txn.query(branch.create, [
        tenant_id,
        branch_name,
        branch_number,
        branch_address || null,
        contact_email || null,
        is_main_branch,
      ]);

      const newBranch: Branch = rows[0];

      await txn.commit();
      committed = true;
      return newBranch;
    } catch (error) {
      if (!committed) {
        try {
          await txn.rollback();
        } catch (rollbackError) {
          console.error(
            '[BranchService.createBranch] Rollback failed:',
            rollbackError,
          );
        }
      }
      throw error;
    }
  }

  async deleteBranch(branchId: string): Promise<Branch> {
    const existing = await this.findById(branchId);
    if (!existing) throw new InvalidBranchError();
    if (existing.is_main_branch) {
      throw new BadRequestException(
        'No se puede eliminar la sucursal principal. Desmárcala primero.',
      );
    }
    const { rows } = await this.db.query(branch.delete, [branchId]);
    return rows[0];
  }

  async updateBranch(
    branch_id: string,
    updateBranchDto: UpdateBranchDto,
  ): Promise<Branch> {
    const {
      branch_name,
      branch_number,
      branch_address,
      contact_email,
      is_main_branch,
    } = updateBranchDto;

    const currentBranch = await this.validateBranch(branch_id);

    const txn = await this.db.transaction();
    let committed = false;

    try {
      // If marking this branch as main, first deactivate all other main branches for this tenant
      if (is_main_branch === true) {
        await txn.rawQuery(
          `UPDATE general_schema.branch
           SET is_main_branch = false, updated_at = NOW()
           WHERE tenant_id = $1 AND branch_id != $2 AND is_main_branch = true`,
          [currentBranch.tenant_id, branch_id],
        );
      }

      // Update the branch
      const { rows } = await txn.query(branch.update, [
        branch_id,
        branch_name,
        branch_number,
        branch_address || null,
        contact_email || null,
        is_main_branch,
      ]);

      const updatedBranch: Branch = rows[0];

      await txn.commit();
      committed = true;
      return updatedBranch;
    } catch (error) {
      if (!committed) {
        try {
          await txn.rollback();
        } catch (rollbackError) {
          console.error(
            '[BranchService.updateBranch] Rollback failed:',
            rollbackError,
          );
        }
      }
      throw error;
    }
  }

  async validateBranch(branchId: string, tenantId?: string): Promise<Branch> {
    const branch = await this.findById(branchId);
    if (!branch) throw new InvalidBranchError();
    if (tenantId && branch.tenant_id !== tenantId)
      throw new InvalidTenantError(tenantId);
    return branch;
  }
}
