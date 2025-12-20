import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CacheStats } from '../types.js';

export class DiskCache {
  private cacheDir: string;
  private enabled: boolean;

  constructor(cacheDir: string = './cache', enabled: boolean = true) {
    this.cacheDir = cacheDir;
    this.enabled = enabled;

    if (this.enabled && !existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCacheKey(identifier: string, width: number, height: number, foldCount?: number): string {
    // Use identifier as-is for token-based keys, or first 16 chars for seed-based keys
    const keyPrefix = identifier.startsWith('token-')
      ? identifier
      : identifier.replace('0x', '').slice(0, 16);
    const foldSuffix = foldCount !== undefined ? `-f${foldCount}` : '';
    return `${keyPrefix}-${width}x${height}${foldSuffix}.png`;
  }

  async get(seed: string, width: number, height: number, foldCount?: number): Promise<Buffer | null> {
    if (!this.enabled) return null;

    const key = this.getCacheKey(seed, width, height, foldCount);
    const filePath = join(this.cacheDir, key);

    if (existsSync(filePath)) {
      return readFileSync(filePath);
    }

    return null;
  }

  async set(seed: string, width: number, height: number, data: Buffer, foldCount?: number): Promise<void> {
    if (!this.enabled) return;

    const key = this.getCacheKey(seed, width, height, foldCount);
    const filePath = join(this.cacheDir, key);

    writeFileSync(filePath, data);
  }

  async clear(): Promise<number> {
    if (!existsSync(this.cacheDir)) return 0;

    const files = readdirSync(this.cacheDir);
    let count = 0;

    for (const file of files) {
      if (file.endsWith('.png')) {
        unlinkSync(join(this.cacheDir, file));
        count++;
      }
    }

    return count;
  }

  getStats(): CacheStats {
    if (!this.enabled || !existsSync(this.cacheDir)) {
      return { enabled: this.enabled, fileCount: 0, totalSize: 0 };
    }

    const files = readdirSync(this.cacheDir).filter(f => f.endsWith('.png'));
    let totalSize = 0;

    for (const file of files) {
      const stat = statSync(join(this.cacheDir, file));
      totalSize += stat.size;
    }

    return {
      enabled: this.enabled,
      fileCount: files.length,
      totalSize,
    };
  }
}
