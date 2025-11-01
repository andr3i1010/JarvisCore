// store.ts
const store: Record<string, any> = {};

export function setStoreValue(key: string, value: any) {
  store[key] = value;
}

export function getStoreValue(key: string): any {
  return store[key];
}

export function getStore(): Record<string, any> {
  return store;
}