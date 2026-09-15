import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { createBranchDoc } from '@/docs/contexts/general/branch';

export class CreateBranchDto {
  @ApiProperty(createBranchDoc.dto.tenant_id)
  @IsNotEmpty()
  @IsUUID()
  tenant_id!: string;

  @ApiProperty(createBranchDoc.dto.branch_name)
  @IsNotEmpty()
  @IsString()
  branch_name!: string;

  @ApiPropertyOptional(createBranchDoc.dto.address)
  @IsOptional()
  @IsString()
  branch_address?: string;

  @ApiPropertyOptional(createBranchDoc.dto.contact_email)
  @IsOptional()
  @IsString()
  contact_email?: string;

  @ApiProperty(createBranchDoc.dto.branch_number)
  @IsNotEmpty()
  @IsString()
  branch_number!: string;

  @ApiPropertyOptional(createBranchDoc.dto.is_main_branch)
  @IsOptional()
  @IsBoolean()
  is_main_branch: boolean = true;
}
