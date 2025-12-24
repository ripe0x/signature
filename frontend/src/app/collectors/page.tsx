"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useEnsName } from "wagmi";
import { useLeaderboard, type Collector } from "@/hooks/useLeaderboard";
import { truncateAddress, generateUnicodeProgressBar } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";

type SortField = "rank" | "tokens" | "windows";
type SortDir = "asc" | "desc";

// Owner address excluded from rankings (shown at bottom greyed out)
const EXCLUDED_ADDRESS = "0xcb43078c32423f5348cab5885911c3b5fae217f9";

function CollectorRow({
  collector,
  rank,
  totalWindows,
  excluded = false,
}: {
  collector: Collector;
  rank: number | null;
  totalWindows: number;
  excluded?: boolean;
}) {
  const { data: ensName } = useEnsName({
    address: collector.address as `0x${string}`,
  });

  const displayName = ensName || truncateAddress(collector.address);
  const completionPercent = Math.round(
    (collector.windowCount / totalWindows) * 100
  );

  const progressBar = generateUnicodeProgressBar(completionPercent, 5);

  return (
    <Link
      href={`/collector/${collector.address}`}
      className={`grid grid-cols-[2rem_1fr_3.5rem] md:grid-cols-[2.5rem_1fr_3rem_4rem_3.5rem] gap-2 md:gap-3 py-2 md:py-2.5 px-3 md:px-4 border-b border-border hover:bg-foreground/5 transition-colors items-center text-[11px] md:text-xs ${
        excluded ? "opacity-40" : ""
      }`}
    >
      {/* Rank */}
      <div className="text-muted">
        {excluded ? "—" : rank === 1 ? "1" : rank === 2 ? "2" : rank === 3 ? "3" : rank}
      </div>

      {/* Collector */}
      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
        <span className="truncate">{displayName}</span>
        {collector.isFullCollector && (
          <span
            className={`text-[9px] md:text-[10px] px-1 py-0.5 border shrink-0 ${
              excluded ? "border-muted" : "border-foreground"
            }`}
            title="Full collector - owns token from every window"
          >
            FULL
          </span>
        )}
      </div>

      {/* Tokens - hidden on mobile */}
      <div className="text-right tabular-nums hidden md:block">{collector.tokenCount}</div>

      {/* Windows */}
      <div className="text-right tabular-nums">
        {collector.windowCount}/{totalWindows}
      </div>

      {/* Completion with progress bar - hidden on mobile */}
      <div className="text-right hidden md:block">
        <div className="text-muted tabular-nums">{completionPercent}%</div>
        <div className="text-[8px] text-muted/60 tracking-tighter leading-none mt-0.5">{progressBar}</div>
      </div>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-12">
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[3rem_1fr_5rem_6rem_5rem] gap-4 py-3 px-4 border-b border-border"
              >
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-8 ml-auto" />
                <Skeleton className="h-4 w-12 ml-auto" />
                <Skeleton className="h-4 w-10 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollectorsPage() {
  const { data, isLoading, error } = useLeaderboard();
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showFullOnly, setShowFullOnly] = useState(false);
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 50;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "rank" ? "asc" : "desc");
    }
    setPage(0);
  };

  // Separate excluded collector from main list
  const { rankedCollectors, excludedCollector } = useMemo((): {
    rankedCollectors: Collector[];
    excludedCollector: Collector | null;
  } => {
    if (!data) return { rankedCollectors: [], excludedCollector: null };

    const excluded = data.collectors.find(
      (c) => c.address.toLowerCase() === EXCLUDED_ADDRESS
    ) || null;
    const ranked = data.collectors.filter(
      (c) => c.address.toLowerCase() !== EXCLUDED_ADDRESS
    );

    return { rankedCollectors: ranked, excludedCollector: excluded };
  }, [data]);

  const sortedCollectors = useMemo(() => {
    if (!rankedCollectors.length) return [];

    let collectors = [...rankedCollectors];

    // Filter
    if (showFullOnly) {
      collectors = collectors.filter((c) => c.isFullCollector);
    }

    // Sort - default is by windows first, then tokens
    collectors.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rank":
          // Default: windows first, then tokens
          cmp = b.windowCount - a.windowCount;
          if (cmp === 0) cmp = b.tokenCount - a.tokenCount;
          break;
        case "tokens":
          cmp = b.tokenCount - a.tokenCount;
          break;
        case "windows":
          cmp = b.windowCount - a.windowCount;
          if (cmp === 0) cmp = b.tokenCount - a.tokenCount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return collectors;
  }, [rankedCollectors, sortField, sortDir, showFullOnly]);

  const paginatedCollectors = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedCollectors.slice(start, start + PAGE_SIZE);
  }, [sortedCollectors, page]);

  const totalPages = Math.ceil(sortedCollectors.length / PAGE_SIZE);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-4xl mx-auto text-center py-20">
            <p className="text-muted mb-4">
              {error ? "failed to load leaderboard" : "no data available"}
            </p>
            <p className="text-sm text-muted">
              collector data is indexed periodically. check back soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getRank = (collector: Collector) => {
    return sortedCollectors.indexOf(collector) + 1;
  };

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl mb-2">collectors</h1>
            <p className="text-sm text-muted">
              {rankedCollectors.length} collectors · {data.totalTokens} tokens ·{" "}
              {data.fullCollectors.filter(a => a.toLowerCase() !== EXCLUDED_ADDRESS).length} full collector
              {data.fullCollectors.filter(a => a.toLowerCase() !== EXCLUDED_ADDRESS).length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => {
                setShowFullOnly(!showFullOnly);
                setPage(0);
              }}
              className={`text-sm px-3 py-1.5 border transition-colors ${
                showFullOnly
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground"
              }`}
            >
              full collectors only
            </button>
            <span className="text-sm text-muted">
              showing {sortedCollectors.length} of {rankedCollectors.length}
            </span>
          </div>

          {/* Table */}
          <div className="border border-border">
            {/* Header */}
            <div className="grid grid-cols-[2rem_1fr_3.5rem] md:grid-cols-[2.5rem_1fr_3rem_4rem_3.5rem] gap-2 md:gap-3 py-1.5 md:py-2 px-3 md:px-4 border-b border-border bg-foreground/5 text-[10px] md:text-[11px] text-muted">
              <button
                onClick={() => handleSort("rank")}
                className="text-left hover:text-foreground transition-colors"
              >
                #
                {sortField === "rank" && (
                  <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
              <div>collector</div>
              <button
                onClick={() => handleSort("tokens")}
                className="text-right hover:text-foreground transition-colors hidden md:block"
              >
                tokens
                {sortField === "tokens" && (
                  <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
              <button
                onClick={() => handleSort("windows")}
                className="text-right hover:text-foreground transition-colors"
              >
                windows
                {sortField === "windows" && (
                  <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
              <div className="hidden md:block"></div>
            </div>

            {/* Rows */}
            {paginatedCollectors.length === 0 && !excludedCollector ? (
              <div className="py-12 text-center text-muted">
                no collectors found
              </div>
            ) : (
              <>
                {paginatedCollectors.map((collector) => (
                  <CollectorRow
                    key={collector.address}
                    collector={collector}
                    rank={getRank(collector)}
                    totalWindows={data.totalWindows}
                  />
                ))}
                {/* Excluded collector shown at bottom, greyed out */}
                {excludedCollector && page === totalPages - 1 && (
                  <CollectorRow
                    collector={excludedCollector}
                    rank={null}
                    totalWindows={data.totalWindows}
                    excluded
                  />
                )}
              </>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
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
                disabled={page >= totalPages - 1}
              >
                next
              </Button>
            </div>
          )}

          {/* Last updated */}
          <div className="mt-8 text-xs text-muted text-center">
            last updated: {new Date(data.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
