import { Type } from 'class-transformer';
import {
  IsUUID,
  IsNumber,
  Min,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { registerPaymentDoc } from '@/docs/contexts/purchase/purchase';

export class CreatePaymentDto {
  @ApiProperty(registerPaymentDoc.dto.purchase_account_payable_id)
  @IsUUID()
  purchase_account_payable_id!: string;

  @ApiProperty(registerPaymentDoc.dto.amount_paid)
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount_paid!: number;

  @ApiProperty(registerPaymentDoc.dto.payment_method_id)
  @Type(() => Number)
  @IsInt()
  payment_method_id!: number;

  @ApiProperty({
    description:
      'Currency ID (from general_schema.currency). Defaults to 2 (USD), la moneda base de Compras/CxP.',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  currency_id?: number;

  @ApiProperty(registerPaymentDoc.dto.payment_reference)
  @IsOptional()
  @IsString()
  payment_reference?: string;
}
