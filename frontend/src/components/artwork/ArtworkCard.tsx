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
  const seedNumber = seedToNumber(token.seed);

  return (
    <Link
      href={`/token/${token.id}`}
      className={cn(
        'group block relative',
        className
      )}
    >
      {/* Artwork */}
      <div className="relative aspect-[4/5] overflow-hidden bg-background">
        <ArtworkCanvas
          seed={seedNumber}
          width={400}
          height={500}
          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
      </div>

      {/* Info */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>#{token.id}</span>
        <span className="text-muted">fold {token.foldId}</span>
      </div>
    </Link>
  );
}
