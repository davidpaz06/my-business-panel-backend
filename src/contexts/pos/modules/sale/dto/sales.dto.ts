import { Payment } from '@/contexts/general/modules/customer_payment/interface/payments.interface';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Item } from '../../sale-item/interface/sale-item.interface';

export class NewSingleSaleDto {
  @IsNotEmpty()
  @IsUUID()
  branch_id!: string;

  @IsOptional()
  @IsUUID()
  tenant_customer_id?: string | null;

  @IsOptional()
  @IsUUID()
  cash_register_id?: string;

  @IsNotEmpty()
  @IsString()
  sale_condition!: string;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  sale_date!: Date;

  @IsNotEmpty()
  @IsNumber()
  currency_id!: number;

  @IsNotEmpty()
  @IsNumber()
  subtotal_amount!: number;

  @IsNotEmpty()
  @IsNumber()
  tax_amount!: number;

  @IsNotEmpty()
  @IsNumber()
  total_amount!: number;

  @IsBoolean()
  is_completed!: boolean;
}

export class FullSaleDto {
  @IsNotEmpty()
  @IsUUID()
  branch_id!: string;

  @IsNotEmpty()
  @IsNumber()
  currency_id!: number;

  @IsNotEmpty()
  @IsUUID()
  tenant_id!: string;

  @IsOptional()
  @IsUUID()
  tenant_customer_id?: string | null;

  @IsOptional()
  @IsUUID()
  cash_register_id?: string;

  @IsNotEmpty()
  @IsString()
  sale_condition!: string;

  @IsNotEmpty()
  @IsString()
  sale_date!: string;

  @IsNotEmpty()
  @IsNumber()
  total_amount!: number;

  @IsNotEmpty()
  @IsNumber()
  subtotal_amount!: number;

  @IsNotEmpty()
  @IsNumber()
  tax_amount!: number;

  @IsNotEmpty()
  @IsBoolean()
  is_completed!: boolean;

  @IsNotEmpty()
  @IsArray()
  items!: Item[];

  @IsOptional()
  @IsUUID()
  seller_user_id?: string;

  @IsOptional()
  @IsUUID()
  cash_register_session_id?: string;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsString()
  ad_message?: string;

  @IsOptional()
  @IsNumber()
  amount_paid?: number;

  @IsOptional()
  @IsNumber()
  change_amount?: number;

  @IsNotEmpty()
  @IsArray()
  payments!: Payment[];
}
