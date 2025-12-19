'use client';

import { ArtworkCanvas } from './ArtworkCanvas';
import { cn } from '@/lib/utils';

interface ArtworkDetailProps {
  seed: number;
  foldCount: number;
  className?: string;
}

export function ArtworkDetail({ seed, foldCount, className }: ArtworkDetailProps) {
  return (
    <div className={cn('relative', className)}>
      <ArtworkCanvas
        seed={seed}
        foldCount={foldCount}
        width={1200}
        height={1697}  // A4 aspect ratio (1:√2) - must match fold-core.js
        className="w-full max-w-2xl mx-auto"
      />
    </div>
  );
}
