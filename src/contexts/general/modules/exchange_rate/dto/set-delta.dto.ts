import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetDeltaDto {
  /**
   * Monto en VES que el tenant suma (o resta, si es negativo) a la tasa
   * base. 0 restablece: el tenant opera a la tasa base pelada.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  delta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  source?: string;
}
