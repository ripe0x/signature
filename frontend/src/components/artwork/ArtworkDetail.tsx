'use client';

import { ArtworkCanvas } from './ArtworkCanvas';
import { cn } from '@/lib/utils';

interface ArtworkDetailProps {
  seed: number;
  foldCount: number;
  animationUrl?: string;
  className?: string;
}

export function ArtworkDetail({ seed, foldCount, animationUrl, className }: ArtworkDetailProps) {
  return (
    <div className={cn('relative', className)}>
      <ArtworkCanvas
        seed={seed}
        foldCount={foldCount}
        animationUrl={animationUrl}
        className="w-full max-w-2xl mx-auto"
      />
    </div>
  );
}
