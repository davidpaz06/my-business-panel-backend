export interface CashRegister {
  cash_register_id: string;
  branch_id: string;
  is_active: boolean;
  // Solo admin y superusuario reciben la clave; el resto recibe null y
  // `requires_key` indica si la caja la exige al abrir/cerrar sesion.
  cash_register_key?: string | null;
  requires_key?: boolean;
}
