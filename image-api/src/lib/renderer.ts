import { chromium, Browser, Page } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PooledPage, RenderOptions } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POOL_SIZE = 3;
const RENDER_TIMEOUT = 30000;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1200;

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

    // Launch browser
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

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
    const { seed, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = options;

    const { page, poolIndex } = await this.acquirePage();

    try {
      await page.setViewportSize({ width, height });

      const html = this.buildHTML(seed, width, height);

      // Navigate to blank first to clear state
      await page.goto('about:blank');
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Wait for render complete signal
      await page.waitForFunction(
        () => (window as any).RENDER_COMPLETE === true,
        { timeout: RENDER_TIMEOUT }
      );

      // Capture canvas as PNG
      const canvas = await page.$('canvas');
      if (!canvas) throw new Error('Canvas not found');

      const screenshot = await canvas.screenshot({ type: 'png' });
      return screenshot;
    } finally {
      await this.releasePage(page, poolIndex);
    }
  }

  private buildHTML(seed: string, width: number, height: number): string {
    // Convert hex seed to number (use first 12 hex chars for safe integer)
    const numericSeed = `parseInt("${seed}".slice(2, 14), 16)`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #000;
    }
    canvas {
      display: block;
    }
  </style>
  <script>
    window.SEED = ${numericSeed};
    window.FOLD_COUNT = 50;
    window.RENDER_COMPLETE = false;
  </script>
</head>
<body>
  <canvas id="c" width="${width}" height="${height}"></canvas>
  <script>
    ${this.foldScript}

    // Signal render complete after fold-core runs
    window.RENDER_COMPLETE = true;
  </script>
</body>
</html>`;
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
