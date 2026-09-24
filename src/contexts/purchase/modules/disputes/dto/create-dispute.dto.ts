import { IsUUID, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PurchaseDisputeType {
  MISSING_GOODS = 'MISSING_GOODS',
  PRICE_MISMATCH = 'PRICE_MISMATCH',
}

export class CreateDisputeDto {
  @ApiProperty({ description: 'UUID de la orden de compra en disputa.' })
  @IsUUID()
  purchase_order_id!: string;

  @ApiProperty({
    description: 'UUID de la factura relacionada (opcional).',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  supplier_invoice_id?: string;

  @ApiProperty({
    description:
      'Tipo de discrepancia: mercancia incompleta o precio distinto al pactado.',
    enum: PurchaseDisputeType,
  })
  @IsEnum(PurchaseDisputeType)
  dispute_type!: PurchaseDisputeType;

  @ApiProperty({ description: 'Descripcion detallada de la discrepancia.' })
  @IsNotEmpty()
  description!: string;
}
