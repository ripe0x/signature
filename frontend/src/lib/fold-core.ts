// Re-export fold-core.js rendering functions
// This file provides type definitions and wraps the original fold-core.js

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
    foldCorePromise = import('../../../web/fold-core');
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
export async function generateAllParams(seed: number): Promise<any> {
  const core = await loadFoldCore();
  return core.generateAllParams(seed);
}

// Render artwork to canvas
export async function renderToCanvas(options: {
  canvas: HTMLCanvasElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}): Promise<void> {
  const core = await loadFoldCore();
  return core.renderToCanvas(options);
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
