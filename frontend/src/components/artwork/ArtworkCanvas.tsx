'use client';

import { useArtworkRenderer } from '@/hooks/useArtworkRenderer';
import { cn } from '@/lib/utils';

interface ArtworkCanvasProps {
  seed: number;
  foldCount?: number;
  animationUrl?: string;
  className?: string;
  showLoading?: boolean;
  onClick?: () => void;
}

export function ArtworkCanvas({
  seed,
  foldCount,
  animationUrl,
  className,
  showLoading = true,
  onClick,
}: ArtworkCanvasProps) {
  const { canvasRef, isLoading, error } = useArtworkRenderer({
    seed,
    foldCount,
  });

  // Fall back to animation_url iframe on error
  if (error && animationUrl) {
    return (
      <div
        className={cn('relative', onClick && 'cursor-pointer', className)}
        onClick={onClick}
      >
        <iframe
          src={animationUrl}
          className="w-full h-full border-0"
          style={{ aspectRatio: '1/1.414' }}
          sandbox="allow-scripts"
          title="On-chain artwork"
        />
      </div>
    );
  }

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
          aspectRatio: '1/1.414', // A4 aspect ratio (1:√2)
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

      {error && !animationUrl && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
        >
          <span className="text-sm text-red-500">failed to render</span>
        </div>
      )}
    </div>
  );
}
