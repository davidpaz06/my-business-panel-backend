import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsPositive,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SupplierInvoiceItemDto {
  @ApiProperty({ description: 'UUID del producto facturado.' })
  @IsUUID()
  product_variant_id!: string;

  @ApiProperty({ description: 'Cantidad facturada.' })
  @IsPositive()
  quantity_billed!: number;

  @ApiProperty({
    description:
      'Costo unitario facturado por el proveedor (correccion real de la factura, distinto del snapshot de la orden).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  unit_price!: number;
}

export class UpdateSupplierInvoiceDto {
  @ApiProperty({ type: [SupplierInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceItemDto)
  items!: SupplierInvoiceItemDto[];
}
