import { Test, TestingModule } from '@nestjs/testing';
import { CustomerSegmentMarginController } from './customer_segment_margin.controller';

describe('CustomerSegmentMarginController', () => {
  let controller: CustomerSegmentMarginController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerSegmentMarginController],
    })
      // Los constructores inyectan DATABASE, Stripe, guards y otros servicios;
      // la prueba solo verifica que el provider se instancia.
      .useMocker(() => ({}))
      .compile();

    controller = module.get<CustomerSegmentMarginController>(
      CustomerSegmentMarginController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
