import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

// El tenant del tipo de gasto NO viaja en el body: se toma de la sesion.
export class CreateExpenseTypeDto {
  @IsString()
  @IsNotEmpty()
  expense_type_name!: string;

  @IsString()
  @IsOptional()
  expense_type_detail?: string;
}

export class CreateExpenseDto {
  @IsUUID()
  expense_type_id!: string;

  @IsNumber()
  @Min(0.01)
  expense_amount!: number;

  @IsUUID()
  branch_id!: string;
}

export class UpdateExpenseStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: 'approved' | 'rejected' | 'cancelled';

  @IsString()
  @IsOptional()
  rejection_reason?: string;
}
