import { RateLimitStore } from './rate-limit.store';

describe('RateLimitStore', () => {
  let store: RateLimitStore;
  beforeEach(() => {
    store = new RateLimitStore();
  });
  afterEach(() => store.onModuleDestroy());

  it('cuenta dentro de la ventana y reinicia al vencer', () => {
    expect(store.hit('k', 1000, 0).count).toBe(1);
    expect(store.hit('k', 1000, 500).count).toBe(2);
    expect(store.hit('k', 1000, 999).count).toBe(3);
    // en 1000 la ventana ya vencio: arranca otra
    const next = store.hit('k', 1000, 1000);
    expect(next.count).toBe(1);
    expect(next.resetAt).toBe(2000);
  });

  it('las llaves no se mezclan', () => {
    store.hit('a', 1000, 0);
    store.hit('a', 1000, 0);
    expect(store.hit('b', 1000, 0).count).toBe(1);
  });

  it('el resetAt se fija al primer request de la ventana', () => {
    const first = store.hit('k', 1000, 100);
    const second = store.hit('k', 1000, 900);
    expect(first.resetAt).toBe(1100);
    expect(second.resetAt).toBe(1100);
  });
});
