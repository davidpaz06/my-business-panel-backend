import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitModule } from './rate-limit.module';
import { RateLimit, byBodyField } from './rate-limit.decorator';
import { RATE_LIMIT_TIERS } from './rate-limit.config';

// Controller de prueba en un modulo APARTE del RateLimitModule: comprueba que
// el guard se resuelve por el modulo global, igual que en los controllers reales.
@Controller('probe')
class ProbeController {
  @Get('catalog')
  @UseGuards(RateLimitGuard)
  @RateLimit('public')
  catalog() {
    return { ok: true };
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit('login', { identity: byBodyField('email') })
  login(@Body() body: { email?: string }) {
    return { ok: Boolean(body) };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Limitador sobre HTTP real', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    delete process.env.RATE_LIMIT_DISABLED;
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Un proxy confiable delante, como el balanceador de Render.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cuenta por la IP de X-Forwarded-For, no por la del balanceador', async () => {
    const max = RATE_LIMIT_TIERS.public.ip;
    for (let i = 0; i < max; i++) {
      await http()
        .get('/probe/catalog')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
    }
    // misma IP de cliente: se agoto el cupo
    const blocked = await http()
      .get('/probe/catalog')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toContain('Demasiadas solicitudes');
    // otro cliente detras del mismo balanceador no se ve afectado
    await http()
      .get('/probe/catalog')
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(200);
  });

  it('login: el mismo correo desde distintas IPs se bloquea', async () => {
    const max = RATE_LIMIT_TIERS.login.identity;
    for (let i = 0; i < max; i++) {
      await http()
        .post('/probe/login')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ email: 'victima@empresa.com' })
        .expect(201);
    }
    await http()
      .post('/probe/login')
      .set('X-Forwarded-For', '198.51.100.200')
      .send({ email: 'victima@empresa.com' })
      .expect(429);
    await http()
      .post('/probe/login')
      .set('X-Forwarded-For', '198.51.100.200')
      .send({ email: 'otra@empresa.com' })
      .expect(201);
  });

  it('expone las cabeceras RateLimit en respuestas permitidas', async () => {
    const res = await http()
      .get('/probe/catalog')
      .set('X-Forwarded-For', '203.0.113.50')
      .expect(200);
    expect(res.headers['ratelimit-limit']).toBe(
      String(RATE_LIMIT_TIERS.public.ip),
    );
    expect(res.headers['ratelimit-remaining']).toBe(
      String(RATE_LIMIT_TIERS.public.ip - 1),
    );
  });
});
