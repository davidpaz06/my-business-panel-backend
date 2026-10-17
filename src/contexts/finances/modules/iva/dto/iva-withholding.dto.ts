import { IsBoolean, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class IssueWithholdingDto {
  @IsUUID()
  supplier_invoice_id!: string;
}

export class SetWithholdingAgentDto {
  @IsBoolean()
  is_agent!: boolean;
}

export class SetSupplierRetentionDto {
  /** Porcentaje del IVA que se retiene al proveedor (0 = no se retiene). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  iva_retention_percentage!: number;
}
