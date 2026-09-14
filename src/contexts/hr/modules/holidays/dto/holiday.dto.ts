import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateHolidayDto {
  @IsString()
  holiday_name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsInt()
  holiday_year?: number;

  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;

  /** ley | ejecutivo | estadal | municipal (Art. 184). Declarados: tope 3/anio. */
  @IsIn(['ley', 'ejecutivo', 'estadal', 'municipal'])
  source!: 'ley' | 'ejecutivo' | 'estadal' | 'municipal';
}
