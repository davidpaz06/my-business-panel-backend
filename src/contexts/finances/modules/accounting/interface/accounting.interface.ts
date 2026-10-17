export interface AccountFromDb {
  account_id: string;
  tenant_id: string;
  account_code: string;
  account_name: string;
  account_type_id: number;
  type_name: string;
  nature: string;
  parent_account_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  cost_center_id: string | null;
  center_name: string | null;
  is_active: boolean;
  is_system: boolean;
  allows_transactions: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenterFromDb {
  cost_center_id: string;
  tenant_id: string;
  center_code: string;
  center_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryFromDb {
  entry_id: string;
  tenant_id: string;
  entry_number: number;
  source_type_id: number;
  source_name: string;
  source_id: string | null;
  entry_date: string;
  description: string | null;
  status_id: number;
  status_name: string;
  total_debit: string;
  total_credit: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: JournalEntryLineFromDb[];
}

// -------------------------------------------------------
// Journal Generation Params (Phase 2)
// -------------------------------------------------------

// Moneda del documento de origen (1 = VES, 2 = USD). El asiento se registra en
// VES (moneda funcional) con la tasa de entryDate; default VES.
interface JournalCurrency {
  currencyId?: number;
}

/**
 * Como se cobro un monto, en la moneda del documento y ya neto de vuelto:
 * efectivo -> Caja General, tarjeta/transferencia/pago movil -> Bancos,
 * puntos de fidelidad -> Descuentos sobre Ventas.
 */
export interface JournalSettlement {
  cash: number;
  bank: number;
  points: number;
}

export interface SaleJournalParams extends JournalCurrency {
  tenantId: string;
  saleId: string;
  saleCondition: string; // '01' = contado, '02'+ = credito, '04' = apartado
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  /**
   * Lo cobrado al momento de registrar la venta. Lo que no cubre va a
   * Cuentas por Cobrar (credito, apartado o abono inicial parcial).
   * Sin settlement: contado -> todo a Caja; credito -> todo a CxC.
   */
  settlement?: JournalSettlement;
  entryDate: Date;
}

export interface CogsJournalParams {
  tenantId: string;
  saleId: string;
  /** Costo en USD (catalogo): se convierte a VES con la tasa de entryDate. */
  totalCost: number;
  entryDate: Date;
}

export interface PurchaseJournalParams extends JournalCurrency {
  tenantId: string;
  purchaseOrderId: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  entryDate: Date;
}

export interface PaymentJournalParams extends JournalCurrency {
  tenantId: string;
  sourceId: string;
  amount: number;
  /** Cobros: reparto por medio de pago. Sin el, todo a Bancos. */
  settlement?: JournalSettlement;
  /** Pagos a proveedor: 1 (efectivo) sale de Caja, el resto de Bancos. */
  paymentMethodId?: number | null;
  entryDate: Date;
  description?: string;
}

export interface ExpenseJournalParams extends JournalCurrency {
  tenantId: string;
  expenseId: string;
  accountCode: string; // from expense_category → chart of accounts
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: string; // CASH, BANK, CREDIT_CARD, CHECK, TRANSFER
  entryDate: Date;
  description?: string;
}

export interface ReturnJournalParams extends JournalCurrency {
  tenantId: string;
  returnId: string;
  /** Devuelto sin IVA, en la moneda de la venta. */
  netAmount: number;
  /** IVA de lo devuelto. */
  taxAmount: number;
  /** Parte del reembolso que reduce lo que el cliente aun debe (CxC). */
  receivableCredit: number;
  /** Medio del reembolso: 1 (efectivo) o sin dato -> Caja; el resto -> Bancos. */
  refundMethodId?: number | null;
  entryDate: Date;
  description?: string;
}

export interface NoteJournalParams extends JournalCurrency {
  tenantId: string;
  noteId: string;
  noteType: 'credit' | 'debit';
  /** Monto de la nota sin IVA, en la moneda de la nota. */
  netAmount: number;
  taxAmount: number;
  /**
   * Solo notas de credito: parte que reduce la CxC abierta de la venta. El
   * resto queda a favor del cliente (Anticipos de Clientes).
   */
  receivableCredit: number;
  entryDate: Date;
  description?: string;
}

export interface WithholdingJournalParams extends JournalCurrency {
  tenantId: string;
  withholdingId: string;
  /** IVA retenido al proveedor, en la moneda del comprobante. */
  retainedAmount: number;
  entryDate: Date;
  description?: string;
}

export interface PayrollJournalParams {
  tenantId: string;
  paysheetId: string;
  totalEarnings: number;
  totalDeductions: number;
  netTotal: number;
  entryDate: Date;
}

export interface JournalEntryLineFromDb {
  line_id: string;
  entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  cost_center_id: string | null;
  center_name: string | null;
  debit_amount: string;
  credit_amount: string;
  description: string | null;
}
