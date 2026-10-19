import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 200_000;
const SWEEP_EVERY_MS = 60_000;

/**
 * Contadores de ventana fija en memoria. Es por proceso: si se escala a varias
 * instancias cada una lleva su propia cuenta (el limite efectivo seria el cupo
 * por el numero de instancias). Para compartirlo entre instancias basta con
 * reemplazar esta clase por una que use Redis con la misma firma de `hit`.
 */
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Cuenta una request en `key` y devuelve el total de la ventana vigente. */
  hit(key: string, windowMs: number, now = Date.now()): Bucket {
    const current = this.buckets.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return current;
    }
    if (this.buckets.size >= MAX_BUCKETS) this.evict(now);
    const fresh = { count: 1, resetAt: now + windowMs };
    this.buckets.set(key, fresh);
    return fresh;
  }

  size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }

  private sweep(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  /**
   * Con el mapa lleno (alguien rota IP o identificadores para llenar la
   * memoria) primero se purgan los vencidos y, si no alcanza, el 10% mas viejo.
   */
  private evict(now: number): void {
    this.sweep(now);
    if (this.buckets.size < MAX_BUCKETS) return;
    let toDrop = Math.ceil(MAX_BUCKETS * 0.1);
    for (const key of this.buckets.keys()) {
      this.buckets.delete(key);
      if (--toDrop <= 0) break;
    }
  }
}
