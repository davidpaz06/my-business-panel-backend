import { ConstantNotFoundError } from '@/common/errors/constant_not_found.error';
import { IRole } from '@/common/interfaces/role.interface';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { config as dotenvConfig } from 'dotenv';
import { DATABASE } from '../db/db.provider';
import Database from '@crane-technologies/database';
import { generalQueries } from '@general/general.queries';
import { InvalidRoleError } from '@/common/errors/invalid_role.error';
import { ITenant } from '@/common/interfaces/tenant.interface';
import { InvalidTenantError } from '@/common/errors/invalid_tenant.error';

const { role, tenant } = generalQueries;

dotenvConfig();

@Injectable()
export class StateService implements OnModuleInit {
  private readonly constants: Map<string, any> = new Map();
  private readonly roles: Map<number, IRole> = new Map();
  private readonly tokenBlacklist: Map<string, string> = new Map();
  private readonly tenants: Map<string, ITenant> = new Map();
  private isInitialized: boolean = false;

  private readonly initPromise: Promise<void>;
  constructor(@Inject(DATABASE) private readonly db: Database) {
    this.initPromise = this.loadState();
  }

  async onModuleInit() {}
  public async waitForInitialization(): Promise<void> {
    if (this.isInitialized) return;
    await this.initPromise;
  }

  getConstant<T>(key: string): T {
    const value = this.constants.get(key);
    if (!value) {
      console.error('Error finding constant:', key);
      throw new ConstantNotFoundError(key);
    }
    return value;
  }

  async loadState() {
    this.loadConstants();
    await this.loadRoles();
    await this.loadTenants();
  }

  private async loadRoles() {
    const fetchedData = await this.db.query(role.all);
    const roles = fetchedData.rows as IRole[];
    roles.forEach((role) => this.roles.set(role.role_id, role));
  }

  getRoles(): IRole[] {
    return [...this.roles.values()];
  }

  getRole(key: number): IRole {
    const role = this.roles.get(key);
    if (!role) throw new InvalidRoleError(key);
    return role;
  }

  private async loadTenants() {
    const fetchedData = await this.db.query(tenant.all);
    const tenants = fetchedData.rows;
    tenants.forEach((tenant) => this.tenants.set(tenant.tenant_id, tenant));
  }

  getTenants(): ITenant[] {
    return [...this.tenants.values()];
  }

  getTenant(key: string): ITenant {
    const tenant = this.tenants.get(key);
    if (!tenant) throw new InvalidTenantError(key);
    return tenant;
  }

  addTenant(tenantData: ITenant): void {
    this.tenants.set(tenantData.tenant_id, tenantData);
  }

  private loadConstants() {
    this.constants.set('JWT_SECRET', process.env.JWT_SECRET);
    this.constants.set(
      'PASSWORD_SALT_ROUNDS',
      parseInt(process.env.PASSWORD_SALT_ROUNDS as string),
    );
    this.constants.set('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN);
    this.constants.set(
      'JWT_ACCESS_SECRET',
      process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET,
    );
    this.constants.set(
      'JWT_ACCESS_EXPIRATION',
      process.env.JWT_ACCESS_EXPIRATION ?? '15m',
    );
    this.constants.set('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
    this.constants.set(
      'JWT_REFRESH_EXPIRATION',
      process.env.JWT_REFRESH_EXPIRATION ?? '7d',
    );
  }
}
