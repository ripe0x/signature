import type { Page } from 'playwright';

export interface RenderOptions {
  seed: string;
  width?: number;
  height?: number;
  foldCount?: number;
}

export interface PooledPage {
  page: Page;
  inUse: boolean;
  lastUsed: number;
}

export interface CacheStats {
  enabled: boolean;
  fileCount: number;
  totalSize: number;
}
