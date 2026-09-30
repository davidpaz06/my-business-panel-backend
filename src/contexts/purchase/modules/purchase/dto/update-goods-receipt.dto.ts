import { IsUUID, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GoodsReceiptItemDto {
  @ApiProperty({ description: 'UUID del producto recibido.' })
  @IsUUID()
  product_variant_id!: string;

  @ApiProperty({
    description:
      'Cantidad realmente recibida (puede diferir de lo pedido: mercancia danada, faltante, o distinta a lo pedido).',
  })
  @IsInt()
  @Min(0)
  quantity_received!: number;
}

export class UpdateGoodsReceiptDto {
  @ApiProperty({ type: [GoodsReceiptItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
}
