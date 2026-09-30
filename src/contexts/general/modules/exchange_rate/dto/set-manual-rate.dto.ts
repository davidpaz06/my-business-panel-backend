import { Type } from 'class-transformer';
import { IsNumber, IsPositive } from 'class-validator';

export class SetManualRateDto {
  /**
   * Tasa USD -> VES fija del tenant. Solo se aplica mientras el tenant tenga
   * la actualizacion automatica desactivada.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate!: number;
}
