import { Client } from 'pg';
import { cashFlowBucketsQuery, cashFlowSummaryQuery } from './modules/cash-flow/cash-flow.queries';
import { ivaQueries } from './modules/iva/iva.queries';
import {
  expenseComponents,
  notesComponents,
  returnsComponents,
  salesComponents,
} from './modules/profitability/profitability.queries';

/**
 * Pruebas de integracion de las consultas de Finanzas contra una DB real con
 * datos bimonetarios (FNZ-X-06).
 *
 * Se omiten sin FINANCES_INTEGRATION_DB_URL. Para correrlas, apuntar a una DB
 * local (nunca compartida) con el esquema al dia:
 *
 *   FINANCES_INTEGRATION_DB_URL=postgresql://postgres:***@localhost:5432/mybusinesspaneldb \
 *     npx jest src/contexts/finances/finances.integration.spec.ts
 *
 * Todo corre dentro de una transaccion que termina en ROLLBACK: la DB queda
 * igual. Los movimientos se fechan en 2001, antes de cualquier tasa real, y se
 * siembran dos tasas globales propias (40 en enero, 50 en febrero) para que el
 * resultado no dependa de los datos existentes.
 */
const DB_URL = process.env.FINANCES_INTEGRATION_DB_URL;
const suite = DB_URL ? describe : describe.skip;

const VES = 1;
const USD = 2;

// Fechas en UTC: 16:00Z = 12:00 en Caracas (UTC-4), el mismo dia local.
const JAN_15 = '2001-01-15T16:00:00Z'; // tasa 40
const FEB_15 = '2001-02-15T16:00:00Z'; // tasa 50
const FEB_20 = '2001-02-20';

suite('Finanzas: consultas contra DB con datos en VES y USD', () => {
  let db: Client;
  let tenantId: string;
  let branchId: string;

  const one = async <T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T> => {
    const { rows } = await db.query(sql, params);
    return rows[0] as T;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query('BEGIN');

    // Tasas globales: 40 desde enero, 50 desde febrero de 2001.
    await db.query(
      `INSERT INTO general_schema.exchange_rate (from_currency_id, to_currency_id, rate, effective_at)
       VALUES (2, 1, 40, '2001-01-01'), (2, 1, 50, '2001-02-01')`,
    );

    tenantId = (
      await one(
        `INSERT INTO general_schema.tenant (tenant_name, identification, contact_email)
         VALUES ('fin-int-test', 'J-' || floor(random() * 1e9)::text, 'fin-int@test.local')
         RETURNING tenant_id`,
      )
    ).tenant_id;
    branchId = (
      await one(
        `INSERT INTO general_schema.branch (tenant_id, branch_name)
         VALUES ($1, 'Principal') RETURNING branch_id`,
        [tenantId],
      )
    ).branch_id;
    const customerId = (
      await one(
        `INSERT INTO general_schema.tenant_customer (tenant_id, first_name, last_name, document_number)
         VALUES ($1, 'Cliente', 'Prueba', 'V-1') RETURNING tenant_customer_id`,
        [tenantId],
      )
    ).tenant_customer_id;

    const sale = (date: string, currency: number, subtotal: number, tax: number, done = true) =>
      one<{ sale_id: string }>(
        `INSERT INTO pos_schema.sale
           (branch_id, tenant_customer_id, sale_condition, sale_date, currency_id,
            subtotal_amount, tax_amount, total_amount, is_completed)
         VALUES ($1, $2, '01', $3, $4, $5, $6, $7, $8) RETURNING sale_id`,
        [branchId, customerId, date, currency, subtotal, tax, subtotal + tax, done],
      );
    const item = (saleId: string, qty: number, unit: number, cost: number) =>
      db.query(
        `INSERT INTO pos_schema.sale_item
           (sale_id, tenant_id, quantity, unit_price, total_price, cost_price_at_sale)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, tenantId, qty, unit, qty * unit, cost],
      );
    const payment = (saleId: string, amount: number, currency: number, date: string, points = false) =>
      db.query(
        `INSERT INTO pos_schema.customer_payment
           (tenant_customer_id, sale_id, payment_method_id, is_points_redemption,
            points_redeemed, payment_amount, payment_date, currency_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // El CHECK de la tabla exige payment_method_id = 5 para canjes de puntos.
        [customerId, saleId, points ? 5 : 1, points, points ? 50 : null, amount, date, currency],
      );
    const invoice = (saleId: string, currency: number, subtotal: number, tax: number, date: string) =>
      db.query(
        `INSERT INTO pos_schema.invoice
           (tenant_id, tenant_customer_id, sale_id, currency_id, subtotal_amount, tax_amount,
            total_amount, invoiced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, customerId, saleId, currency, subtotal, tax, subtotal + tax, date],
      );

    // S1: venta en bolivares. 2 x 2.000 = 4.000 + IVA 640; costo 30 USD c/u.
    const s1 = await sale(JAN_15, VES, 4000, 640);
    await item(s1.sale_id, 2, 2000, 30);
    await payment(s1.sale_id, 4640, VES, JAN_15);
    await payment(s1.sale_id, 500, VES, JAN_15, true); // puntos: no es efectivo
    await invoice(s1.sale_id, VES, 4000, 640, JAN_15);

    // S2: venta en dolares. 100 + IVA 16; costo 40 USD.
    const s2 = await sale(FEB_15, USD, 100, 16);
    await item(s2.sale_id, 1, 100, 40);
    await payment(s2.sale_id, 116, USD, FEB_15);
    await invoice(s2.sale_id, USD, 100, 16, FEB_15);

    // S3: venta sin completar y sin cuenta por cobrar: no cuenta en rentabilidad.
    const s3 = await sale(FEB_15, VES, 9999, 0, false);
    await item(s3.sale_id, 1, 9999, 1);

    // Gasto en bolivares: 2.500 + IVA 400 = 2.900 (20 de febrero, tasa 50).
    const category = await one(
      `INSERT INTO accounting_schema.expense_category (tenant_id, name, is_fixed)
       VALUES ($1, 'Servicios', FALSE) RETURNING category_id`,
      [tenantId],
    );
    await db.query(
      `INSERT INTO accounting_schema.expense
         (tenant_id, branch_id, category_id, amount, tax_amount, total_amount,
          currency_id, expense_date)
       VALUES ($1, $2, $3, 2500, 400, 2900, $4, $5)`,
      [tenantId, branchId, category.category_id, VES, FEB_20],
    );
  });

  afterAll(async () => {
    await db.query('ROLLBACK');
    await db.end();
  });

  const num = (v: unknown) => Number(v);

  describe('flujo de caja', () => {
    it('cada cobro se convierte con la tasa de su fecha', async () => {
      const { rows } = await db.query(cashFlowSummaryQuery, [tenantId, '2001-01-01', '2001-02-28', null]);
      const ventas = rows.find((r) => r.movement_type === 'ventas' && r.direction === 'entrada')!;
      // S1: 4.640 VES a tasa 40 = 116 USD ; S2: 116 USD.
      expect(num(ventas.total_usd)).toBeCloseTo(232, 4);
      // S1: 4.640 VES ; S2: 116 USD x 50 = 5.800 VES.
      expect(num(ventas.total_ves)).toBeCloseTo(10440, 2);
    });

    it('un pago con puntos no cuenta como entrada de efectivo (FNZ-CF-05)', async () => {
      const { rows } = await db.query(cashFlowSummaryQuery, [tenantId, '2001-01-01', '2001-01-31', null]);
      const ventas = rows.find((r) => r.movement_type === 'ventas')!;
      expect(num(ventas.total_ves)).toBeCloseTo(4640, 2); // sin los 500 en puntos
    });

    it('el gasto sale en su moneda y a la tasa de su fecha', async () => {
      const { rows } = await db.query(cashFlowSummaryQuery, [tenantId, '2001-01-01', '2001-02-28', null]);
      const gasto = rows.find((r) => r.movement_type === 'gastos_operativos')!;
      expect(gasto.direction).toBe('salida');
      expect(num(gasto.total_ves)).toBeCloseTo(2900, 2);
      expect(num(gasto.total_usd)).toBeCloseTo(58, 4); // 2.900 / 50
    });

    it('el rango incluye el ultimo dia completo (FNZ-CF-06)', async () => {
      const { rows } = await db.query(cashFlowSummaryQuery, [tenantId, '2001-02-15', '2001-02-15', null]);
      expect(rows.some((r) => r.movement_type === 'ventas')).toBe(true);
    });

    it('agrupa por mes con la tasa de cada movimiento', async () => {
      const { rows } = await db.query(cashFlowBucketsQuery, [tenantId, '2001-01-01', '2001-02-28', null, 'month']);
      const entradas = rows.filter((r) => r.direction === 'entrada');
      expect(entradas).toHaveLength(2);
      expect(entradas.map((r) => num(r.total_usd))).toEqual([
        expect.closeTo(116, 4),
        expect.closeTo(116, 4),
      ]);
    });

    it('la sucursal se filtra en la consulta', async () => {
      const { rows } = await db.query(cashFlowSummaryQuery, [
        tenantId,
        '2001-01-01',
        '2001-02-28',
        '00000000-0000-0000-0000-000000000000',
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('IVA', () => {
    it('debito y credito de gastos se convierten con la tasa de cada documento', async () => {
      const { rows } = await db.query(ivaQueries.getSummary, [
        tenantId,
        '2001-01-01T04:00:00Z',
        '2001-03-01T03:59:59Z',
      ]);
      const get = (c: string) => rows.find((r) => r.component === c)!;
      // I1: 640 VES / 40 = 16 USD ; I2: 16 USD -> 32 USD. En VES: 640 + 16 x 50 = 1.440.
      expect(num(get('debito').total_usd)).toBeCloseTo(32, 2);
      expect(num(get('debito').total_ves)).toBeCloseTo(1440, 2);
      // Gasto: IVA 400 VES a tasa 50 = 8 USD.
      expect(num(get('gastos').total_usd)).toBeCloseTo(8, 2);
      expect(num(get('gastos').total_ves)).toBeCloseTo(400, 2);
    });

    it('el periodo excluye los documentos de otros meses', async () => {
      const { rows } = await db.query(ivaQueries.getSummary, [
        tenantId,
        '2001-01-01T04:00:00Z',
        '2001-02-01T03:59:59Z', // solo enero
      ]);
      const debito = rows.find((r) => r.component === 'debito')!;
      expect(num(debito.total_usd)).toBeCloseTo(16, 2);
      expect(num(rows.find((r) => r.component === 'gastos')!.total_usd)).toBe(0);
    });

    it('trae el componente de retenciones (en cero sin comprobantes)', async () => {
      const { rows } = await db.query(ivaQueries.getSummary, [
        tenantId,
        '2001-01-01T04:00:00Z',
        '2001-03-01T03:59:59Z',
      ]);
      expect(num(rows.find((r) => r.component === 'retenciones')!.total_usd)).toBe(0);
    });
  });

  describe('rentabilidad', () => {
    const params = () => [tenantId, 'month', '2000-12-01T00:00:00Z', null];

    it('ventas netas y costo en ambas monedas, por mes', async () => {
      const { rows } = await db.query(salesComponents, params());
      expect(rows).toHaveLength(2);
      const [jan, feb] = rows;
      // Enero: 4.000 VES / 40 = 100 USD ; costo 2 x 30 = 60 USD (siempre en USD).
      expect(num(jan.net_sales_usd)).toBeCloseTo(100, 2);
      expect(num(jan.net_sales_ves)).toBeCloseTo(4000, 2);
      expect(num(jan.cogs_usd)).toBeCloseTo(60, 2);
      expect(num(jan.cogs_ves)).toBeCloseTo(2400, 2); // 60 x 40
      // Febrero: 100 USD ; 5.000 VES ; costo 40 USD = 2.000 VES.
      expect(num(feb.net_sales_usd)).toBeCloseTo(100, 2);
      expect(num(feb.net_sales_ves)).toBeCloseTo(5000, 2);
      expect(num(feb.cogs_ves)).toBeCloseTo(2000, 2);
    });

    it('una venta sin completar y sin CxC no entra (criterio devengado, FNZ-RT-05)', async () => {
      const { rows } = await db.query(salesComponents, params());
      const totalVes = rows.reduce((s, r) => s + num(r.net_sales_ves), 0);
      expect(totalVes).toBeCloseTo(9000, 2); // sin los 9.999 de S3
    });

    it('el gasto resta en su bucket, convertido con la tasa del dia', async () => {
      const { rows } = await db.query(expenseComponents, params());
      expect(rows).toHaveLength(1);
      expect(num(rows[0].amount_usd)).toBeCloseTo(58, 2);
      expect(num(rows[0].amount_ves)).toBeCloseTo(2900, 2);
    });

    it('devoluciones y notas sin movimientos devuelven vacio sin error', async () => {
      expect((await db.query(returnsComponents, params())).rows).toHaveLength(0);
      expect((await db.query(notesComponents, params())).rows).toHaveLength(0);
    });
  });
});
