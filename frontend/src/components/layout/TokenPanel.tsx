"use client";

import { useState } from "react";
import { useTokenStats } from "@/hooks/useTokenStats";
import { formatEther } from "viem";
import { IS_PRE_LAUNCH, IS_TOKEN_LIVE, CONTRACTS } from "@/lib/contracts";

export function TokenPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    tokenSupply,
    buybackBalance,
    burnCount,
    tokenPrice,
    holderCount,
    nftsMinted,
    windowCount,
  } = useTokenStats();

  const formattedSupply =
    IS_TOKEN_LIVE && tokenSupply > 0
      ? parseFloat(formatEther(tokenSupply)).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "—";

  const formattedBuybackBalance =
    IS_TOKEN_LIVE && buybackBalance > 0
      ? parseFloat(formatEther(buybackBalance)).toFixed(3)
      : "0";

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
        <div className="p-6 pt-24 space-y-8 h-full overflow-y-auto">
          <div>
            <h2 className="text-lg mb-1">$LESS</h2>
            <p className="text-xs text-muted">recursive strategy token</p>
            {IS_TOKEN_LIVE && (
              <div className="mt-3 px-2 py-1 border border-foreground text-foreground text-xs inline-block">
                live
              </div>
            )}
            {IS_PRE_LAUNCH && (
              <div className="mt-2 px-2 py-1 border border-muted text-muted text-xs inline-block">
                nft coming soon
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="space-y-6">
            {/* Token stats - show when token is live */}
            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">token price</div>
              <div className="text-xl tabular-nums">${formattedPrice}</div>
            </div>

            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">token supply</div>
              <div className="text-xl tabular-nums">{formattedSupply}</div>
            </div>

            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">holders</div>
              <div className="text-xl tabular-nums">
                {IS_TOKEN_LIVE && holderCount !== null
                  ? holderCount.toLocaleString()
                  : "—"}
              </div>
            </div>

            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">buyback balance</div>
              <div className="text-xl tabular-nums">
                {formattedBuybackBalance} ETH
              </div>
            </div>

            <div className={!IS_TOKEN_LIVE ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">
                burn interval (when active)
              </div>
              <div className="text-sm">90 min</div>
            </div>

            {/* NFT stats - show when NFT is live */}
            <div className={IS_PRE_LAUNCH ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">
                burns / mint windows
              </div>
              <div className="text-xl tabular-nums">
                {IS_PRE_LAUNCH ? "—" : burnCount}
              </div>
            </div>

            <div className={IS_PRE_LAUNCH ? "opacity-40" : ""}>
              <div className="text-xs text-muted mb-1">nfts minted</div>
              <div className="text-xl tabular-nums">
                {IS_PRE_LAUNCH ? "—" : nftsMinted}
              </div>
            </div>
          </div>

          {/* Links */}
          <div
            className={`pt-6 border-t border-border space-y-3 ${
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
              href="https://docs.nftstrategy.fun/strategy-types/recursive-strategies"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              strategy protocol docs →
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
