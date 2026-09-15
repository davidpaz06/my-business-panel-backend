import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class GenerateDepositsDto {
  @IsUUID()
  employee_id!: string;

  @IsDateString()
  until!: string;

  @IsIn(['fideicomiso', 'fondo_nacional', 'contabilidad'])
  location!: 'fideicomiso' | 'fondo_nacional' | 'contabilidad';
}

export class UpdateDepositDto {
  @IsBoolean()
  deposit_made!: boolean;

  @IsOptional()
  @IsDateString()
  deposit_date?: string;
}

export class GenerateInterestDto {
  @IsUUID()
  employee_id!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class SettleInterestDto {
  @IsUUID()
  employee_id!: string;

  @IsInt()
  year!: number;

  @IsBoolean()
  capitalize!: boolean;

  @IsOptional()
  @IsString()
  authorization_ref?: string;
}

export class CreateAdvanceDto {
  @IsUUID()
  employee_id!: string;

  @IsNumber()
  @IsPositive()
  requested_amount!: number;

  @IsIn(['vivienda', 'hipoteca', 'educacion', 'salud'])
  reason!: 'vivienda' | 'hipoteca' | 'educacion' | 'salud';

  @IsOptional()
  @IsString()
  reason_detail?: string;
}

export class ApproveAdvanceDto {
  @IsNumber()
  @IsPositive()
  approved_amount!: number;

  @IsDateString()
  resolution_date!: string;
}

export class RejectAdvanceDto {
  @IsDateString()
  resolution_date!: string;

  @IsOptional()
  @IsString()
  reason_detail?: string;
}
