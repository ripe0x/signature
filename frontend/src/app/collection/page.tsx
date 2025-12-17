'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArtworkGrid } from '@/components/artwork/ArtworkGrid';
import { ArtworkCanvas } from '@/components/artwork/ArtworkCanvas';
import { Button } from '@/components/ui/Button';
import { useCollection } from '@/hooks/useCollection';
import { IS_PRE_LAUNCH, SAMPLE_SEEDS } from '@/lib/contracts';

type SortOption = 'newest' | 'oldest' | 'id';

function PreLaunchCollection() {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-2xl mb-2">collection</h1>
            <p className="text-sm text-muted">
              coming soon — preview samples below
            </p>
          </div>

          {/* Coming Soon Notice */}
          <div className="mb-12 p-6 border border-border">
            <div className="text-lg mb-2">not yet launched</div>
            <p className="text-sm text-muted mb-4">
              the collection will populate as the recursive token burns and mint windows open.
              each piece will be tied to a specific burn event.
            </p>
            <Link href="/about">
              <Button variant="outline" size="sm">
                learn how it works
              </Button>
            </Link>
          </div>

          {/* Sample Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">sample outputs</h2>
              <span className="text-sm text-muted">not minted — for preview only</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {SAMPLE_SEEDS.map((seed, index) => (
                <div key={seed} className="group">
                  <div className="relative aspect-[4/5] overflow-hidden bg-background">
                    <ArtworkCanvas
                      seed={seed}
                      width={400}
                      height={500}
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">sample #{index + 1}</span>
                    <span className="text-muted">—</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveCollection() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortOption>('newest');

  const { tokens, total, isLoading, hasMore, totalPages } = useCollection(page);

  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.id - b.id;
      case 'id':
        return b.id - a.id;
      case 'newest':
      default:
        return b.id - a.id;
    }
  });

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <h1 className="text-2xl mb-2">collection</h1>
              <p className="text-sm text-muted">
                {total} pieces minted
              </p>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted">sort:</span>
              <div className="flex gap-2">
                {(['newest', 'oldest'] as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => setSort(option)}
                    className={`text-sm px-3 py-1.5 transition-colors ${
                      sort === option
                        ? 'bg-foreground text-background'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid */}
          <ArtworkGrid tokens={sortedTokens} isLoading={isLoading} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                prev
              </Button>

              <span className="text-sm text-muted">
                {page + 1} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
              >
                next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CollectionPage() {
  if (IS_PRE_LAUNCH) {
    return <PreLaunchCollection />;
  }

  return <LiveCollection />;
}
