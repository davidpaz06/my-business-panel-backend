export interface Customer {
  tenant_customer_id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  business_name?: string | null;
  identification_type?: number | null;
  document_type_id: number;
  document_number: string;
  econ_activity: string;
  email: string;
  phone: string;
  birthdate?: string;
  address: string;
  is_wholesale?: boolean;
  created_at: Date;
  updated_at: Date;
}
