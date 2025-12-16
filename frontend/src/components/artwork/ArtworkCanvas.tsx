'use client';

import { useArtworkRenderer } from '@/hooks/useArtworkRenderer';
import { cn } from '@/lib/utils';

interface ArtworkCanvasProps {
  seed: number;
  width?: number;
  height?: number;
  className?: string;
  showLoading?: boolean;
}

export function ArtworkCanvas({
  seed,
  width = 600,
  height = 750,
  className,
  showLoading = true,
}: ArtworkCanvasProps) {
  const { canvasRef, isLoading, error } = useArtworkRenderer({
    seed,
    width,
    height,
  });

  return (
    <div className={cn('relative', className)}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={cn(
          'max-w-full h-auto',
          isLoading && showLoading && 'opacity-0'
        )}
        style={{ aspectRatio: `${width}/${height}` }}
      />

      {isLoading && showLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          <span className="text-sm text-muted animate-pulse">loading...</span>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          <span className="text-sm text-red-500">failed to render</span>
        </div>
      )}
    </div>
  );
}
