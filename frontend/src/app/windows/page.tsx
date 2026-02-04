"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAllWindows } from "@/hooks/useAllWindows";
import { useMintWindow } from "@/hooks/useMintWindow";
import { useTokenStats } from "@/hooks/useTokenStats";
import { useCurrentWindowTokens } from "@/hooks/useCurrentWindowTokens";
import { IS_PRE_LAUNCH } from "@/lib/contracts";
import { generateUnicodeProgressBar } from "@/lib/utils";

// Simple progress bar for table display
function TableProgressBar({ percentage }: { percentage: number }) {
  const progressBar = generateUnicodeProgressBar(percentage, 10);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] tracking-tighter">{progressBar}</span>
      <span className="tabular-nums">{percentage.toFixed(1)}%</span>
      <span className="text-muted">to mint window threshold</span>
    </div>
  );
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return (
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }) +
    " " +
    date
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase()
  );
}

function WindowsSkeleton() {
  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WindowsList() {
  const { windows, isLoading, totalWindows } = useAllWindows();
  const { isActive, windowId: activeWindowId, timeRemaining, windowDuration } = useMintWindow();
  const { buybackBalance } = useTokenStats();
  const { count: activeWindowMintCount } = useCurrentWindowTokens();

  // Calculate buyback progress percentage (threshold is 0.25 ETH)
  const buybackBalanceEth = Number(buybackBalance) / 1e18;
  const buybackPercent = Math.min((buybackBalanceEth / 0.25) * 100, 100);

  // Calculate active window time progress
  const activeWindowPercent = windowDuration > 0
    ? ((windowDuration - timeRemaining) / windowDuration) * 100
    : 0;

  // Calculate when the active window opened
  const activeWindowStartTime = windowDuration > 0
    ? Math.floor(Date.now() / 1000) - (windowDuration - timeRemaining)
    : 0;

  if (isLoading && windows.length === 0) {
    return <WindowsSkeleton />;
  }

  const totalLess = windows.reduce((sum, w) => sum + w.tokenCount, 0);

  // Next window ID (one after the most recent)
  const nextWindowId = windows.length > 0 ? windows[0].windowId + 1 : 0;

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl mb-2">mint windows</h1>
            <p className="text-sm text-muted">
              {totalWindows} mint window{totalWindows !== 1 ? "s" : ""} ·{" "}
              {totalLess.toLocaleString()} LESS
            </p>
          </div>

          {/* Empty state */}
          {windows.length === 0 && !isActive && (
            <div className="text-center py-20">
              <p className="text-muted mb-4">no windows yet</p>
              <Link
                href="/mint"
                className="text-sm underline underline-offset-4 hover:text-muted transition-colors"
              >
                go to mint
              </Link>
            </div>
          )}

          {/* Windows table */}
          <div className="border border-border">
            {/* Header */}
            <div className="grid grid-cols-[1fr_3rem] md:grid-cols-[1fr_8rem_3rem] gap-2 md:gap-3 py-1.5 md:py-2 px-3 md:px-4 border-b border-border bg-foreground/5 text-[10px] md:text-[11px] text-muted">
              <div>window</div>
              <div className="hidden md:block text-right whitespace-nowrap">opened</div>
              <div className="text-right">minted</div>
            </div>

            {/* Next window - waiting */}
            {!isActive && (
              <div className="grid grid-cols-[1fr_3rem] md:grid-cols-[1fr_8rem_3rem] gap-2 md:gap-3 py-2 md:py-2.5 px-3 md:px-4 border-b border-border items-center text-[11px] md:text-xs opacity-50">
                <div className="flex items-center gap-4">
                  <span>window {nextWindowId}</span>
                  <TableProgressBar percentage={buybackPercent} />
                </div>
                <div className="hidden md:block text-right text-muted">—</div>
                <div className="text-right text-muted">—</div>
              </div>
            )}

            {/* Active window - minting now */}
            {isActive && (
              <Link
                href="/mint"
                className="grid grid-cols-[1fr_3rem] md:grid-cols-[1fr_8rem_3rem] gap-2 md:gap-3 py-2 md:py-2.5 px-3 md:px-4 border-b border-border items-center text-[11px] md:text-xs hover:bg-foreground/5 transition-colors cursor-pointer bg-muted/5"
              >
                <div className="flex items-center gap-4">
                  <span>window {activeWindowId}</span>
                  <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-green-500 animate-pulse">
                    minting
                  </span>
                </div>
                <div className="hidden md:block text-right text-muted tabular-nums whitespace-nowrap">
                  {activeWindowStartTime > 0 ? formatDateTime(activeWindowStartTime) : "—"}
                </div>
                <div className="text-right tabular-nums">{activeWindowMintCount.toLocaleString()}</div>
              </Link>
            )}

            {/* Past windows */}
            {windows.map((window) => {
              const isCurrentlyActive = isActive && window.windowId === activeWindowId;
              if (isCurrentlyActive) return null;

              return (
                <Link
                  key={window.windowId}
                  href={`/window/${window.windowId}`}
                  className="grid grid-cols-[1fr_3rem] md:grid-cols-[1fr_8rem_3rem] gap-2 md:gap-3 py-2 md:py-2.5 px-3 md:px-4 border-b border-border items-center text-[11px] md:text-xs hover:bg-foreground/5 transition-colors cursor-pointer"
                >
                  <div>window {window.windowId}</div>
                  <div className="hidden md:block text-right text-muted tabular-nums whitespace-nowrap">
                    {window.startTime ? formatDateTime(window.startTime) : "—"}
                  </div>
                  <div className="text-right tabular-nums">{window.tokenCount.toLocaleString()}</div>
                </Link>
              );
            })}
          </div>

          {/* Link to collection */}
          <div className="mt-12 pt-8 border-t border-border text-center">
            <Link
              href="/collection"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              view all LESS →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WindowsPage() {
  if (IS_PRE_LAUNCH) {
    return (
      <div className="min-h-screen pt-20 lg:pt-28">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto text-center py-20">
            <h1 className="text-2xl mb-4">coming soon</h1>
            <p className="text-muted mb-6">
              windows will populate as burns trigger minting periods
            </p>
            <Link
              href="/about"
              className="text-sm underline underline-offset-4 hover:text-muted transition-colors"
            >
              learn how it works
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <WindowsList />;
}
