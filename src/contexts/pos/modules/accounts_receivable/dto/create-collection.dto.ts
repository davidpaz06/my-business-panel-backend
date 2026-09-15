import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateCollectionDto {
  @IsUUID()
  sale_account_receivable_id!: string;

  // CRC-equivalent (base currency). Used by SUM-based recalc.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.01)
  amount_paid!: number;

  @Type(() => Number)
  @IsInt()
  payment_method_id!: number;

  // Currency the customer actually paid in.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  currency_id?: number;

  // Amount stated in currency_id (the cash the customer handed over).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.01)
  original_amount?: number;

  // Rate used to convert original_amount → amount_paid (CRC).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  exchange_rate?: number;

  @IsOptional()
  @IsString()
  payment_reference?: string;
}
