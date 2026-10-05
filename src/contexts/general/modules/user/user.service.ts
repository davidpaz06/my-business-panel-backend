import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create_user.dto';
import Database from '@crane-technologies/database';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { IUserResult } from '@/contexts/general/modules/user/interfaces/user_result.interface';
import { generalQueries } from '@general/general.queries';
import { hrQueries } from '@hr/hr.queries';
import { hash, hashSync } from 'bcrypt';
import { StateService } from '../state/state.service';
import { UserCreationError } from '@/common/errors/user_create.error';
import { AssignRoleDto } from '@/contexts/general/modules/user/dto/assign_role.dto';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { isUUID } from 'class-validator';
import { InvalidTenantError } from '@/common/errors/invalid_tenant.error';
import { EmployeeService } from '@/contexts/hr/modules/employee/employee.service';
import { CreateFullEmployeeError } from '@/common/errors/create_full_employee.error';

const { users } = generalQueries;
const { employee } = hrQueries;
type TransactionClient = Awaited<ReturnType<Database['transaction']>>;

@Injectable()
export class UserService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly state: StateService,
    private readonly employeeService: EmployeeService,
  ) {}

  private async rollbackSafely(
    txn: TransactionClient,
    context: string,
  ): Promise<void> {
    try {
      await txn.rollback();
    } catch (rollbackError) {
      console.error(`[UserService.${context}] Rollback failed:`, rollbackError);
    }
  }

  async getUserById(
    userId: string,
    full?: boolean,
  ): Promise<IUserResult | null> {
    if (!full) {
      const fetchedData = await this.db.query(users.byId, [userId]);
      if (fetchedData.rows.length === 0) return null;
      return fetchedData.rows[0];
    }

    const fetchedData = await this.db.query(users.byIdFull, [userId]);
    if (fetchedData.rows.length === 0) return null;

    const {
      employee_id,
      first_name,
      last_name,
      doc_number,
      phone,
      employee_email,
      is_active,
      payment_schedule_id,
      branch_id,
      contract_id,
      start_date,
      end_date,
      hours,
      base_salary,
      duties,
      duties_type_id,
      turn_type,
      turn_id,
      ...userFields
    } = fetchedData.rows[0];

    return {
      ...userFields,
      employee: employee_id
        ? {
            employee_id,
            first_name,
            last_name,
            doc_number,
            phone,
            employee_email,
            is_active,
            payment_schedule_id,
            branch_id,
            contract_id,
            start_date,
            end_date,
            hours,
            base_salary,
            duties,
            duties_type_id,
            turn_type,
            turn_id,
          }
        : null,
    };
  }

  async getUserByEmail(email: string): Promise<IUserResult | null> {
    const fetchedData = await this.db.query(users.byEmailWithPassword, [email]);
    if (fetchedData.rows.length === 0) return null;
    return fetchedData.rows[0];
  }

  async checkEmailAvailability(
    email: string,
    excludeId?: string,
  ): Promise<{ exists: boolean }> {
    if (!email) return { exists: false };

    const params: any[] = [email];
    let query = `SELECT 1 FROM general_schema.users WHERE email = $1`;
    if (excludeId) {
      params.push(excludeId);
      query += ` AND user_id <> $2`;
    }
    query += ' LIMIT 1';

    const result = await this.db.query(query, params);
    return { exists: result.rows.length > 0 };
  }

  async getUsersByTenant(tenant_id: string): Promise<IUserResult[]> {
    if (isUUID(tenant_id) === false) throw new InvalidTenantError(tenant_id);

    const fetchedData = await this.db.query(users.byTenant, [tenant_id]);
    return fetchedData.rows;
  }

  getUserRoles() {
    return this.state.getRoles();
  }

  getSelfInfo(user: IUserSession) {
    const { user_id, role_id, tenant_id, email } = user;
    const role = this.state.getRole(role_id);
    const tenant = this.state.getTenant(tenant_id);
    return { user_id, email, role, tenant };
  }

  async createUser(createUserDto: CreateUserDto) {
    const password_hash = await hash(
      createUserDto.password,
      this.state.getConstant<number>('PASSWORD_SALT_ROUNDS'),
    );
    const { tenant_id, email, role_id, employeeInfo } = createUserDto;
    const txn = await this.db.transaction();
    let committed = false;

    try {
      const newUser = await txn.query(users.create, [
        tenant_id,
        email,
        password_hash,
        role_id,
      ]);
      if (newUser.rows.length === 0) {
        throw new UserCreationError(email);
      }

      const userId = newUser.rows[0].user_id;

      if (employeeInfo) {
        const {
          base_salary,
          hours,
          start_date,
          end_date,
          duties,
          duties_type_id,
          turn_type,
          turn_id,
        } = employeeInfo.contractData;

        const newEmployee = await txn.query(employee.full, [
          start_date,
          end_date,
          hours,
          base_salary,
          duties ?? null,
          turn_type,
          turn_id,
          userId,
          employeeInfo.tenant_id,
          employeeInfo.first_name,
          employeeInfo.last_name,
          employeeInfo.doc_number,
          employeeInfo.phone,
          employeeInfo.email,
          employeeInfo.payment_schedule_id,
          employeeInfo.branch_id,
          employeeInfo.identification_type_id ?? 1,
          duties_type_id ?? null,
        ]);

        if (newEmployee.rows.length === 0) {
          throw new CreateFullEmployeeError();
        }
      }

      await txn.commit();
      committed = true;
      return { message: 'user created successfully!', user_id: userId, email };
    } catch (error) {
      if (!committed) await this.rollbackSafely(txn, 'createUser');
      console.error('[UserService.createUser] Transaction failed:', error);
      throw error;
    }
  }

  async createUsersBulk(createUserDto: CreateUserDto[]) {
    const saltRounds = this.state.getConstant<number>('PASSWORD_SALT_ROUNDS'),
      rows = createUserDto.map((dto) => {
        const validTenant =
          isUUID(dto.tenant_id) && this.state.getTenant(dto.tenant_id);
        if (!validTenant) throw new InvalidTenantError(dto.tenant_id);

        const password_hash = hashSync(dto.password, saltRounds);

        return [dto.tenant_id, dto.email, password_hash, dto.role_id];
      });
    const txn = await this.db.transaction();
    let committed = false;

    try {
      const userResult = await txn.bulkInsert(
        'general_schema.users',
        ['tenant_id', 'email', 'password_hash', 'role_id'],
        rows,
        { header: false, returnFields: ['user_id', 'email'] },
      );

      const userIds = (userResult.fields || []).map((row: any) => row.user_id);

      const contractRows = createUserDto.map((dto) => {
        if (!dto.employeeInfo)
          throw new Error(
            `employeeInfo is required for bulk user creation (email: ${dto.email})`,
          );
        const {
          start_date,
          end_date,
          hours,
          base_salary,
          duties,
          duties_type_id,
          turn_type,
          turn_id,
        } = dto.employeeInfo.contractData;
        return [
          dto.tenant_id,
          start_date,
          end_date,
          hours,
          base_salary,
          duties ?? null,
          duties_type_id ?? null,
          turn_type,
          turn_id,
        ];
      });

      const contractResult = await txn.bulkInsert(
        'hr_schema.contract',
        [
          'tenant_id',
          'start_date',
          'end_date',
          'hours',
          'base_salary',
          'duties',
          'duties_type_id',
          'turn_type',
          'turn_id',
        ],
        contractRows,
        { header: false, returnFields: ['contract_id'] },
      );

      const contractIds = (contractResult.fields || []).map(
        (row: any) => row.contract_id,
      );

      const employeeRows = createUserDto.map((dto, index) => {
        const userId = userIds[index];
        const contractId = contractIds[index];

        if (!userId) {
          throw new Error(
            `User ID not found for index: ${index} (email: ${dto.email})`,
          );
        }
        if (!contractId) {
          throw new Error(`Contract ID not found for index: ${index}`);
        }

        const {
          tenant_id,
          branch_id,
          first_name,
          last_name,
          doc_number,
          identification_type_id,
          phone,
          email,
          payment_schedule_id,
        } = dto.employeeInfo!;
        return [
          userId,
          tenant_id,
          branch_id,
          first_name,
          last_name,
          doc_number,
          identification_type_id ?? 1,
          phone,
          email,
          payment_schedule_id,
          contractId,
        ];
      });

      await txn.bulkInsert(
        'hr_schema.employee',
        [
          'user_id',
          'tenant_id',
          'branch_id',
          'first_name',
          'last_name',
          'doc_number',
          'identification_type_id',
          'phone',
          'email',
          'payment_schedule_id',
          'contract_id',
        ],
        employeeRows,
        { header: false },
      );

      await txn.commit();
      committed = true;
      return {
        message: 'users created successfully!',
        count: rows.length,
        users: (userResult.fields || []).map((row: any) => ({
          user_id: row.user_id,
          email: row.email,
        })),
      };
    } catch (error) {
      if (!committed) await this.rollbackSafely(txn, 'createUsersBulk');
      console.error('[UserService.createUsersBulk] Transaction failed:', error);
      throw error;
    }
  }

  async updateUser(userId: string, data: { email?: string; role_id?: number }) {
    const result = await this.db.query(users.update, [
      data.email ?? null,
      data.role_id ?? null,
      userId,
    ]);
    if (result.rows.length === 0) throw new Error(`User ${userId} not found`);
    return result.rows[0];
  }

  async assignRole(assignRoleDto: AssignRoleDto) {
    await this.db.query(users.assignRole, [
      assignRoleDto.role_id,
      assignRoleDto.user_id,
    ]);
    return { message: 'role assigned successfully!' };
  }

  /** Nadie puede otorgar un rol de jerarquia superior a la propia. */
  assertCanGrantRole(session: IUserSession, roleId: number): void {
    const own = this.state.getRole(session.role_id).role_hierarchy;
    const target = this.state.getRole(roleId).role_hierarchy;
    if (target > own) {
      throw new ForbiddenException('No puede asignar un rol superior al suyo');
    }
  }

  /**
   * Un usuario solo se crea en el tenant de la sesion (el superusuario de
   * plataforma puede elegir otro) y con un rol que el solicitante pueda otorgar.
   */
  assertCanCreateFor(
    session: IUserSession,
    dto: {
      tenant_id: string;
      role_id: number;
      employeeInfo?: { tenant_id: string };
    },
  ): void {
    const isSuperuser =
      this.state.getRole(session.role_id).role_name === 'superuser';
    const tenantIds = [dto.tenant_id, dto.employeeInfo?.tenant_id].filter(
      (id): id is string => !!id,
    );
    if (!isSuperuser && tenantIds.some((id) => id !== session.tenant_id)) {
      throw new NotFoundException('Recurso no encontrado');
    }
    this.assertCanGrantRole(session, dto.role_id);
  }

  /**
   * Un admin restablece la clave de un empleado de su mismo tenant. Revoca los
   * refresh tokens del empleado para cerrar sus sesiones activas.
   */
  async resetEmployeePassword(
    session: IUserSession,
    targetUserId: string,
    newPassword: string,
  ) {
    if (!isUUID(targetUserId)) throw new NotFoundException('User not found');

    const { rows } = await this.db.query(users.byIdScoped, [targetUserId]);
    const target = rows[0];

    // Otro tenant se responde igual que inexistente para no filtrar su existencia.
    if (!target || target.tenant_id !== session.tenant_id) {
      throw new NotFoundException('User not found');
    }
    if (this.state.getRole(target.role_id).role_name !== 'employee') {
      throw new ForbiddenException(
        'Only employee passwords can be reset by an admin',
      );
    }

    const password_hash = await hash(
      newPassword,
      this.state.getConstant<number>('PASSWORD_SALT_ROUNDS'),
    );

    const txn = await this.db.transaction();
    let committed = false;
    try {
      await txn.query(users.updatePassword, [password_hash, targetUserId]);
      await txn.query(generalQueries.refreshToken.revokeAllByUser, [
        targetUserId,
      ]);
      await txn.commit();
      committed = true;
      return {
        message: 'password updated successfully',
        user_id: targetUserId,
      };
    } catch (error) {
      if (!committed) await this.rollbackSafely(txn, 'resetEmployeePassword');
      throw error;
    }
  }

  async deleteUser(userId: string) {
    const { rows } = await this.db.query(users.delete, [userId]);
    if (rows.length === 0) throw new Error(`User ${userId} not found`);
    return { message: 'user deleted successfully', user_id: rows[0].user_id };
  }
}
