import {
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  IsPositive,
  IsNumber,
  IsOptional,
  IsEnum,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { createPurchaseOrderDoc } from '@/docs/contexts/purchase/purchase';

export enum PurchasePaymentCondition {
  CREDIT = 'CREDIT',
  IN_FULL = 'IN_FULL',
}

export class PurchaseOrderItemDto {
  @IsUUID()
  product_variant_id!: string;

  @IsPositive()
  quantity_ordered!: number;

  /**
   * @deprecated El costo ya no se recibe del cliente: create_purchase_order()
   * lo resuelve server-side desde general_schema.product_variant.cost_price
   * (USD). Se mantiene opcional/ignorado durante la transicion.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  unit_price?: number;
}

export class CreatePurchaseDto {
  @ApiProperty(createPurchaseOrderDoc.dto.supplier_id)
  @IsUUID()
  supplier_id!: string;

  @ApiProperty(createPurchaseOrderDoc.dto.warehouse_id)
  @IsUUID()
  warehouse_id!: string;

  @ApiProperty(createPurchaseOrderDoc.dto.expected_delivery_date)
  @IsDateString()
  expected_delivery_date!: string;

  @ApiProperty(createPurchaseOrderDoc.dto.items)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];

  @ApiProperty(createPurchaseOrderDoc.dto.has_invoice)
  @IsOptional()
  has_invoice?: boolean;

  @ApiProperty(createPurchaseOrderDoc.dto.payment_condition)
  @IsOptional()
  @IsEnum(PurchasePaymentCondition)
  payment_condition?: PurchasePaymentCondition;

  @ApiProperty(createPurchaseOrderDoc.dto.payment_due_date)
  @ValidateIf((o) => o.payment_condition === PurchasePaymentCondition.CREDIT)
  @IsNotEmpty()
  @IsDateString()
  payment_due_date?: string;
}
