import { chromium, Browser, Page } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PooledPage, RenderOptions } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POOL_SIZE = 4; // Number of pre-warmed pages
const MAX_CONCURRENT_RENDERS = 6; // Max concurrent renders (queue the rest)
const RENDER_TIMEOUT = 30000;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1697; // A4 aspect ratio (1:√2)
const RESTART_AFTER_RENDERS = 100; // Restart browser after N renders to prevent memory leaks
const RESTART_AFTER_MS = 30 * 60 * 1000; // Or after 30 minutes

// Chromium args for reduced memory usage
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--js-flags=--max-old-space-size=256', // Limit JS heap per context
];

interface QueuedRequest {
  resolve: (value: { page: Page; poolIndex: number }) => void;
  reject: (error: Error) => void;
}

export class PlaywrightRenderer {
  private browser: Browser | null = null;
  private pagePool: PooledPage[] = [];
  private foldScript: string = '';
  private renderCount: number = 0;
  private lastRestartTime: number = Date.now();
  private isRestarting: boolean = false;
  private activeRenders: number = 0;
  private requestQueue: QueuedRequest[] = [];

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

    await this.launchBrowser();
    console.log(`Playwright initialized with ${POOL_SIZE} pooled pages, max ${MAX_CONCURRENT_RENDERS} concurrent renders`);
  }

  private async launchBrowser(): Promise<void> {
    console.log('Launching Chromium browser...');
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    this.browser = await chromium.launch({
      headless: true,
      timeout: 60000,
      executablePath: executablePath || undefined,
      args: CHROMIUM_ARGS,
    });
    console.log('Chromium browser launched');

    // Pre-warm page pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const page = await this.browser.newPage();
      await page.setViewportSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
      this.pagePool.push({ page, inUse: false, lastUsed: Date.now() });
    }
  }

  // Graceful browser restart - launches new browser before closing old
  private async gracefulRestart(): Promise<void> {
    if (this.isRestarting) return;
    this.isRestarting = true;

    console.log(`Graceful browser restart (after ${this.renderCount} renders)...`);

    try {
      // Launch new browser first
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      const newBrowser = await chromium.launch({
        headless: true,
        timeout: 60000,
        executablePath: executablePath || undefined,
        args: CHROMIUM_ARGS,
      });

      // Create new page pool
      const newPool: PooledPage[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const page = await newBrowser.newPage();
        await page.setViewportSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
        newPool.push({ page, inUse: false, lastUsed: Date.now() });
      }

      // Atomically swap browser and pool
      const oldBrowser = this.browser;
      const oldPool = this.pagePool;
      this.browser = newBrowser;
      this.pagePool = newPool;
      this.renderCount = 0;
      this.lastRestartTime = Date.now();

      // Close old resources (after swap, so no requests are lost)
      for (const p of oldPool) {
        await p.page.close().catch(() => {});
      }
      if (oldBrowser) {
        await oldBrowser.close().catch(() => {});
      }

      console.log('Browser restarted successfully');
    } catch (error) {
      console.error('Failed to restart browser:', error);
    } finally {
      this.isRestarting = false;
    }
  }

  private shouldRestart(): boolean {
    const renderThreshold = this.renderCount >= RESTART_AFTER_RENDERS;
    const timeThreshold = Date.now() - this.lastRestartTime >= RESTART_AFTER_MS;
    return (renderThreshold || timeThreshold) && !this.isRestarting;
  }

  private stripESModuleExports(script: string): string {
    return script
      .replace(/^export\s+/gm, '')
      .replace(/^export\s+default\s+/gm, '')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  }

  private async acquirePage(): Promise<{ page: Page; poolIndex: number }> {
    // Check if we need to queue this request
    if (this.activeRenders >= MAX_CONCURRENT_RENDERS) {
      console.log(`Queueing request (${this.requestQueue.length + 1} in queue, ${this.activeRenders} active)`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ resolve, reject });
      });
    }

    return this.getPage();
  }

  private async getPage(): Promise<{ page: Page; poolIndex: number }> {
    this.activeRenders++;

    // Find available page in pool
    for (let i = 0; i < this.pagePool.length; i++) {
      if (!this.pagePool[i].inUse) {
        this.pagePool[i].inUse = true;
        this.pagePool[i].lastUsed = Date.now();
        return { page: this.pagePool[i].page, poolIndex: i };
      }
    }

    // All pages in use, create overflow page (but we limit via MAX_CONCURRENT_RENDERS)
    if (!this.browser) throw new Error('Browser not initialized');
    const page = await this.browser.newPage();
    await page.setViewportSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    return { page, poolIndex: -1 };
  }

  private async releasePage(page: Page, poolIndex: number, crashed: boolean = false): Promise<void> {
    this.activeRenders--;
    this.renderCount++;

    if (poolIndex >= 0) {
      if (crashed) {
        // Page crashed, replace it with a fresh one
        console.log(`Page ${poolIndex} crashed, creating replacement...`);
        try {
          await page.close().catch(() => {}); // May fail if already closed
        } catch {}

        if (this.browser) {
          const newPage = await this.browser.newPage();
          await newPage.setViewportSize({ width: 1200, height: 1697 });
          this.pagePool[poolIndex] = { page: newPage, inUse: false, lastUsed: Date.now() };
          console.log(`Page ${poolIndex} replaced successfully`);
        }
      } else {
        this.pagePool[poolIndex].inUse = false;
        this.pagePool[poolIndex].lastUsed = Date.now();
      }
    } else {
      // Overflow page, close it
      await page.close().catch(() => {});
    }

    // Process next queued request if any
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift()!;
      this.getPage().then(next.resolve).catch(next.reject);
    }

    // Check if we should restart the browser (do it after releasing page)
    if (this.shouldRestart() && this.activeRenders === 0) {
      this.gracefulRestart().catch(console.error);
    }
  }

  async render(options: RenderOptions): Promise<Buffer> {
    const { seed, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, foldCount } = options;

    const { page, poolIndex } = await this.acquirePage();
    let crashed = false;

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
    } catch (error) {
      // Detect page crash
      if (error instanceof Error && error.message.includes('crashed')) {
        crashed = true;
      }
      throw error;
    } finally {
      await this.releasePage(page, poolIndex, crashed);
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
    let crashed = false;

    try {
      await page.setViewportSize({ width, height });

      // Navigate to blank first to clear state
      await page.goto('about:blank');
      await page.setContent(html, { waitUntil: 'load' });

      // Wait for render to complete - check for RENDER_COMPLETE or canvas, with timeout
      try {
        await page.waitForFunction(
          () => (window as any).RENDER_COMPLETE === true || document.querySelector('canvas'),
          { timeout: 10000 }
        );
        // Small buffer for any final draws
        await page.waitForTimeout(100);
      } catch {
        // Fallback: wait a bit longer if no signal
        await page.waitForTimeout(2000);
      }

      // Take full page screenshot (avoids canvas stability issues)
      return await page.screenshot({ type: 'png', fullPage: false });
    } catch (error) {
      // Detect page crash
      if (error instanceof Error && error.message.includes('crashed')) {
        crashed = true;
      }
      throw error;
    } finally {
      await this.releasePage(page, poolIndex, crashed);
    }
  }

  getPoolStats(): { total: number; available: number; inUse: number; queued: number; renderCount: number } {
    const available = this.pagePool.filter(p => !p.inUse).length;
    return {
      total: this.pagePool.length,
      available,
      inUse: this.pagePool.length - available,
      queued: this.requestQueue.length,
      renderCount: this.renderCount,
    };
  }

  async close(): Promise<void> {
    // Reject any queued requests
    for (const req of this.requestQueue) {
      req.reject(new Error('Renderer is shutting down'));
    }
    this.requestQueue = [];

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
