import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateOvertimeDto {
  @IsUUID()
  employee_id!: string;

  @IsUUID()
  branch_id!: string;

  @IsDateString()
  work_date!: string;

  /** nocturna (Art. 117) | extra (Art. 118) | feriado (Art. 120) | descanso (Arts. 120, 188) */
  @IsIn(['nocturna', 'extra', 'feriado', 'descanso'])
  kind!: 'nocturna' | 'extra' | 'feriado' | 'descanso';

  @IsNumber()
  @IsPositive()
  hours!: number;

  /**
   * Solo aplica a kind='extra'. Sin autorizacion el recargo se
   * DUPLICA (Art. 182). Default false (peor caso, mas protector).
   */
  @IsOptional()
  @IsBoolean()
  inspectoria_authorized?: boolean;

  @IsOptional()
  @IsString()
  authorization_ref?: string;
}

export class ValidateOvertimeDto {
  @IsUUID()
  employee_id!: string;

  @IsDateString()
  work_date!: string;

  @IsNumber()
  @IsPositive()
  hours!: number;
}
