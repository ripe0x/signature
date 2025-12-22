"use client";

import { useState } from "react";
import { useTokenStats } from "@/hooks/useTokenStats";
import { formatEther } from "viem";
import { IS_PRE_LAUNCH, IS_TOKEN_LIVE, CONTRACTS } from "@/lib/contracts";

// Initial supply for burn calculations (1 billion with 18 decimals)
const INITIAL_SUPPLY = BigInt(1_000_000_000) * BigInt(10 ** 18);

// Format time ago in a human readable way
function formatTimeAgo(timestamp: number): string {
  if (timestamp === 0) return "—";

  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 0) return "just now"; // Future timestamp edge case
  if (diff < 60) return "just now";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400);
  return `${days}d ago`;
}

export function TokenPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    buybackBalance,
    tokenPrice,
    holderCount,
    nftsMinted,
    windowCount,
    minEthForWindow,
    burnedBalance,
    lastWindowStart,
  } = useTokenStats();

  // Calculate burn percentage from dead address balance
  const burnedPercent =
    burnedBalance > 0
      ? Number((burnedBalance * BigInt(10000)) / INITIAL_SUPPLY) / 100
      : 0;

  // Format values
  const buybackEth =
    IS_TOKEN_LIVE && buybackBalance > 0
      ? parseFloat(formatEther(buybackBalance))
      : 0;

  const thresholdEth =
    minEthForWindow > 0 ? parseFloat(formatEther(minEthForWindow)) : 0.25; // Fallback to 0.25 if not loaded

  const thresholdPercent = Math.min((buybackEth / thresholdEth) * 100, 100);
  const thresholdMet = buybackEth >= thresholdEth;

  const formattedPrice =
    tokenPrice !== null
      ? tokenPrice < 0.0001
        ? tokenPrice.toExponential(2)
        : tokenPrice < 1
        ? tokenPrice.toFixed(6)
        : tokenPrice.toFixed(4)
      : "—";

  return (
    <>
      {/* Toggle Button - Fixed on right side */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 px-2 py-4 bg-foreground text-background text-xs writing-mode-vertical hover:bg-foreground/90 transition-colors hidden md:block"
        style={{ writingMode: "vertical-rl" }}
      >
        {isOpen ? "close" : "$LESS"}
      </button>

      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-40 px-4 py-2 bg-foreground text-background text-xs md:hidden"
      >
        {isOpen ? "close" : "$LESS"}
      </button>

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-background border-l border-border z-30 transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 pt-24 space-y-6 h-full overflow-y-auto">
          {/* Header */}
          <div>
            <h2 className="text-lg mb-1">$LESS</h2>
            <p className="text-xs text-muted">recursive strategy token</p>
          </div>

          {/* Threshold Status - Most important */}
          {IS_TOKEN_LIVE && (
            <div className="p-4 border border-border">
              <div className="text-xs text-muted mb-2">
                next window threshold
              </div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-lg tabular-nums">
                  {buybackEth.toFixed(4)} ETH
                </span>
                <span className="text-xs text-muted">/ {thresholdEth} ETH</span>
              </div>
              <div className="h-2 bg-border overflow-hidden mb-2">
                <div
                  className="h-full bg-foreground transition-all duration-500"
                  style={{ width: `${thresholdPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                {thresholdMet
                  ? "threshold met — window can open"
                  : `${(thresholdEth - buybackEth).toFixed(4)} ETH to go`}
              </p>
            </div>
          )}

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Price */}
            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">price</div>
              <div className="text-lg tabular-nums">${formattedPrice}</div>
            </div>

            {/* Burned % */}
            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">supply burned</div>
              <div className="text-lg tabular-nums">
                {burnedPercent.toFixed(2)}%
              </div>
            </div>

            {/* Holders */}
            {IS_TOKEN_LIVE && holderCount !== null && (
              <div>
                <div className="text-xs text-muted mb-1">holders</div>
                <div className="text-lg tabular-nums">
                  {holderCount.toLocaleString()}
                </div>
              </div>
            )}

            {/* Burns / Windows */}
            <div className={IS_PRE_LAUNCH ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">burn cycles</div>
              <div className="text-lg tabular-nums">
                {IS_PRE_LAUNCH ? "—" : windowCount}
              </div>
            </div>
          </div>

          {/* NFT Stats */}
          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4">
              <div className={IS_PRE_LAUNCH ? "opacity-40" : ""}>
                <div className="text-xs text-muted mb-1">nfts minted</div>
                <div className="text-lg tabular-nums">
                  {IS_PRE_LAUNCH ? "—" : nftsMinted}
                </div>
              </div>
              <div className={IS_PRE_LAUNCH ? "opacity-40" : ""}>
                <div className="text-xs text-muted mb-1">last mint window</div>
                <div className="text-lg tabular-nums">
                  {IS_PRE_LAUNCH ? "—" : formatTimeAgo(lastWindowStart)}
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div
            className={`pt-4 border-t border-border space-y-2 ${
              !IS_TOKEN_LIVE ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            <a
              href={`https://www.nftstrategy.fun/strategies/0x9c2ca573009f181eac634c4d6e44a0977c24f335`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              trade token →
            </a>
            <a
              href={`https://dexscreener.com/ethereum/${CONTRACTS.LESS_STRATEGY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              dexscreener →
            </a>
            <a
              href={`https://opensea.io/collection/less-nft`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              opensea →
            </a>
            <a
              href={`https://etherscan.io/token/${CONTRACTS.LESS_STRATEGY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              etherscan →
            </a>
            <a
              href="https://docs.nftstrategy.fun/strategy-types/recursive-strategies"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              strategy docs →
            </a>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
