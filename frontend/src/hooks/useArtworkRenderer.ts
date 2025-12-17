'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { renderToCanvas } from '@/lib/fold-core-wrapper';

interface UseArtworkRendererOptions {
  seed: number;
  foldCount?: number;
  width?: number;
  height?: number;
  autoRender?: boolean;
}

interface UseArtworkRendererReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  error: Error | null;
  render: () => Promise<void>;
}

export function useArtworkRenderer({
  seed,
  foldCount,
  width = 600,
  height = 750,
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
      await renderToCanvas(canvas, seed, width, height, foldCount);
    } catch (err) {
      console.error('Render error:', err);
      setError(err instanceof Error ? err : new Error('Failed to render artwork'));
    } finally {
      setIsLoading(false);
    }
  }, [seed, foldCount, width, height]);

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
