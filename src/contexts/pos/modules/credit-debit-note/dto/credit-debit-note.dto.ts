import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
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
}

export class VoidCreditDebitNoteDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
