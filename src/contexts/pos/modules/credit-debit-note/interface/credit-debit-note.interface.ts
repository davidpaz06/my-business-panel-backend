export type CreditDebitNoteType = 'credit' | 'debit';

export type CreditDebitNoteReasonKind =
  | 'devolucion'
  | 'descuento'
  | 'error'
  | 'mercancia_danada'
  | 'mora'
  | 'cargo_adicional'
  | 'otro';

export interface CreditDebitNote {
  note_id: string;
  note_number: number;
  tenant_id: string;
  invoice_id: string;
  note_type: CreditDebitNoteType;
  reason_kind: CreditDebitNoteReasonKind;
  description: string | null;
  amount: string;
  currency_id: number | null;
  is_voided: boolean;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceContextForNote {
  invoice_id: string;
  total_amount: string;
  tenant_customer_id: string | null;
  sale_id: string;
  branch_id: string;
  tenant_id: string;
  sale_account_receivable_id: string | null;
  account_receivable_id: string | null;
  subtotal: string | null;
  ar_tax_amount: string;
  amount_paid: string | null;
}
