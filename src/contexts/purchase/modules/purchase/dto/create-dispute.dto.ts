import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DisputeType {
  MISSING_GOODS = 'MISSING_GOODS',
  PRICE_MISMATCH = 'PRICE_MISMATCH',
}

export class CreateDisputeDto {
  @ApiProperty({ description: 'Orden de compra afectada.' })
  @IsUUID()
  purchase_order_id!: string;

  @ApiProperty({ required: false, description: 'Factura asociada, si aplica.' })
  @IsOptional()
  @IsUUID()
  supplier_invoice_id?: string;

  @ApiProperty({ enum: DisputeType })
  @IsEnum(DisputeType)
  dispute_type!: DisputeType;

  @ApiProperty({ description: 'Descripcion de la discrepancia.' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}
