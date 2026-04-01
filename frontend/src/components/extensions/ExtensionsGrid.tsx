'use client';

import { ExtensionCard } from './ExtensionCard';
import type { TokenMetadata } from '@/types';

interface ExtensionItem {
  tokenId: number;
  metadata?: TokenMetadata;
}

interface ExtensionsGridProps {
  items: ExtensionItem[];
}

export function ExtensionsGrid({ items }: ExtensionsGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">no extensions minted yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {items.map((item) => (
        <ExtensionCard key={item.tokenId} tokenId={item.tokenId} metadata={item.metadata} />
      ))}
    </div>
  );
}
