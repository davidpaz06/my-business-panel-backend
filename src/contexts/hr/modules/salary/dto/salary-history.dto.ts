import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateSalaryHistoryDto {
  @IsUUID()
  employee_id!: string;

  @IsNumber()
  @IsPositive()
  monthly_salary!: number;

  @IsDateString()
  valid_from!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
