import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePayrollParameterDto {
  @IsString()
  param_key!: string;

  @IsNumber()
  @Min(0)
  param_value!: number;

  @IsDateString()
  valid_from!: string;

  @IsOptional()
  @IsString()
  source?: string;
}
