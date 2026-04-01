'use client';

import Link from 'next/link';
import { normalizeTokenUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';

interface ExtensionCardProps {
  tokenId: number;
  metadata?: TokenMetadata;
}

export function ExtensionCard({ tokenId, metadata }: ExtensionCardProps) {
  const imageUrl = metadata?.image ? normalizeTokenUri(metadata.image) : undefined;

  return (
    <Link href={`/extensions/${tokenId}`} className="group block">
      <div className="relative aspect-square overflow-hidden bg-background border border-border">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={metadata?.name || `Extension #${tokenId}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted">
            metadata pending
          </div>
        )}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span>{metadata?.name || `Extension #${tokenId}`}</span>
        <span className="text-muted">#{tokenId}</span>
      </div>
    </Link>
  );
}
