'use client';

import { useArtworkRenderer } from '@/hooks/useArtworkRenderer';
import { cn } from '@/lib/utils';

interface ArtworkCanvasProps {
  seed: number;
  foldCount?: number;
  width?: number;
  height?: number;
  className?: string;
  showLoading?: boolean;
  onClick?: () => void;
}

export function ArtworkCanvas({
  seed,
  foldCount,
  width = 600,
  height = 848, // A4 aspect ratio (1:√2) - 600 * √2 ≈ 848
  className,
  showLoading = true,
  onClick,
}: ArtworkCanvasProps) {
  const { canvasRef, isLoading, error } = useArtworkRenderer({
    seed,
    foldCount,
    width,
    height,
  });

  return (
    <div
      className={cn('relative', onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'max-w-full h-auto',
          isLoading && showLoading && 'opacity-0'
        )}
        style={{
          aspectRatio: `${width}/${height}`,
          width: '100%',
        }}
      />

      {isLoading && showLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
        >
          <span className="text-sm text-muted animate-pulse">loading...</span>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
        >
          <span className="text-sm text-red-500">failed to render</span>
        </div>
      )}
    </div>
  );
}
