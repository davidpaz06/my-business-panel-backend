import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class PromotionTargetDto {
  @IsIn(['VARIANT', 'GROUP'])
  target_type!: 'VARIANT' | 'GROUP';

  @IsUUID()
  target_id!: string;
}

export class PromoRulesDto {
  @IsOptional()
  @IsUUID()
  promotion_rule_id?: string;

  @IsOptional()
  @IsUUID()
  promotion_id?: string;

  @IsOptional()
  @IsNumber()
  discount_percentage?: number;

  @IsOptional()
  @IsNumber()
  discount_amount?: number;

  @IsOptional()
  @IsNumber()
  buy_quantity?: number;

  @IsOptional()
  @IsNumber()
  get_quantity?: number;

  @IsOptional()
  @IsNumber()
  get_discount_percentage?: number;

  @IsOptional()
  @IsNumber()
  min_quantity?: number;

  @IsOptional()
  @IsNumber()
  max_quantity?: number;

  @IsOptional()
  @IsNumber()
  tier_level?: number;

  @IsOptional()
  @IsNumber()
  tier_min_quantity?: number;

  @IsOptional()
  @IsNumber()
  tier_max_quantity?: number;

  @IsOptional()
  @IsNumber()
  tier_price?: number;

  @IsOptional()
  @IsNumber()
  tier_discount_percentage?: number;

  @IsOptional()
  @IsNumber()
  min_purchase_amount?: number;
}

// El tenant de la promocion NO viaja en el body: se toma de la sesion (y en el
// update no se puede reasignar a otro tenant).
export class NewPromoDto {
  @IsString()
  promotion_name!: string;

  @IsString()
  promotion_code!: string;

  @IsOptional()
  @IsString()
  promotion_description?: string;

  @IsNumber()
  promotion_type_id!: number;

  @IsOptional()
  @IsBoolean()
  is_universal?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  customer_segment_ids?: number[];

  @Type(() => Date)
  @IsDate()
  promotion_start_date!: Date;

  @Type(() => Date)
  @IsDate()
  promotion_end_date!: Date;

  @IsBoolean()
  is_active!: boolean;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_stackable?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromoRulesDto)
  rules?: PromoRulesDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];
}

export type PromoRules = PromoRulesDto;
