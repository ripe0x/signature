import { chromium, Browser, Page } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PooledPage, RenderOptions } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POOL_SIZE = 1;
const RENDER_TIMEOUT = 30000;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1697; // A4 aspect ratio (1:√2)

export class PlaywrightRenderer {
  private browser: Browser | null = null;
  private pagePool: PooledPage[] = [];
  private foldScript: string = '';

  async initialize(): Promise<void> {
    // Load and prepare fold-core.js
    const foldCorePath = join(__dirname, '../../public/fold-core.js');
    if (existsSync(foldCorePath)) {
      let rawScript = readFileSync(foldCorePath, 'utf8');
      // Strip ES module exports so it works as a plain script
      this.foldScript = this.stripESModuleExports(rawScript);
    } else {
      throw new Error('fold-core.js not found. Run: npm run copy-sketch');
    }

    // Launch browser (use system Chromium if available)
    console.log('Launching Chromium browser...');
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    this.browser = await chromium.launch({
      headless: true,
      timeout: 60000,
      executablePath: executablePath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    console.log('Chromium browser launched');

    // Pre-warm page pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const page = await this.browser.newPage();
      await page.setViewportSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
      this.pagePool.push({ page, inUse: false, lastUsed: Date.now() });
    }

    console.log(`Playwright initialized with ${POOL_SIZE} pooled pages`);
  }

  private stripESModuleExports(script: string): string {
    return script
      .replace(/^export\s+/gm, '')
      .replace(/^export\s+default\s+/gm, '')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  }

  private async acquirePage(): Promise<{ page: Page; poolIndex: number }> {
    // Find available page in pool
    for (let i = 0; i < this.pagePool.length; i++) {
      if (!this.pagePool[i].inUse) {
        this.pagePool[i].inUse = true;
        this.pagePool[i].lastUsed = Date.now();
        return { page: this.pagePool[i].page, poolIndex: i };
      }
    }

    // All pages in use, create overflow page
    if (!this.browser) throw new Error('Browser not initialized');
    const page = await this.browser.newPage();
    await page.setViewportSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    return { page, poolIndex: -1 };
  }

  private async releasePage(page: Page, poolIndex: number): Promise<void> {
    if (poolIndex >= 0) {
      this.pagePool[poolIndex].inUse = false;
      this.pagePool[poolIndex].lastUsed = Date.now();
    } else {
      // Overflow page, close it
      await page.close();
    }
  }

  async render(options: RenderOptions): Promise<Buffer> {
    const { seed, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, foldCount } = options;

    const { page, poolIndex } = await this.acquirePage();

    try {
      await page.setViewportSize({ width, height });

      const html = this.buildHTML(seed, width, height, foldCount);

      // Navigate to blank first to clear state
      await page.goto('about:blank');
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Wait for render complete signal
      await page.waitForFunction(
        () => (window as any).RENDER_COMPLETE === true,
        { timeout: RENDER_TIMEOUT }
      );

      // Take screenshot of the canvas element
      const canvas = await page.$('canvas');
      if (!canvas) throw new Error('Canvas not found');
      return await canvas.screenshot({ type: 'png' });
    } finally {
      await this.releasePage(page, poolIndex);
    }
  }

  private buildHTML(seed: string, width: number, height: number, foldCount?: number): string {
    const foldCountScript = foldCount !== undefined ? `window.FOLD_COUNT = ${foldCount};` : '';
    // Match on-chain HTML structure as closely as possible
    // RENDER_COMPLETE is set by fold-core.js after rendering completes
    // Set explicit dimensions to override window.innerWidth/Height in headless browser
    return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=${width},initial-scale=1"><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}</style><script>window.LESS_SEED="${seed}";${foldCountScript}window.RENDER_COMPLETE=false;window.innerWidth=${width};window.innerHeight=${height};</script></head><body><script>(()=>{${this.foldScript}})();</script></body></html>`;
  }

  // Render from on-chain HTML directly (animation_url content)
  async renderHtml(options: { html: string; width?: number; height?: number }): Promise<Buffer> {
    const { html, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = options;

    const { page, poolIndex } = await this.acquirePage();

    try {
      await page.setViewportSize({ width, height });

      // Navigate to blank first to clear state
      await page.goto('about:blank');
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Wait for render complete signal (set by fold-core.js)
      await page.waitForFunction(
        () => (window as any).RENDER_COMPLETE === true,
        { timeout: RENDER_TIMEOUT }
      );

      // Take screenshot of the canvas element
      const canvas = await page.$('canvas');
      if (!canvas) throw new Error('Canvas not found');
      return await canvas.screenshot({ type: 'png' });
    } finally {
      await this.releasePage(page, poolIndex);
    }
  }

  getPoolStats(): { total: number; available: number; inUse: number } {
    const available = this.pagePool.filter(p => !p.inUse).length;
    return {
      total: this.pagePool.length,
      available,
      inUse: this.pagePool.length - available,
    };
  }

  async close(): Promise<void> {
    for (const pooled of this.pagePool) {
      await pooled.page.close();
    }
    this.pagePool = [];

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
