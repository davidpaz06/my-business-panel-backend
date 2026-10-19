import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
    })
      // Los constructores inyectan DATABASE, Stripe, guards y otros servicios;
      // la prueba solo verifica que el provider se instancia.
      .useMocker(() => ({}))
      .compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
