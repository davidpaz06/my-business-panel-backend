import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSettlementDto {
  @IsUUID()
  employee_id!: string;

  @IsDateString()
  termination_date!: string;
}

export class PaySettlementDto {
  @IsDateString()
  payment_date!: string;
}

export class VoidSettlementDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
