import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';

// El tenant de la regla NO viaja en el body: se toma de la sesion.
export class CreateRoyaltyRuleDto {
  @IsNumber()
  @Min(0.01)
  min_amount!: number;
}

export class UpdateRoyaltyRuleDto {
  @IsNumber()
  @Min(0.01)
  min_amount!: number;
}

export class SetRuleDimensionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tenant_product_group_type_ids!: string[];
}

export class CreateRoyaltyOptionDto {
  @IsUUID()
  @IsNotEmpty()
  royalty_rule_id!: string;

  @IsUUID()
  @IsNotEmpty()
  tenant_product_group_id!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateRoyaltyOptionDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class GetApplicableRulesDto {
  @IsUUID()
  @IsNotEmpty()
  tenant_id!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}
