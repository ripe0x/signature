"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArtworkCard } from "@/components/artwork/ArtworkCard";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCollection, type CollectionToken } from "@/hooks/useCollection";
import {
  IS_PRE_LAUNCH,
  IS_TOKEN_LIVE,
  SAMPLE_SEEDS,
  CONTRACTS,
} from "@/lib/contracts";

interface WindowGroup {
  windowId: number;
  tokens: CollectionToken[];
}

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
            {IS_TOKEN_LIVE ? (
              <>
                <div className="text-lg mb-2">
                  $LESS is live — nft coming soon
                </div>
                <p className="text-sm text-muted mb-4">
                  the recursive token is trading. once the nft contract deploys,
                  each burn will open a mint window and the collection will
                  begin.
                </p>
                <div className="flex gap-3">
                  <a
                    href={`https://www.nftstrategy.fun/strategies/0x9c2ca573009f181eac634c4d6e44a0977c24f335`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      trade $LESS
                    </Button>
                  </a>
                  <Link href="/about">
                    <Button variant="outline" size="sm">
                      learn how it works
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-lg mb-2">not yet launched</div>
                <p className="text-sm text-muted mb-4">
                  the collection will populate as the recursive token burns and
                  mint windows open. each piece will be tied to a specific burn
                  event.
                </p>
                <Link href="/about">
                  <Button variant="outline" size="sm">
                    learn how it works
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Sample Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">sample outputs</h2>
              <span className="text-sm text-muted">
                not minted — for preview only
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {SAMPLE_SEEDS.map((seed, index) => (
                <div key={seed} className="group">
                  <div className="relative aspect-[1/1.414] overflow-hidden bg-background">
                    <ArtworkCanvas seed={seed} className="w-full h-full" />
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

  const { tokens, total, isLoading, hasMore, totalPages } = useCollection(page);

  // Group tokens by windowId, sorted by most recent window first
  const windowGroups: WindowGroup[] = useMemo(() => {
    const groups = new Map<number, CollectionToken[]>();

    // Group tokens by windowId
    for (const token of tokens) {
      const existing = groups.get(token.windowId) || [];
      existing.push(token);
      groups.set(token.windowId, existing);
    }

    // Convert to array and sort by windowId descending (most recent first)
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([windowId, windowTokens]) => ({
        windowId,
        // Sort tokens within window by id descending (newest first)
        tokens: windowTokens.sort((a, b) => b.id - a.id),
      }));
  }, [tokens]);

  if (isLoading && tokens.length === 0) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="mb-12">
              <Skeleton className="h-8 w-40 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-[1/1.414]" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-2xl mb-2">collection</h1>
            <p className="text-sm text-muted">
              {total} pieces across {windowGroups.length} window
              {windowGroups.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Empty state */}
          {tokens.length === 0 && (
            <div className="text-center py-20">
              <p className="text-muted">no tokens minted yet</p>
            </div>
          )}

          {/* Window groups */}
          <div className="space-y-16">
            {windowGroups.map((group) => (
              <section key={group.windowId}>
                {/* Window header */}
                <div className="flex items-baseline gap-4 mb-6 pb-3 border-b border-border">
                  <h2 className="text-lg">window {group.windowId}</h2>
                  {/* <span className="text-sm text-muted">
                    {group.tokens.length} piece
                    {group.tokens.length !== 1 ? "s" : ""}
                  </span> */}
                </div>

                {/* Tokens grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {group.tokens.map((token) => (
                    <ArtworkCard key={token.id} token={token} />
                  ))}
                </div>
              </section>
            ))}
          </div>

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
