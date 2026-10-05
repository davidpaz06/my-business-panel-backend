import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Customer } from './interface/customer.interface';
import { NewClientDto } from './dto/newClient.dto';
import { DATABASE } from '../db/db.provider';
import Database from '@crane-technologies/database/dist/components/Database';
import { generalQueries } from '@general/general.queries';
import { UpdateClientDto } from './dto/updateClient.dto';
import { ClientCreateError } from '@/common/errors/client_create.error';
import { isLegalPerson } from './customer-invoice-requirements';

const { customer } = generalQueries;

@Injectable()
export class CustomerService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Busca un cliente por documento dentro del tenant indicado. El mismo
   * documento puede existir en otras empresas: nunca se devuelve el de otra.
   */
  async findCustomerByDocumentId(
    documentNumber: string,
    tenantId: string,
  ): Promise<Customer> {
    const { rows } = await this.db.query(customer.getInfo, [
      documentNumber,
      tenantId,
    ]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException('Customer not found');
    }
    return rows[0];
  }

  /**
   * `scopeTenantId` null = sin filtro de tenant (solo superusuario de
   * plataforma, ver TenantScopeService.scopeFor).
   */
  async findCustomerById(
    customerId: string,
    scopeTenantId: string | null,
  ): Promise<Customer> {
    const { rows } = await this.db.query(customer.byId, [
      customerId,
      scopeTenantId,
    ]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException('Customer not found');
    }
    return rows[0];
  }

  async getAllCustomers(tenantId: string): Promise<Customer[]> {
    const { rows } = await this.db.query(customer.all, [tenantId]);
    return rows;
  }

  async getAllCustomersPaginated(
    tenantId: string,
    page = 1,
    limit = 100,
    segmentId?: string,
  ): Promise<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(customer.allPaginated, [
        tenantId,
        limit,
        offset,
        segmentId || null,
      ]),
      this.db.query(customer.countByTenant, [tenantId, segmentId || null]),
    ]);
    return {
      customers: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async search(
    tenantId: string,
    query: string,
    page = 1,
    limit = 100,
    segmentId?: string,
  ): Promise<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(customer.search, [
        tenantId,
        query,
        limit,
        segmentId || null,
        offset,
      ]),
      this.db.query(customer.countSearch, [tenantId, query, segmentId || null]),
    ]);
    return {
      customers: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getAllCustomersGlobal(
    page = 1,
    limit = 100,
  ): Promise<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(customer.allGlobal, [limit, offset]),
      this.db.query(customer.countAll, []),
    ]);
    return {
      customers: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  /** El tenant del nuevo cliente es siempre el de la sesion, nunca el del body. */
  async createCustomer(tenant_id: string, customerData: NewClientDto) {
    const {
      first_name,
      last_name,
      document_type_id,
      document_number,
      economic_activity,
      email,
      phone,
      birthdate,
      address,
      segment_id,
      is_tenant,
      business_name,
    } = customerData;

    await this.assertBusinessNameForLegalPerson(
      document_type_id,
      business_name,
    );

    const { rows } = await this.db.query(customer.create, [
      tenant_id,
      first_name,
      last_name,
      document_type_id,
      document_number,
      economic_activity || null,
      email || null,
      phone || null,
      birthdate || null,
      address || null,
      is_tenant || false,
      segment_id || null,
      business_name?.trim() || null,
    ]);

    if (rows.length == 0) throw new ClientCreateError(email!);
    return rows[0];
  }

  /**
   * Un cliente J/G/C (persona juridica) se factura por razon social. El
   * codigo del tipo de documento vive en identification_type, no en el DTO.
   */
  private async assertBusinessNameForLegalPerson(
    documentTypeId: number | undefined,
    businessName: string | undefined,
  ) {
    if (documentTypeId === undefined) return;
    const { rows } = await this.db.query(customer.identificationCode, [
      documentTypeId,
    ]);
    if (isLegalPerson(rows[0]?.ident_code) && !businessName?.trim()) {
      throw new BadRequestException(
        'La razon social es obligatoria para clientes con RIF juridico, gubernamental o consejo comunal (J/G/C).',
      );
    }
  }

  async updateCustomer(
    customerId: string,
    customerData: UpdateClientDto,
    scopeTenantId: string | null,
  ) {
    const { ...updates } = customerData;

    const columnMap: Record<string, string> = {
      segment_id: 'customer_segment_id',
      document_type_id: 'identification_type_id',
      economic_activity: 'econ_activity',
    };

    const validDbColumns = new Set([
      'first_name',
      'last_name',
      'business_name',
      'email',
      'phone',
      'address',
      'birthdate',
      'document_number',
      'econ_activity',
      'identification_type_id',
      'customer_segment_id',
      'is_tenant',
      'is_wholesale',
    ]);

    const updateKeys = Object.keys(updates).filter((key) => {
      if (updates[key as keyof typeof updates] === undefined) return false;
      const col = columnMap[key] ?? key;
      return validDbColumns.has(col);
    });

    if (updateKeys.length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    // Solo se revalida la razon social cuando se toca el tipo de documento o
    // la propia razon social: editar el telefono de un cliente historico sin
    // direccion no debe quedar bloqueado.
    if (
      updateKeys.includes('document_type_id') ||
      updateKeys.includes('business_name')
    ) {
      const current = await this.findCustomerById(customerId, scopeTenantId);
      await this.assertBusinessNameForLegalPerson(
        updates.document_type_id ?? current.identification_type ?? undefined,
        updates.business_name ?? current.business_name ?? undefined,
      );
    }

    const setClause: string[] = [];
    const paramsArray: any[] = [];
    let index = 1;

    for (const key of updateKeys) {
      const colName = columnMap[key] ?? key;
      setClause.push(`"${colName}" = $${index}`);
      paramsArray.push(updates[key as keyof typeof updates]);
      index++;
    }

    paramsArray.push(customerId, scopeTenantId);
    const setString = setClause.join(', ');

    const queryString = `
      UPDATE general_schema.tenant_customer
      SET ${setString}
      WHERE tenant_customer_id = $${index}
        AND ($${index + 1}::uuid IS NULL OR tenant_id = $${index + 1})
      RETURNING
        tenant_customer_id AS customer_id, tenant_id,
        first_name, last_name, business_name,
        identification_type_id AS identification_type,
        document_number,
        econ_activity, email, phone, birthdate, address,
        customer_segment_id AS segment_id,
        is_tenant, is_wholesale, created_at, updated_at
    `;

    try {
      const res = await this.db.query(queryString, paramsArray);
      if (res.rows.length === 0)
        throw new NotFoundException('Customer not found');
      return res.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error('Error updating customer:', error);
      throw new InternalServerErrorException(error);
    }
  }

  async checkAvailability(
    tenantId: string,
    field: string,
    value: string,
    excludeId?: string,
  ): Promise<{ exists: boolean }> {
    const allowedFields: Record<string, string> = {
      document_number: 'document_number',
      email: 'email',
      phone: 'phone',
    };

    const column = allowedFields[field];
    if (!column) {
      throw new BadRequestException(
        `Field '${field}' no soportado. Use document_number | email | phone.`,
      );
    }
    if (!tenantId || !value) {
      throw new BadRequestException('tenant_id y value son requeridos');
    }

    const params: any[] = [tenantId, value];
    let query = `
      SELECT 1 FROM general_schema.tenant_customer
      WHERE tenant_id = $1 AND ${column} = $2
    `;
    if (excludeId) {
      params.push(excludeId);
      query += ` AND tenant_customer_id <> $3`;
    }
    query += ' LIMIT 1';

    const result = await this.db.query(query, params);
    return { exists: result.rows.length > 0 };
  }

  async deleteCustomer(customerId: string, scopeTenantId: string | null) {
    let deleted;
    try {
      deleted = await this.db.query(customer.delete, [
        customerId,
        scopeTenantId,
      ]);
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
    if (deleted.rows.length === 0) {
      throw new NotFoundException('Customer not found');
    }
    return { message: 'Customer deleted' };
  }

  async getCustomerDetail(customerId: string, scopeTenantId: string | null) {
    const { rows } = await this.db.query(customer.detail, [
      customerId,
      scopeTenantId,
    ]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException('Customer not found');
    }
    return rows[0];
  }

  async getCustomerSalesHistory(
    customerId: string,
    scopeTenantId: string | null,
    page = 1,
    limit = 10,
  ): Promise<{ sales: unknown[]; total: number; page: number; limit: number }> {
    // 404 si el cliente no es del tenant: el historial de ventas se pide solo
    // por id de cliente y no debe servir para leer ventas de otra empresa.
    await this.findCustomerById(customerId, scopeTenantId);
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      this.db.query(customer.salesHistory, [customerId, limit, offset]),
      this.db.query(customer.salesHistoryCount, [customerId]),
    ]);
    return {
      sales: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }
}
