"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEnsName } from "wagmi";
import { useCollector, type CollectorToken } from "@/hooks/useLeaderboard";
import { truncateAddress, seedToNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";
import { CollectorBounty } from "@/components/bounties/CollectorBounty";

function TokenCard({ token }: { token: CollectorToken }) {
  const seedNumber = seedToNumber(token.seed as `0x${string}`);

  return (
    <Link href={`/token/${token.tokenId}`} className="group block relative">
      <div className="relative aspect-[1/1.414] overflow-hidden bg-background">
        <ArtworkCanvas
          seed={seedNumber}
          foldCount={token.windowId}
          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>LESS {token.tokenId}</span>
        <span className="text-muted">Window {token.windowId}</span>
      </div>
    </Link>
  );
}

function WindowProgress({
  collected,
  total,
  selectedWindow,
  onSelectWindow,
}: {
  collected: number[];
  total: number;
  selectedWindow: number | null;
  onSelectWindow: (windowId: number | null) => void;
}) {
  const windows = [];
  // Start at 0 to include Window 0
  for (let i = 0; i < total; i++) {
    const hasWindow = collected.includes(i);
    const isSelected = selectedWindow === i;
    windows.push(
      <button
        key={i}
        onClick={() => onSelectWindow(isSelected ? null : (hasWindow ? i : null))}
        disabled={!hasWindow}
        className={`w-8 h-8 flex items-center justify-center text-xs border transition-all ${
          isSelected
            ? "border-foreground bg-foreground text-background ring-2 ring-foreground ring-offset-2 ring-offset-background"
            : hasWindow
            ? "border-foreground bg-foreground text-background hover:opacity-80 cursor-pointer"
            : "border-border text-muted cursor-not-allowed"
        }`}
        title={hasWindow ? `Filter to Window ${i}` : `Window ${i} - not collected`}
      >
        {i}
      </button>
    );
  }
  return <div className="flex flex-wrap gap-2">{windows}</div>;
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-12">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="flex flex-wrap gap-2 mb-12">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="w-8 h-8" />
            ))}
          </div>
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[1/1.414]" />
                <Skeleton className="h-4 w-20 mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollectorPage() {
  const params = useParams();
  const address = params.address as string;

  const [selectedWindow, setSelectedWindow] = useState<number | null>(null);

  const { data: collector, isLoading, error } = useCollector(address);
  const { data: ensName } = useEnsName({
    address: address as `0x${string}`,
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !collector) {
    return (
      <div className="min-h-screen pt-20 lg:pt-28">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <Link
              href="/collectors"
              className="text-sm text-muted hover:text-foreground transition-colors inline-block mb-8"
            >
              ← collectors
            </Link>
            <div className="text-center py-20">
              <p className="text-muted mb-2">collector not found</p>
              <p className="text-sm text-muted">
                this address has not collected any LESS tokens
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = ensName || truncateAddress(address, 6);
  const completionPercent = Math.round(
    (collector.windowCount / (collector.totalWindows || 1)) * 100
  );

  // Sort all tokens by tokenId, optionally filter by window
  const sortedTokens = [...collector.tokens]
    .filter((token) => selectedWindow === null || token.windowId === selectedWindow)
    .sort((a, b) => a.tokenId - b.tokenId);

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Back link */}
          <Link
            href="/collectors"
            className="text-sm text-muted hover:text-foreground transition-colors inline-block mb-8"
          >
            ← collectors
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-2xl">{displayName}</h1>
              {collector.isFullCollector && (
                <span className="text-sm px-2 py-1 border border-foreground">
                  FULL COLLECTOR
                </span>
              )}
            </div>
            <p className="text-sm text-muted font-mono">{address}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="border border-border p-4">
              <div className="text-2xl mb-1">{collector.tokenCount}</div>
              <div className="text-sm text-muted">tokens</div>
            </div>
            <div className="border border-border p-4">
              <div className="text-2xl mb-1">
                {collector.windowCount}/{collector.totalWindows}
              </div>
              <div className="text-sm text-muted">windows</div>
            </div>
            <div className="border border-border p-4">
              <div className="text-2xl mb-1">#{collector.rank}</div>
              <div className="text-sm text-muted">rank</div>
            </div>
            <div className="border border-border p-4">
              <div className="text-2xl mb-1">{completionPercent}%</div>
              <div className="text-sm text-muted">completion</div>
            </div>
          </div>

          {/* Bounty */}
          <div className="mb-12">
            <CollectorBounty address={address} />
          </div>

          {/* Window Progress */}
          <div className="mb-12">
            <h2 className="text-lg mb-4">window progress</h2>
            <WindowProgress
              collected={collector.windowsCollected}
              total={collector.totalWindows || 0}
              selectedWindow={selectedWindow}
              onSelectWindow={setSelectedWindow}
            />
          </div>

          {/* Collection */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-lg">collection</h2>
              {selectedWindow !== null && (
                <span className="text-sm text-muted">
                  showing Window {selectedWindow} · {sortedTokens.length} piece{sortedTokens.length !== 1 ? "s" : ""}
                  <button
                    onClick={() => setSelectedWindow(null)}
                    className="ml-2 text-muted hover:text-foreground transition-colors"
                  >
                    (clear)
                  </button>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {sortedTokens.map((token) => (
                <TokenCard key={token.tokenId} token={token} />
              ))}
            </div>
          </div>

          {/* External links */}
          <div className="flex gap-4 pt-8 mt-16 border-t border-border">
            <a
              href={`https://etherscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              etherscan →
            </a>
            <a
              href={`https://opensea.io/${address}/say-less`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              opensea →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
