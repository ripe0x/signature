'use client';

import { ArtworkCard } from './ArtworkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CollectionToken } from '@/hooks/useCollection';

interface ArtworkGridProps {
  tokens: CollectionToken[];
  isLoading?: boolean;
}

export function ArtworkGrid({ tokens, isLoading }: ArtworkGridProps) {
  if (isLoading && tokens.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/5]" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">no tokens minted yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {tokens.map((token) => (
        <ArtworkCard key={token.id} token={token} />
      ))}
    </div>
  );
}
