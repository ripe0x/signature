// Wrapper for fold-core.js rendering functions
// Provides async loading interface for the rendering engine

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FoldCoreModule = any;

// Constants
export const REFERENCE_WIDTH = 1200;
export const REFERENCE_HEIGHT = 1500;
export const DRAWING_MARGIN = 50;

// Load fold-core dynamically
let foldCorePromise: Promise<FoldCoreModule> | null = null;

async function loadFoldCore(): Promise<FoldCoreModule> {
  if (!foldCorePromise) {
    // Use absolute path that Next.js can resolve correctly
    foldCorePromise = import('@/lib/fold-core.js').catch((error) => {
      console.error('Failed to load fold-core.js:', error);
      // Try fallback with relative path
      return import('./fold-core.js').catch((fallbackError) => {
        console.error('Fallback import also failed:', fallbackError);
        throw new Error(`Could not load fold-core.js: ${error.message}`);
      });
    });
  }
  return foldCorePromise;
}

// Seeded random number generator type
export type SeededRng = () => number;

export async function seededRandom(seed: number): Promise<SeededRng> {
  const core = await loadFoldCore();
  return core.seededRandom(seed);
}

// Generate all parameters from a seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateAllParams(seed: number, width = REFERENCE_WIDTH, height = REFERENCE_HEIGHT, padding = 0): Promise<any> {
  const core = await loadFoldCore();
  return core.generateAllParams(seed, width, height, padding);
}

// Render artwork and return dataUrl
// The core renderToCanvas creates its own canvas and returns { dataUrl, settings }
export async function renderArtwork(options: {
  seed: number;
  folds: number;
  outputWidth: number;
  outputHeight: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}): Promise<{ dataUrl: string; settings: any }> {
  const core = await loadFoldCore();
  return core.renderToCanvas(options);
}

// Render artwork to an existing canvas element
export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  seed: number,
  width: number,
  height: number,
  foldCount?: number
): Promise<void> {
  const core = await loadFoldCore();

  // Generate params first (pass foldCount if provided)
  const params = core.generateAllParams(seed, REFERENCE_WIDTH, REFERENCE_HEIGHT, 0, foldCount ?? null);

  // Call renderToCanvas which returns { dataUrl, settings }
  const { dataUrl } = core.renderToCanvas({
    seed,
    folds: params.folds,
    outputWidth: width,
    outputHeight: height,
    bgColor: params.palette.bg,
    textColor: params.palette.text,
    accentColor: params.palette.accent,
    cellWidth: params.cells.cellW,
    cellHeight: params.cells.cellH,
    renderMode: params.renderMode,
    multiColor: params.multiColor,
    levelColors: params.levelColors,
    foldStrategy: params.foldStrategy,
    paperProperties: params.paperProperties,
    showCreaseLines: params.showCreaseLines,
  });

  // Draw the dataUrl image onto the provided canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = width * 2; // 2x for retina
        canvas.height = height * 2;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Generate palette from seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePalette(seed: number): Promise<any> {
  const core = await loadFoldCore();
  return core.generatePalette(seed);
}

// Generate cell dimensions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateCellDimensions(
  width: number,
  height: number,
  padding: number,
  seed: number
): Promise<any> {
  const core = await loadFoldCore();
  return core.generateCellDimensions(width, height, padding, seed);
}
