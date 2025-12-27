'use client';

import Link from 'next/link';
import { ArtworkCard } from '@/components/artwork/ArtworkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWindowTokens } from '@/hooks/useWindowTokens';
import { useWindowMintCounts } from '@/hooks/useWindowMintCounts';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

interface WindowPageProps {
  params: { windowId: string };
}

function WindowSkeleton() {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-8 w-48 mb-2" />
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

function WindowNotFound({ windowId }: { windowId: number }) {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          <Link
            href="/collection"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
          >
            <span>←</span>
            <span>back to collection</span>
          </Link>

          <div className="text-center py-20">
            <h1 className="text-2xl mb-4">window {windowId}</h1>
            <p className="text-muted mb-6">no pieces found in this window</p>
            <Link
              href="/collection"
              className="text-sm underline underline-offset-4 hover:text-muted transition-colors"
            >
              view all pieces
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function WindowCollection({ windowId }: { windowId: number }) {
  const { tokens, count, isLoading } = useWindowTokens(windowId);
  const { windowMintCounts, total: totalPieces } = useWindowMintCounts();

  // Get total number of windows for navigation context
  const windowIds = Array.from(windowMintCounts.keys()).sort((a, b) => b - a);
  const currentIndex = windowIds.indexOf(windowId);
  const prevWindow = currentIndex < windowIds.length - 1 ? windowIds[currentIndex + 1] : null;
  const nextWindow = currentIndex > 0 ? windowIds[currentIndex - 1] : null;

  if (isLoading && tokens.length === 0) {
    return <WindowSkeleton />;
  }

  if (!isLoading && count === 0) {
    return <WindowNotFound windowId={windowId} />;
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Back navigation */}
          <Link
            href="/collection"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-8"
          >
            <span>←</span>
            <span>back to collection</span>
          </Link>

          {/* Header */}
          <div className="mb-12">
            <h1 className="text-2xl mb-2">window {windowId}</h1>
            <p className="text-sm text-muted">
              {count} piece{count !== 1 ? 's' : ''} minted in this window
            </p>
          </div>

          {/* Tokens grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {tokens.map((token) => (
              <ArtworkCard key={token.id} token={token} />
            ))}
          </div>

          {/* Window navigation */}
          {windowIds.length > 1 && (
            <div className="flex items-center justify-between mt-12 pt-8 border-t border-border">
              {prevWindow !== null ? (
                <Link
                  href={`/window/${prevWindow}`}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  ← window {prevWindow}
                </Link>
              ) : (
                <div />
              )}

              <span className="text-sm text-muted">
                {windowIds.indexOf(windowId) + 1} of {windowIds.length} windows
              </span>

              {nextWindow !== null ? (
                <Link
                  href={`/window/${nextWindow}`}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  window {nextWindow} →
                </Link>
              ) : (
                <div />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WindowPage({ params }: WindowPageProps) {
  const windowId = parseInt(params.windowId, 10);

  if (IS_PRE_LAUNCH) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto text-center py-20">
            <h1 className="text-2xl mb-4">coming soon</h1>
            <p className="text-muted mb-6">
              the collection will populate as mint windows open
            </p>
            <Link
              href="/collection"
              className="text-sm underline underline-offset-4 hover:text-muted transition-colors"
            >
              back to collection
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isNaN(windowId) || windowId < 1) {
    return <WindowNotFound windowId={windowId || 0} />;
  }

  return <WindowCollection windowId={windowId} />;
}


