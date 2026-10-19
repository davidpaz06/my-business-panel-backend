import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE } from '../db/db.provider';
import { StateService } from './state.service';

describe('StateService', () => {
  let service: StateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateService,
        // StateService carga roles y tenants al construirse
        {
          provide: DATABASE,
          useValue: { query: jest.fn().mockResolvedValue({ rows: [] }) },
        },
      ],
    })
      // Los constructores inyectan DATABASE, Stripe, guards y otros servicios;
      // la prueba solo verifica que el provider se instancia.
      .useMocker(() => ({}))
      .compile();

    service = module.get<StateService>(StateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
