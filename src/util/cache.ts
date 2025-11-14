type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export class TTLCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    if (ttlMs <= 0) {
      throw new Error("TTL must be greater than zero");
    }
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V): void {
    this.map.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
