'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ArtworkHTMLProps {
  seed: number;
  foldCount?: number;
  className?: string;
  showLoading?: boolean;
  width?: number;
  height?: number;
}

export function ArtworkHTML({
  seed,
  foldCount,
  className,
  showLoading = true,
  width = 600,
  height = 849,
}: ArtworkHTMLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import both modules
        const [foldCore, renderModule] = await Promise.all([
          import('@/lib/fold-core.js'),
          import('@/lib/render-to-html.js'),
        ]);

        if (cancelled) return;

        // Generate params (pass null if no foldCount to let it generate one)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = (foldCore as any).generateAllParams(seed, 1200, 1697, 0, foldCount ?? null);

        // Render to HTML at display size (not high-DPI)
        // Browser fonts are vector-based so they render crisp regardless
        // This matches canvas which renders at display size then upscales
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (renderModule as any).renderToHTML({
          folds: params.folds,
          seed: params.seed,
          outputWidth: width,
          outputHeight: height,
          bgColor: params.palette.bg,
          textColor: params.palette.text,
          accentColor: params.palette.accent,
          cellWidth: params.cells.cellW,
          cellHeight: params.cells.cellH,
          renderMode: params.renderMode,
          showEmptyCells: params.showEmptyCells,
          multiColor: params.multiColor,
          levelColors: params.levelColors,
          foldStrategy: params.foldStrategy,
          paperProperties: params.paperProperties,
          showCreaseLines: params.showCreaseLines,
        });

        if (cancelled) return;

        // Insert HTML directly (no scaling needed - fonts render crisp at any size)
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `width: ${width}px; height: ${height}px;`;
        wrapper.innerHTML = result.html;

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(wrapper);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to render HTML artwork:', err);
        setError(err instanceof Error ? err.message : 'Failed to render');
        setIsLoading(false);
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [seed, foldCount, width, height]);

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ width, height }}
    >
      <div
        ref={containerRef}
        className={cn(
          'w-full h-full',
          isLoading && showLoading && 'opacity-0'
        )}
      />

      {isLoading && showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="text-sm text-muted animate-pulse">loading...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}
    </div>
  );
}
