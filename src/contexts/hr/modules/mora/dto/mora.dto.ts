import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
} from 'class-validator';

export class CalculateMoraDto {
  @IsNumber()
  @IsPositive()
  debt_amount!: number;

  @IsDateString()
  due_from!: string;

  @IsInt()
  @Min(0)
  grace_days!: number;

  @IsDateString()
  payment_date!: string;

  @IsIn(['prestaciones', 'salario', 'salario_minimo'])
  debt_kind!: 'prestaciones' | 'salario' | 'salario_minimo';

  @IsOptional()
  explain?: boolean;
}

export class SalaryMinimumDifferenceDto {
  @IsUUID()
  employee_id!: string;

  @IsNumber()
  @IsPositive()
  paid_monthly!: number;

  @IsDateString()
  period_from!: string;

  @IsDateString()
  period_to!: string;

  @IsDateString()
  payment_date!: string;
}
