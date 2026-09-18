/** The subset of the Web Storage API LIFE//OS uses. Injected so everything is testable. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Keys currently stored (for listing backups). */
  keys(): string[];
}

export function browserStorage(storage: Storage = window.localStorage): KeyValue {
  return {
    getItem: (k) => storage.getItem(k),
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k),
    keys: () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null),
  };
}

export class MemoryStorage implements KeyValue {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  keys() {
    return [...this.data.keys()];
  }
}
