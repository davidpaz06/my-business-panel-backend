import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantService],
    })
      // Los constructores inyectan DATABASE, Stripe, guards y otros servicios;
      // la prueba solo verifica que el provider se instancia.
      .useMocker(() => ({}))
      .compile();

    service = module.get<TenantService>(TenantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
