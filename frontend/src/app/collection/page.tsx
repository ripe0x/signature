'use client';

import { useState } from 'react';
import { ArtworkGrid } from '@/components/artwork/ArtworkGrid';
import { Button } from '@/components/ui/Button';
import { useCollection } from '@/hooks/useCollection';

type SortOption = 'newest' | 'oldest' | 'id';

export default function CollectionPage() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortOption>('newest');

  const { tokens, total, isLoading, hasMore, totalPages } = useCollection(page);

  // Sort tokens based on selection
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
