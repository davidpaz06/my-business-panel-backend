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

export class CreateDeductionDto {
  @IsUUID()
  employee_id!: string;

  @IsIn(['deuda_patrono', 'sindical', 'alimentaria', 'otra'])
  kind!: 'deuda_patrono' | 'sindical' | 'alimentaria' | 'otra';

  @IsString()
  description!: string;

  @IsNumber()
  @IsPositive()
  total_amount!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  installment_amount?: number;

  @IsOptional()
  @IsString()
  union_organization?: string;

  @IsOptional()
  @IsBoolean()
  authorized?: boolean;

  @IsOptional()
  @IsDateString()
  authorization_date?: string;

  @IsOptional()
  @IsString()
  authorization_ref?: string;

  @IsDateString()
  start_date!: string;
}

export class UpdateDeductionDto {
  @IsOptional()
  @IsBoolean()
  authorized?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  outstanding_balance?: number;
}

export class ApplyDeductionPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  applied_at!: string;
}
