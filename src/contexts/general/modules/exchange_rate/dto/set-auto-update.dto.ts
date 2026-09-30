import { IsBoolean } from 'class-validator';

export class SetAutoUpdateDto {
  /**
   * true: el tenant sigue la tasa base del BCV (+ su diferencial).
   * false: el tenant usa su tasa manual y no le afecta la sincronizacion.
   */
  @IsBoolean()
  auto_update!: boolean;
}
