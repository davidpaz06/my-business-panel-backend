import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { createEmployeeDoc } from '@/docs/contexts/hr/employee';

export class ContractDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  hours?: number;

  @IsOptional()
  @IsNumber()
  base_salary?: number;

  @IsOptional()
  @IsNumber()
  duties_type_id?: number;

  @IsOptional()
  @IsNumber()
  turn_type?: number;

  @IsOptional()
  @IsNumber()
  turn_id?: number;

  /** Tipo de jornada (Art. 173 LOTTT): diurna, nocturna, mixta. */
  @IsOptional()
  @IsIn(['diurna', 'nocturna', 'mixta'])
  journey_type?: string;

  /** Horas semanales pactadas. Validadas contra JOURNEY_LIMITS (Art. 173). */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weekly_hours?: number;
}

export class NewEmployeeDto {
  @ApiProperty(createEmployeeDoc.dto.user_id)
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiProperty(createEmployeeDoc.dto.tenant_id)
  @IsUUID()
  tenant_id!: string;

  @ApiProperty(createEmployeeDoc.dto.branch_id)
  @IsUUID()
  branch_id!: string;

  @ApiProperty(createEmployeeDoc.dto.first_name)
  @IsString()
  first_name!: string;

  @ApiProperty(createEmployeeDoc.dto.last_name)
  @IsString()
  last_name!: string;

  @ApiProperty(createEmployeeDoc.dto.doc_number)
  @IsString()
  doc_number!: string;

  @IsOptional()
  @IsNumber()
  identification_type_id?: number;

  @ApiProperty(createEmployeeDoc.dto.phone)
  @IsString()
  phone!: string;

  @ApiProperty(createEmployeeDoc.dto.email)
  @IsEmail()
  email!: string;

  @ApiProperty(createEmployeeDoc.dto.payment_schedule_id)
  @IsNumber()
  payment_schedule_id!: number;

  @ApiProperty(createEmployeeDoc.dto.contractData)
  @ValidateNested()
  @Type(() => ContractDto)
  contractData!: ContractDto;
}

export class CreateUserEmployeeInfoDto {
  @IsUUID()
  tenant_id!: string;

  @IsUUID()
  branch_id!: string;

  @IsString()
  first_name!: string;

  @IsString()
  last_name!: string;

  @IsString()
  doc_number!: string;

  @IsOptional()
  @IsNumber()
  identification_type_id?: number;

  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsNumber()
  payment_schedule_id!: number;

  @ValidateNested()
  @Type(() => ContractDto)
  contractData!: ContractDto;
}

export class NewSingleEmployeeDto {
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsUUID()
  tenant_id!: string;

  @IsString()
  first_name!: string;

  @IsString()
  last_name!: string;

  @IsString()
  doc_number!: string;

  @IsOptional()
  @IsNumber()
  identification_type_id?: number;

  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsNumber()
  payment_schedule_id!: number;
}
