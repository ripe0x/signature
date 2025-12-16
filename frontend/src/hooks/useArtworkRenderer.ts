'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  generateAllParams,
  renderToCanvas,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
} from '@/lib/fold-core';

interface UseArtworkRendererOptions {
  seed: number;
  width?: number;
  height?: number;
  autoRender?: boolean;
}

interface UseArtworkRendererReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  error: Error | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any | null;
  render: () => Promise<void>;
}

export function useArtworkRenderer({
  seed,
  width = REFERENCE_WIDTH,
  height = REFERENCE_HEIGHT,
  autoRender = true,
}: UseArtworkRendererOptions): UseArtworkRendererReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [params, setParams] = useState<any | null>(null);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsLoading(true);
    setError(null);

    try {
      // Generate parameters from seed
      const renderParams = await generateAllParams(seed);
      setParams(renderParams);

      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Render to canvas with all params spread
      await renderToCanvas({
        canvas,
        ...renderParams,
        width,
        height,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to render artwork'));
    } finally {
      setIsLoading(false);
    }
  }, [seed, width, height]);

  useEffect(() => {
    if (autoRender && seed) {
      render();
    }
  }, [autoRender, seed, render]);

  return {
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    isLoading,
    error,
    params,
    render,
  };
}
