import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Database from '@resonance-components/datahandler';

import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import { generalQueries } from '@general/general.queries';
import { CreateSpecialCodeDto } from './dto/create_special_code.dto';
import {
  SpecialCode,
  SpecialCodeListItem,
} from './interface/special_code.interface';

const { specialCode } = generalQueries;

type DbExecutor = Pick<Database, 'query'>;

@Injectable()
export class SpecialCodeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listAll(): Promise<SpecialCodeListItem[]> {
    const { rows } = await this.db.query(specialCode.listAll, []);
    return rows;
  }

  async create(
    dto: CreateSpecialCodeDto,
    createdByUserId: string,
  ): Promise<SpecialCode> {
    try {
      const { rows } = await this.db.query(specialCode.create, [
        dto.code,
        dto.description ?? null,
        createdByUserId,
        dto.expires_at ?? null,
      ]);
      return rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        // unique_violation: código duplicado
        throw new ConflictException(
          `El código "${dto.code}" ya existe. Elige uno distinto.`,
        );
      }
      throw err;
    }
  }

  async deleteUnused(specialCodeId: string): Promise<{ message: string }> {
    const { rows } = await this.db.query(specialCode.delete, [specialCodeId]);
    if (rows.length === 0) {
      throw new BadRequestException(
        'No se puede eliminar el código: no existe o ya fue canjeado.',
      );
    }
    return { message: 'Código especial eliminado' };
  }

  /**
   * Lookup pasivo del código (no lo consume). Devuelve `null` si no
   * existe. El frontend lo usa para validar la entrada del campo antes
   * de enviar el onboarding.
   */
  async findByCode(rawCode: string): Promise<SpecialCode | null> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return null;
    const { rows } = await this.db.query(specialCode.byCode, [code]);
    return rows[0] ?? null;
  }

  /**
   * Validación pública (sin sesión): se usa antes de comprometer al
   * usuario al onboarding. NO marca el código como consumido — eso lo
   * hace `consume` dentro de la transacción de creación de tenant.
   */
  async validateForOnboarding(rawCode: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'already_used' | 'expired';
  }> {
    const found = await this.findByCode(rawCode);
    if (!found) return { valid: false, reason: 'not_found' };
    if (found.is_used) return { valid: false, reason: 'already_used' };
    if (found.expires_at && new Date(found.expires_at) <= new Date()) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true };
  }

  /**
   * Marca el código como consumido. Debe ejecutarse dentro de la misma
   * transacción que crea el tenant para que un fallo posterior haga
   * rollback del canje. Usa una sentencia atómica
   * (`UPDATE ... WHERE is_used = FALSE`) para impedir doble canje incluso
   * bajo concurrencia.
   */
  async consume(
    rawCode: string,
    tenantId: string,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    const { rows } = await executor.query(specialCode.consume, [
      code,
      tenantId,
    ]);
    if (rows.length === 0) {
      // Código inexistente, ya consumido o vencido
      const probe = await this.findByCode(code);
      if (!probe) {
        throw new NotFoundException('El código especial no existe.');
      }
      if (probe.is_used) {
        throw new BadRequestException(
          'Este código especial ya fue canjeado por otro registro.',
        );
      }
      if (probe.expires_at && new Date(probe.expires_at) <= new Date()) {
        throw new BadRequestException(
          'Este código especial expiró y ya no se puede canjear.',
        );
      }
      throw new BadRequestException('No se pudo canjear el código especial.');
    }
  }
}
