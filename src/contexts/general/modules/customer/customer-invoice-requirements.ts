// Tipos de documento de persona juridica (J = RIF juridico, G = ente
// gubernamental, C = consejo comunal): se facturan por razon social.
const LEGAL_PERSON_CODES = ['J', 'G', 'C'];

export interface CustomerInvoiceData {
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  document_number?: string | null;
  address?: string | null;
  identification_type_code?: string | null;
}

export const isLegalPerson = (code?: string | null): boolean =>
  !!code && LEGAL_PERSON_CODES.includes(code.toUpperCase());

const isBlank = (value?: string | null): boolean =>
  !value || value.trim().length === 0;

/**
 * Campos que faltan para poder emitir una factura a este cliente (datos del
 * comprador obligatorios). Lista vacia = el cliente esta completo.
 */
export function missingInvoiceFields(customer: CustomerInvoiceData): string[] {
  const missing: string[] = [];

  if (isBlank(customer.document_number)) missing.push('documento (RIF/cedula)');

  if (isLegalPerson(customer.identification_type_code)) {
    if (isBlank(customer.business_name)) missing.push('razon social');
  } else if (isBlank(customer.first_name) || isBlank(customer.last_name)) {
    missing.push('nombre y apellido');
  }

  if (isBlank(customer.address)) missing.push('direccion');

  return missing;
}
