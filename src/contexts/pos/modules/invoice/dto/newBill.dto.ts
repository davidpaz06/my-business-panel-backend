import { IsDate, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class NewBillDto {
  @IsOptional()
  @IsUUID()
  tenant_customer_id?: string | null;

  @IsNumber()
  currency_id!: number;

  @IsNumber()
  subtotal_amount!: number;

  @IsNumber()
  tax_amount!: number;

  @IsNumber()
  total_amount!: number;
}
