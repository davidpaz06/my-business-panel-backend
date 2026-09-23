import {
  ArrayMinSize,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductInsertDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewProductDto)
  products!: NewProductDto[];
}

export class NewProductDto {
  @IsUUID()
  tenant_id!: string;

  @IsString()
  sku!: string;

  @IsString()
  variant_name!: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsNumber()
  unit_price!: number;

  @IsOptional()
  @IsNumber()
  cost_price?: number;

  @IsOptional()
  @IsUUID()
  supplier_id?: string | null;

  @IsOptional()
  @IsBoolean()
  giftable?: boolean;

  @IsOptional()
  @IsNumber()
  giftable_from?: number;

  @IsOptional()
  @IsBoolean()
  includes_iva?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attribute_value_ids?: string[];

  /**
   * Familia/dimensión obligatoria (spec Venezuela: no se puede guardar un
   * producto sin clasificar). En UpdateProductDto (PartialType) el campo se
   * vuelve opcional, pero si se envia debe seguir trayendo al menos 1 id --
   * asi una edicion parcial que no toca clasificacion puede omitirlo, pero
   * no puede mandarlo vacio para borrarla.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe asignar al menos una familia o dimensión' })
  @IsUUID('4', { each: true })
  group_ids!: string[];
}

export interface ProductInsert {
  tenant_id: string;
  sku: string;
  variant_name: string;
  product_id?: string;
  unit_price: number;
  cost_price?: number;
  supplier_id?: string;
  giftable?: boolean;
  giftable_from?: number;
  includes_iva?: boolean;
  attribute_value_ids?: string[];
  group_ids?: string[];
}
