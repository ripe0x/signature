'use client';

import Link from 'next/link';
import { cn, seedToNumber } from '@/lib/utils';
import { ArtworkCanvas } from './ArtworkCanvas';
import type { CollectionToken } from '@/hooks/useCollection';

interface ArtworkCardProps {
  token: CollectionToken;
  className?: string;
}

export function ArtworkCard({ token, className }: ArtworkCardProps) {
  // Use same seed conversion as detail page (useToken)
  const seedNumber = token.seed !== '0x0' ? seedToNumber(token.seed) : 0;
  const hasSeed = token.seed !== '0x0' && seedNumber > 0;

  return (
    <Link
      href={`/token/${token.id}`}
      className={cn(
        'group block relative',
        className
      )}
    >
      {/* Artwork - local render with animation_url fallback */}
      <div className="relative aspect-[1/1.414] overflow-hidden bg-background">
        {hasSeed ? (
          <ArtworkCanvas
            seed={seedNumber}
            foldCount={token.windowId}
            width={1200}
            height={1697}
            className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : token.metadata?.animation_url ? (
          <iframe
            src={token.metadata.animation_url}
            className="w-full h-full border-0 pointer-events-none"
            sandbox="allow-scripts"
            title={`LESS #${token.id}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted">
            loading...
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
      </div>

      {/* Info */}
      <div className="mt-3 text-sm">
        <span>LESS #{token.id}</span>
      </div>
    </Link>
  );
}
