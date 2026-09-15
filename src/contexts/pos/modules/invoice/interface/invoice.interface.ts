export interface DInvoice {
  tenant_customer_id: string | null;
  currency_id: number;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  due_date?: Date | null;
  cash_register_session_id?: string | null;
  points_accumulated?: number;
  ad_message?: string | null;
  amount_paid?: number;
  change_amount?: number;
  invoiced_at: Date;
  updated_at: Date;
  sale_id: string;
}

export interface FullInvoiceItem {
  digital_sale_invoice_item_id: string;
  description: string | null;
  sku: string | null;
  variant_name: string | null;
  cabys_code: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  tax_rate_percentage: number;
  tax_amount: number;
  total_price: number;
}

export interface FullInvoicePayment {
  customer_payment_id: string;
  payment_method_id: number | null;
  payment_method_name: string | null;
  is_points_redemption: boolean;
  points_redeemed: number;
  payment_amount: number;
  currency_id: number | null;
  currency_code: string | null;
  currency_symbol: string | null;
  payment_date: string;
}

export interface FullInvoice {
  digital_sale_invoice_id: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_amount: number;
  points_accumulated: number;
  points_redeemed: number;
  total_discount: number;
  ad_message: string | null;
  due_date: string | null;
  invoiced_at: Date | string;
  first_name: string | null;
  last_name: string | null;
  document_number: string | null;
  email: string | null;
  customer_econ_activity: string | null;
  customer_phone: string | null;
  customer_birthdate: string | null;
  customer_address: string | null;
  customer_identification_type_name: string | null;
  customer_identification_type_code: string | null;
  tenant_name: string | null;
  tenant_identification: string | null;
  tenant_econ_activity: string | null;
  tenant_sign: string | null;
  tenant_contact_email: string | null;
  tenant_contact_phone: string | null;
  tenant_identification_type_name: string | null;
  tenant_identification_type_code: string | null;
  branch_name: string | null;
  branch_address: string | null;
  sale_condition: string | null;
  sale_condition_desc: string | null;
  sale_date: string;
  has_electronic_invoice: boolean;
  seller_user_id: string | null;
  seller_email: string | null;
  currency_code: string | null;
  currency_symbol: string | null;
  items: FullInvoiceItem[];
  payments: FullInvoicePayment[];
}

export interface InvoiceDB {
  tenant_name: string;
  first_name: string;
  last_name: string;
  document_number: string;
  email: string;
  subtotal_amount: number;
  total_amount: number;
  invoiced_at: string | any;
}
