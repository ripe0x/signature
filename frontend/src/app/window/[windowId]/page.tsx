'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useEnsName } from 'wagmi';
import { ArtworkCard } from '@/components/artwork/ArtworkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWindowTokens } from '@/hooks/useWindowTokens';
import { useWindowMintCounts } from '@/hooks/useWindowMintCounts';
import { useWindowDetails } from '@/hooks/useWindowDetails';
import { useCurrentWindowTokens } from '@/hooks/useCurrentWindowTokens';
import { useMintWindow } from '@/hooks/useMintWindow';
import { IS_PRE_LAUNCH } from '@/lib/contracts';
import { truncateAddress } from '@/lib/utils';

function CollectorChip({ address, count }: { address: `0x${string}`; count: number }) {
  const { data: ensName } = useEnsName({
    address,
    chainId: 1,
  });

  return (
    <Link
      href={`/collector/${address}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-muted/10 hover:bg-muted/20 transition-colors"
    >
      <span className={ensName ? '' : 'font-mono'}>
        {ensName || truncateAddress(address)}
      </span>
      <span className="text-muted">×{count}</span>
    </Link>
  );
}

interface WindowPageProps {
  params: { windowId: string };
}

function WindowSkeleton() {
  return (
    <div className="min-h-screen pt-20 lg:pt-28">
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
    <div className="min-h-screen pt-20 lg:pt-28">
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
            <p className="text-muted mb-6">no LESS found in this window</p>
            <Link
              href="/collection"
              className="text-sm underline underline-offset-4 hover:text-muted transition-colors"
            >
              view collection
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function WindowCollection({ windowId }: { windowId: number }) {
  const { tokens: apiTokens, count: apiCount, isLoading } = useWindowTokens(windowId);
  const { windowMintCounts } = useWindowMintCounts();
  const { startTime: apiStartTime, endTime, isLoading: isLoadingDetails } = useWindowDetails(windowId);
  const { isActive, windowId: activeWindowId, timeRemaining, windowDuration } = useMintWindow();
  const { tokens: currentWindowTokens, count: currentWindowCount } = useCurrentWindowTokens();

  // Check if this is the currently active window
  const isThisWindowActive = isActive && windowId === activeWindowId;

  // Merge API tokens with real-time current window tokens if this is the active window
  const tokens = useMemo(() => {
    if (!isThisWindowActive || currentWindowTokens.length === 0) {
      return apiTokens;
    }

    // Create a Set of existing token IDs from API
    const existingIds = new Set(apiTokens.map(t => t.id));

    // Add current window tokens that aren't already in API results
    const newTokens = currentWindowTokens
      .filter(t => !existingIds.has(t.id))
      .map(t => ({
        id: t.id,
        windowId: t.windowId,
        seed: t.seed,
        owner: t.owner,
        metadata: t.metadata,
      }));

    // Combine and sort by ID descending (newest first)
    return [...newTokens, ...apiTokens].sort((a, b) => b.id - a.id);
  }, [apiTokens, currentWindowTokens, isThisWindowActive]);

  // Use real-time count for active window
  const count = isThisWindowActive ? Math.max(currentWindowCount, apiCount) : apiCount;

  // Calculate start time for active window
  const startTime = isThisWindowActive && windowDuration > 0
    ? Math.floor(Date.now() / 1000) - (windowDuration - timeRemaining)
    : apiStartTime;

  // Get total number of windows for navigation context
  const windowIds = Array.from(windowMintCounts.keys()).sort((a, b) => b - a);
  const currentIndex = windowIds.indexOf(windowId);
  const prevWindow = currentIndex < windowIds.length - 1 ? windowIds[currentIndex + 1] : null;
  const nextWindow = currentIndex > 0 ? windowIds[currentIndex - 1] : null;

  // Calculate token ID range
  const tokenIdRange = useMemo(() => {
    if (tokens.length === 0) return null;
    const ids = tokens.map((t) => t.id);
    return { min: Math.min(...ids), max: Math.max(...ids) };
  }, [tokens]);

  // Calculate collector breakdown (current owners)
  const collectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      if (token.owner) {
        const addr = token.owner.toLowerCase();
        counts.set(addr, (counts.get(addr) || 0) + 1);
      }
    }
    // Sort by count descending
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([address, tokenCount]) => ({ address: address as `0x${string}`, count: tokenCount }));
  }, [tokens]);

  if (isLoading && tokens.length === 0) {
    return <WindowSkeleton />;
  }

  if (!isLoading && count === 0) {
    return <WindowNotFound windowId={windowId} />;
  }

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
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
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-3">
              <h1 className="text-2xl">window {windowId}</h1>
              {isThisWindowActive && (
                <span className="text-sm text-green-600">
                  <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-1.5 align-middle" />
                  <span>minting now</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
              <span>{count.toLocaleString()} LESS</span>
              {tokenIdRange && (
                <span>#{tokenIdRange.min}–{tokenIdRange.max}</span>
              )}
              {startTime && (isThisWindowActive || !isLoadingDetails) && (
                <span>{formatDate(startTime)} at {formatTime(startTime)}</span>
              )}
            </div>
          </div>

          {/* Collectors section */}
          {collectors.length > 0 && (
            <div className="mb-10 pb-8 border-b border-border">
              <h2 className="text-sm text-muted mb-3">
                {collectors.length.toLocaleString()} collector{collectors.length !== 1 ? 's' : ''}
              </h2>
              <div className="flex flex-wrap gap-2">
                {collectors.slice(0, 12).map(({ address, count: tokenCount }) => (
                  <CollectorChip key={address} address={address} count={tokenCount} />
                ))}
                {collectors.length > 12 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs text-muted">
                    +{(collectors.length - 12).toLocaleString()} more
                  </span>
                )}
              </div>
            </div>
          )}

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
      <div className="min-h-screen pt-20 lg:pt-28">
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

  if (isNaN(windowId) || windowId < 0) {
    return <WindowNotFound windowId={windowId || 0} />;
  }

  return <WindowCollection windowId={windowId} />;
}







