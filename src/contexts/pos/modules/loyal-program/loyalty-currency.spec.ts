import { calculateEarnedPoints, toProgramCurrency } from './loyalty-currency';

// Runner falso: devuelve el monto en USD que la DB calcularia (monto / tasa).
const RATE = 50;
function runner(rate: number | null = RATE) {
  return {
    query: jest.fn((_sql: string, params?: unknown[]) => {
      const [, currencyId, amount] = params as [string, number, number];
      let usd: number | null;
      if (currencyId === 2) usd = amount;
      else usd = rate === null ? null : amount / rate;
      return Promise.resolve({ rows: [{ amount_usd: usd }] });
    }),
  };
}

const program = {
  points_earned_per_currency_unit: '2',
  minimum_purchase_for_points: '10',
};

describe('toProgramCurrency', () => {
  it('no convierte un monto que ya esta en USD', async () => {
    expect(await toProgramCurrency(runner(), 't', 2, 30)).toBe(30);
  });

  it('convierte bolivares a USD con la tasa', async () => {
    expect(await toProgramCurrency(runner(), 't', 1, 500)).toBe(10);
  });

  it('devuelve null si hace falta tasa y no hay ninguna', async () => {
    expect(await toProgramCurrency(runner(null), 't', 1, 500)).toBeNull();
  });

  it('un monto cero o negativo no consulta la DB', async () => {
    const r = runner();
    expect(await toProgramCurrency(r, 't', 1, 0)).toBe(0);
    expect(r.query).not.toHaveBeenCalled();
  });
});

describe('calculateEarnedPoints (FNZ-FI-01)', () => {
  it('una venta de 10 USD otorga mas puntos que una de Bs. 10', async () => {
    const usd = await calculateEarnedPoints(runner(), program, 't', 2, 10, 10);
    const ves = await calculateEarnedPoints(runner(), program, 't', 1, 10, 10);
    expect(usd).toBe(20);
    expect(ves).toBe(0); // Bs. 10 = 0,20 USD: no alcanza la compra minima
  });

  it('Bs. 1.000 con tasa 50 equivalen a 20 USD', async () => {
    const points = await calculateEarnedPoints(
      runner(),
      program,
      't',
      1,
      1000,
      1000,
    );
    expect(points).toBe(40);
  });

  it('la compra minima se compara en USD sobre el total, no sobre el abono', async () => {
    // Total 1.000 Bs. = 20 USD (supera el minimo de 10); abono de 100 Bs. = 2 USD.
    const points = await calculateEarnedPoints(
      runner(),
      program,
      't',
      1,
      1000,
      100,
    );
    expect(points).toBe(4);
  });

  it('el abono nunca supera el total', async () => {
    const points = await calculateEarnedPoints(runner(), program, 't', 2, 20, 99);
    expect(points).toBe(40);
  });

  it('sin tasa para convertir no se otorgan puntos', async () => {
    const points = await calculateEarnedPoints(
      runner(null),
      program,
      't',
      1,
      1000,
      1000,
    );
    expect(points).toBe(0);
  });
});
