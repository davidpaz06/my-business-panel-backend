import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { hrQueries } from '@hr/hr.queries';
import { CreateHolidayDto } from './dto/holiday.dto';

const { holidayLottt } = hrQueries;

/** Tope de feriados declarados por Ejecutivo/estados/municipios (Art. 184.d). */
const MAX_DECLARED_HOLIDAYS_PER_YEAR = 3;

@Injectable()
export class HolidaysService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByYear(tenantId: string, year: number, recurring?: boolean) {
    const result = await this.db.query(holidayLottt.listByYear, [
      year,
      tenantId,
    ]);

    if (recurring === undefined) return result.rows;
    return result.rows.filter((r) => r.is_recurring === recurring);
  }

  async checkDate(tenantId: string, date: string) {
    const result = await this.db.query(holidayLottt.checkDate, [
      date,
      tenantId,
    ]);

    if (result.rows.length) {
      const row = result.rows[0];
      return {
        isHoliday: true,
        name: row.holiday_name,
        source: row.source,
        article: '184',
      };
    }

    // Los domingos son feriados por ley (Art. 184.a); no se siembran
    // como filas, se resuelven por calculo de calendario.
    const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    if (isSunday) {
      return { isHoliday: true, reason: 'domingo (Art. 184)', article: '184' };
    }

    return { isHoliday: false };
  }

  async declaredCount(tenantId: string, year: number) {
    const result = await this.db.query(holidayLottt.countDeclared, [
      year,
      tenantId,
    ]);
    return {
      year,
      declaredCount: Number(result.rows[0].total),
      maxAllowed: MAX_DECLARED_HOLIDAYS_PER_YEAR,
      article: '184',
    };
  }

  async create(tenantId: string, dto: CreateHolidayDto) {
    if (dto.source !== 'ley') {
      // dto.date llega como 'YYYY-MM-DD': tomar el anio del texto evita
      // que la zona horaria del servidor corra la fecha un dia.
      const year = dto.holiday_year ?? Number(dto.date.slice(0, 4));
      const countResult = await this.db.query(holidayLottt.countDeclared, [
        year,
        tenantId,
      ]);
      const current = Number(countResult.rows[0].total);

      if (current >= MAX_DECLARED_HOLIDAYS_PER_YEAR) {
        throw new BadRequestException(
          `Se alcanzo el tope de ${MAX_DECLARED_HOLIDAYS_PER_YEAR} feriados declarados por anio (Art. 184).`,
        );
      }
    }

    const result = await this.db.query(holidayLottt.create, [
      dto.date,
      dto.holiday_name,
      true,
      true,
      tenantId,
      dto.holiday_year ?? null,
      dto.is_recurring ?? false,
      dto.source,
    ]);

    return result.rows[0];
  }
}
