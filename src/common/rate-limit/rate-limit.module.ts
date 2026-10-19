import { Global, Module } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';

/**
 * Global para que cualquier controller pueda usar `RateLimitGuard` en
 * `@UseGuards(...)` sin importar el modulo (mismo patron que StateModule).
 * El store es un singleton: todos los controllers comparten los contadores.
 */
@Global()
@Module({
  providers: [RateLimitStore, RateLimitGuard],
  exports: [RateLimitStore, RateLimitGuard],
})
export class RateLimitModule {}
