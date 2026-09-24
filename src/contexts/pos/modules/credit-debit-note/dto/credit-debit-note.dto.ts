import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

const REASON_KINDS = [
  'devolucion',
  'descuento',
  'error',
  'mercancia_danada',
  'mora',
  'cargo_adicional',
  'otro',
];

export class CreateCreditDebitNoteDto {
  @IsUUID()
  invoice_id!: string;

  @IsIn(['credit', 'debit'])
  note_type!: 'credit' | 'debit';

  @IsIn(REASON_KINDS)
  reason_kind!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsNumber()
  currency_id?: number;

  /**
   * Proveedor a acreditar cuando reason_kind = 'mercancia_danada' (nota de
   * credito). La nota es a nivel de factura completa, no de item, asi que no
   * se puede inferir con certeza cual proveedor origino la mercancia danada
   * -- lo selecciona quien registra la nota. Ver
   * migrations/purchase/035-supplier-credit-from-damaged-goods.sql.
   */
  @ValidateIf(
    (o) => o.reason_kind === 'mercancia_danada' && o.note_type === 'credit',
  )
  @IsNotEmpty()
  @IsUUID()
  supplier_id?: string;
}

export class VoidCreditDebitNoteDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
