'use client';

import { ArtworkCanvas } from './ArtworkCanvas';
import { cn } from '@/lib/utils';

interface ArtworkDetailProps {
  seed: number;
  className?: string;
}

export function ArtworkDetail({ seed, className }: ArtworkDetailProps) {
  return (
    <div className={cn('relative', className)}>
      <ArtworkCanvas
        seed={seed}
        width={1200}
        height={1500}
        className="w-full max-w-2xl mx-auto"
      />
    </div>
  );
}
