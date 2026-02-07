// Type declarations for opendb-store (minimal, focused on public API)

declare type Unit = 'B' | 'KB' | 'MB';

declare interface FormatOptions {
  format?: Unit | string;
  unit?: boolean;
  capacity?: number;
}

declare interface StorageMethods {
  set(key: string | number, value: any, options?: { expire?: number } | any): void;
  get<T = any>(key?: string | number, defaultValue?: T | null): T | null;
  has(key?: string | number): boolean;
  remove(key: string | number): any | null;
  clear(): void;
  key(index: number): string | null;
  keys(): string[];
  trim(key: string): string;
  size(key: string | number, options?: FormatOptions): string | number;
  free(options?: FormatOptions): string | number;
  used(): number;
  capacity(options?: FormatOptions): string | number;
  from(namespace?: string): void;
  getFormattedData(key: string): Record<string, any>;
  setFormattedData(key: string, obj: Record<string, any>): void;
}

declare interface Config {
  version: string;
  createNamespace(namespace: string): void;
  getCurrentNamespace(): string;
  switchNamespace(namespace: string): void;
  get(): { namespace: string; separator: string; trimKeys: boolean; expiry: boolean };
  setSeparator(separator: string): void;
  getSeparator(): string;
  generateKey(key: string | number): string;
}

declare const db: {
  config: Config;
  local: StorageMethods & { count?: number };
  session: StorageMethods & { count?: number };
};

export default db;
