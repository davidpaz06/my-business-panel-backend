import Decimal from 'decimal.js';
import { MoraService } from './mora.service';
import { ParametersService } from '../parameters/parameters.service';

function fakeParameters(timeline: { value: Decimal; validFrom: string }[]) {
  return {
    getTimeline: jest.fn().mockResolvedValue(timeline),
  } as unknown as ParametersService;
}

describe('MoraService.calculate (Arts. 128, 142.f, 143)', () => {
  it('pago dentro de los 5 días de gracia -> mora 0 (142.f)', async () => {
    const service = new MoraService(fakeParameters([]));

    const result = await service.calculate('tenant-1', {
      debt_amount: 36000,
      due_from: '2026-01-01',
      grace_days: 5,
      payment_date: '2026-01-06',
      debt_kind: 'prestaciones',
    });

    expect(result.moraDays).toBe(0);
    expect(result.moraAmount).toBe('0.0000');
  });

  it('pago tardío con una sola tasa vigente en todo el tramo', async () => {
    const service = new MoraService(
      fakeParameters([{ value: new Decimal(0.6), validFrom: '2025-01-01' }]),
    );

    const result = await service.calculate('tenant-1', {
      debt_amount: 36000,
      due_from: '2026-01-01', // límite: 2026-01-06
      grace_days: 5,
      payment_date: '2026-01-20', // 14 días de mora
      debt_kind: 'prestaciones',
    });

    expect(result.moraDays).toBe(14);
    expect(result.moraAmount).toBe('840.0000');
  });

  it('la tasa cambia a mitad del tramo de mora -> se segmenta (Art. 143)', async () => {
    const service = new MoraService(
      fakeParameters([
        { value: new Decimal(0.5), validFrom: '2025-01-01' },
        { value: new Decimal(0.7), validFrom: '2026-01-13' }, // breakpoint dentro del tramo
      ]),
    );

    const result = await service.calculate('tenant-1', {
      debt_amount: 36000,
      due_from: '2026-01-01', // límite: 2026-01-06
      grace_days: 5,
      payment_date: '2026-01-20',
      debt_kind: 'prestaciones',
      explain: true,
    });

    expect(result.moraDays).toBe(14);
    // 7 días a 0.50 (350.0000) + 7 días a 0.70 (490.0000)
    expect(result.moraAmount).toBe('840.0000');

    const withSegments = result as typeof result & {
      segments: {
        from: string;
        to: string;
        rate: string;
        days: number;
        amount: string;
      }[];
    };
    expect(withSegments.segments).toHaveLength(2);
    expect(withSegments.segments[0]).toMatchObject({
      from: '2026-01-06',
      to: '2026-01-13',
      days: 7,
      amount: '350.0000',
    });
    expect(withSegments.segments[1]).toMatchObject({
      from: '2026-01-13',
      to: '2026-01-20',
      days: 7,
      amount: '490.0000',
    });
  });
});
