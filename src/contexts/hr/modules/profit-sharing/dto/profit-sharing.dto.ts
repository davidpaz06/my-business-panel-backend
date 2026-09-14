import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreateProfitPeriodDto {
  @IsInt()
  fiscal_year!: number;

  @IsDateString()
  fiscal_year_start!: string;

  @IsDateString()
  fiscal_year_end!: string;

  @IsOptional()
  @IsBoolean()
  is_non_profit?: boolean;
}

export class SetLiquidBenefitsDto {
  @IsNumber()
  @Min(0)
  liquid_benefits!: number;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdatePercentageDto {
  @IsNumber()
  distribution_percentage!: number;
}

export class YearEndBonusDto {
  @IsUUID()
  employee_id!: string;

  @IsInt()
  fiscal_year!: number;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  paid_at!: string;
}
