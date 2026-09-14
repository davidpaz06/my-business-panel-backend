import { IsDateString, IsInt, IsNotEmpty, IsUUID } from 'class-validator';

export class CreatePaysheetDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsDateString()
  @IsNotEmpty()
  periodStart!: string;

  @IsDateString()
  @IsNotEmpty()
  periodEnd!: string;
}

export class ProcessPaysheetDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsDateString()
  @IsNotEmpty()
  period_start!: string;

  @IsDateString()
  @IsNotEmpty()
  period_end!: string;

  /** general_schema.payment_method.payment_method_id de esta corrida. */
  @IsInt()
  payment_method_id!: number;
}
