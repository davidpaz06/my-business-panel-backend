export interface Product {
  product_variant_id: string;
  tenant_id: string;
  sku: string;
  variant_name: string;
  product_id?: string;
  unit_price: number;
  cost_price?: number;
  weighted_avg_cost?: number;
  is_active: boolean;
  is_composite: boolean;
  supplier_id?: string;
  supplier_name?: string;
  giftable: boolean;
  giftable_from?: number;
  includes_iva: boolean;
  created_at?: string;
  updated_at?: string;
}
