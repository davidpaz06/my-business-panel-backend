import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Candado contra regresiones de aislamiento: todo controller debe declarar
 * AuthenticationGuard, salvo los de esta lista.
 *
 *  - PUBLIC_BY_DESIGN: endpoints publicos legitimos (health, webhooks).
 *  - NOT_YET_AUDITED: fuera del alcance de la auditoria del modulo POS; hay
 *    que revisar cada uno (catalogos publicos vs datos de tenant) y sacarlo de
 *    la lista. La lista solo puede ENCOGER: un controller nuevo sin guard
 *    hace fallar este test.
 *  - Los controllers del POS ya no figuran: cada fase del plan de aislamiento
 *    saca el suyo de aqui.
 */
const PUBLIC_BY_DESIGN = ['app/app.controller.ts'];

const NOT_YET_AUDITED = [
  'contexts/finances/modules/iva/iva.controller.ts',
  'contexts/general/modules/attribute_value/attribute-value.controller.ts',
  'contexts/general/modules/customer_payment/customer-payment.controller.ts',
  'contexts/general/modules/customer_segment_margin/customer_segment_margin.controller.ts',
  'contexts/general/modules/global_attribute/global-attribute.controller.ts',
  'contexts/general/modules/identification-type/identification-type.controller.ts',
  'contexts/general/modules/region/region.controller.ts',
  'contexts/general/modules/segment/segment.controller.ts',
  'contexts/general/modules/stripe/stripe.controller.ts',
  'contexts/general/modules/subscription/subscription.controller.ts',
  'contexts/general/modules/tenant/tenant.controller.ts',
  'contexts/general/modules/tenant_attribute/tenant-attribute.controller.ts',
  'contexts/general/modules/tenant_product_group/tenant-product-group.controller.ts',
  'contexts/general/modules/tenant_product_group_type/tenant-product-group-type.controller.ts',
];

// POS pendiente de su fase (se elimina de aqui al cerrarla).
const POS_PENDING_PHASE = [
  'contexts/pos/modules/invoice/invoice.controller.ts',
  'contexts/pos/modules/loyal-program/loyalty-program.controller.ts',
  'contexts/pos/modules/returns/returns.controller.ts',
  'contexts/pos/modules/sale-item/sale-item.controller.ts',
];

const SRC = join(__dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

describe('controllers: AuthenticationGuard obligatorio', () => {
  const allowed = new Set([
    ...PUBLIC_BY_DESIGN,
    ...NOT_YET_AUDITED,
    ...POS_PENDING_PHASE,
  ]);

  const files = controllerFiles(SRC).map((f) => ({
    path: relative(SRC, f).split(sep).join('/'),
    source: readFileSync(f, 'utf8'),
  }));

  it('encuentra controllers', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('ningun controller nuevo queda sin AuthenticationGuard', () => {
    const unguarded = files
      .filter((f) => !f.source.includes('AuthenticationGuard'))
      .map((f) => f.path)
      .filter((p) => !allowed.has(p));
    expect(unguarded).toEqual([]);
  });

  it('las listas de excepciones no tienen entradas obsoletas', () => {
    const stale = [...allowed].filter((p) => {
      const file = files.find((f) => f.path === p);
      return !file || file.source.includes('AuthenticationGuard');
    });
    expect(stale).toEqual([]);
  });
});
