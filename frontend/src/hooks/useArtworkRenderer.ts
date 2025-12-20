'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { renderToCanvas, REFERENCE_WIDTH, REFERENCE_HEIGHT } from '@/lib/fold-core-wrapper';

interface UseArtworkRendererOptions {
  seed: number;
  foldCount?: number;
  autoRender?: boolean;
}

interface UseArtworkRendererReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  error: Error | null;
  render: () => Promise<void>;
}

/**
 * Calculate optimal render dimensions - matches on-chain getOptimalDimensions()
 * Uses the canvas's displayed size to determine render resolution
 */
function getOptimalDimensions(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;

  // Get the canvas's displayed size (CSS pixels)
  const rect = canvas.getBoundingClientRect();
  const screenW = rect.width || REFERENCE_WIDTH;
  const screenH = rect.height || REFERENCE_HEIGHT;

  // Maintain A4 aspect ratio (1:√2, width:height)
  const aspectRatio = 1 / Math.sqrt(2);

  let width: number, height: number;
  if (screenW / screenH > aspectRatio) {
    // Container is wider than A4, fit to height
    height = screenH;
    width = Math.floor(height * aspectRatio);
  } else {
    // Container is taller than A4, fit to width
    width = screenW;
    height = Math.floor(width / aspectRatio);
  }

  // Ensure minimum dimensions to avoid 0-size canvas errors
  width = Math.max(width, 100);
  height = Math.max(height, 141);

  // Scale up by device pixel ratio for crisp rendering on high-DPI screens
  const renderWidth = Math.floor(width * dpr);
  const renderHeight = Math.floor(height * dpr);

  return {
    width,
    height,
    renderWidth,
    renderHeight,
    dpr,
  };
}

export function useArtworkRenderer({
  seed,
  foldCount,
  autoRender = true,
}: UseArtworkRendererOptions): UseArtworkRendererReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsLoading(true);
    setError(null);

    try {
      // Calculate dimensions the same way as on-chain getOptimalDimensions()
      const dims = getOptimalDimensions(canvas);
      await renderToCanvas(canvas, seed, dims.renderWidth, dims.renderHeight, foldCount);
    } catch (err) {
      console.error('Render error:', err);
      setError(err instanceof Error ? err : new Error('Failed to render artwork'));
    } finally {
      setIsLoading(false);
    }
  }, [seed, foldCount]);

  useEffect(() => {
    if (autoRender && seed) {
      render();
    }
  }, [autoRender, seed, render]);

  return {
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    isLoading,
    error,
    render,
  };
}
