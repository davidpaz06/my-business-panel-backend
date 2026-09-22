import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateBeneficiaryDto {
  @IsUUID()
  employee_id!: string;

  @IsString()
  full_name!: string;

  @IsString()
  doc_number!: string;

  @IsIn([
    'hijo',
    'conyuge',
    'pareja_estable',
    'padre',
    'madre',
    'nieto_huerfano',
  ])
  relationship!: string;

  @IsDateString()
  claim_date!: string;
}

export class ValidateBeneficiaryDto {
  @IsDateString()
  validated_at!: string;
}

export class DistributeSettlementDto {
  @IsUUID()
  settlement_id!: string;

  @IsOptional()
  @IsBoolean()
  recalculate?: boolean;
}
