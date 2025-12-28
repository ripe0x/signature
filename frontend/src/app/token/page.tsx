"use client";

import { useTokenStats } from "@/hooks/useTokenStats";
import { formatEther } from "viem";
import { IS_TOKEN_LIVE, CONTRACTS } from "@/lib/contracts";
import { Button } from "@/components/ui/Button";
import { generateUnicodeProgressBar } from "@/lib/utils";
import { useRef, useState, useEffect } from "react";

// Initial supply for burn calculations (1 billion with 18 decimals)
const INITIAL_SUPPLY = BigInt(1_000_000_000) * BigInt(10 ** 18);

export default function TokenPage() {
  const {
    buybackBalance,
    tokenPrice,
    windowCount,
    minEthForWindow,
    burnedBalance,
    nftsMinted,
  } = useTokenStats();

  const barRef = useRef<HTMLDivElement>(null);
  const [barLength, setBarLength] = useState(20);

  // Calculate bar length based on container width
  useEffect(() => {
    const updateBarLength = () => {
      if (barRef.current) {
        const measureChar = document.createElement("span");
        const styles = window.getComputedStyle(barRef.current);
        measureChar.style.position = "absolute";
        measureChar.style.visibility = "hidden";
        measureChar.style.fontFamily = styles.fontFamily;
        measureChar.style.fontSize = styles.fontSize;
        measureChar.textContent = "▓";
        document.body.appendChild(measureChar);
        const charWidth = measureChar.offsetWidth;
        document.body.removeChild(measureChar);

        const containerWidth = barRef.current.offsetWidth;
        const chars = Math.floor(containerWidth / charWidth);
        setBarLength(Math.max(15, Math.min(chars - 10, 50))); // Leave room for percentage
      }
    };

    updateBarLength();
    window.addEventListener("resize", updateBarLength);
    return () => window.removeEventListener("resize", updateBarLength);
  }, []);

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
    minEthForWindow > 0 ? parseFloat(formatEther(minEthForWindow)) : 0.25;

  const thresholdPercent = Math.min((buybackEth / thresholdEth) * 100, 100);
  const thresholdMet = buybackEth >= thresholdEth;

  const formattedPrice =
    tokenPrice !== null
      ? tokenPrice < 0.0001
        ? tokenPrice.toExponential(2)
        : tokenPrice < 1
        ? tokenPrice.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
        : tokenPrice.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
      : "—";

  const burnedTokens =
    burnedBalance > 0
      ? Number(burnedBalance / BigInt(10 ** 18)).toLocaleString()
      : "0";

  // Calculate market cap (circulating supply × price)
  const circulatingSupply = INITIAL_SUPPLY - burnedBalance;
  const marketCap =
    tokenPrice !== null && circulatingSupply > 0
      ? tokenPrice * Number(circulatingSupply / BigInt(10 ** 18))
      : null;

  const formattedMarketCap =
    marketCap !== null
      ? marketCap >= 1_000_000
        ? `$${(marketCap / 1_000_000).toFixed(2)}M`
        : marketCap >= 1_000
        ? `$${(marketCap / 1_000).toFixed(1)}K`
        : `$${marketCap.toFixed(0)}`
      : "—";

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Header */}
          <section className="space-y-4">
            <h1 className="text-3xl md:text-4xl font-medium">$LESS</h1>
            <p className="text-lg text-muted max-w-2xl">
              A recursive strategy token that continuously buys and burns
              itself. Every trade adds pressure. Every burn opens a mint window.
            </p>
          </section>

          {/* Primary CTA */}
          <section className="flex flex-wrap gap-4">
            <a
              href={`https://www.nftstrategy.fun/strategies/${CONTRACTS.LESS_STRATEGY}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg">trade $LESS</Button>
            </a>
            <a
              href={`https://dexscreener.com/ethereum/${CONTRACTS.LESS_STRATEGY}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg">
                view on DEXScreener
              </Button>
            </a>
          </section>

          {/* Stats Grid */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="p-6 border border-border">
              <div className="text-xs text-muted mb-2">price</div>
              <div className="text-lg md:text-xl font-mono tabular-nums">
                ${formattedPrice}
              </div>
            </div>
            <div className="p-6 border border-border">
              <div className="text-xs text-muted mb-2">market cap</div>
              <div className="text-lg md:text-xl font-mono tabular-nums">
                {formattedMarketCap}
              </div>
            </div>
            <div className="p-6 border border-border">
              <div className="text-xs text-muted mb-2">supply burned</div>
              <div className="text-lg md:text-xl font-mono tabular-nums">
                {burnedPercent.toFixed(2)}%
              </div>
            </div>
            <div className="p-6 border border-border">
              <div className="text-xs text-muted mb-2">burn cycles</div>
              <div className="text-lg md:text-xl font-mono tabular-nums">
                {windowCount}
              </div>
            </div>
            <div className="p-6 border border-border">
              <div className="text-xs text-muted mb-2">NFTs minted</div>
              <div className="text-lg md:text-xl font-mono tabular-nums">
                {nftsMinted}
              </div>
            </div>
          </section>

          {/* Next Window Progress */}
          <section className="p-6 md:p-8 border border-border space-y-4">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 md:gap-4">
              <div>
                <h2 className="text-base md:text-lg mb-1">next window threshold</h2>
                <p className="text-xs md:text-sm text-muted">
                  ETH accumulated from trades, waiting to trigger the next buy and burn
                </p>
              </div>
              <div className="md:text-right">
                <div className="text-xl md:text-2xl font-mono tabular-nums">
                  {buybackEth.toFixed(4)} ETH
                </div>
                <div className="text-xs md:text-sm text-muted">
                  / {thresholdEth} ETH required
                </div>
              </div>
            </div>
            <div ref={barRef} className="font-mono text-base md:text-lg overflow-hidden whitespace-nowrap">
              {generateUnicodeProgressBar(thresholdPercent, barLength)}
              <span className="ml-2 md:ml-3 text-xs md:text-sm">
                {thresholdPercent.toFixed(1)}%
              </span>
            </div>
            <p className="text-sm text-muted">
              {thresholdMet
                ? "threshold met — a mint window can be opened"
                : `${(thresholdEth - buybackEth).toFixed(
                    4
                  )} ETH to go until next window`}
            </p>
          </section>

          {/* Burn Stats */}
          <section className="space-y-6">
            <h2 className="text-lg">burn statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 border border-border">
                <div className="text-xs text-muted mb-2">tokens burned</div>
                <div className="text-xl font-mono tabular-nums">
                  {burnedTokens} LESS
                </div>
                <div className="text-sm text-muted mt-2">sent to 0x...dEaD</div>
              </div>
              <div className="p-6 border border-border">
                <div className="text-xs text-muted mb-2">
                  NFTs created from burns
                </div>
                <div className="text-xl font-mono tabular-nums">
                  {nftsMinted} pieces
                </div>
                <div className="text-sm text-muted mt-2">
                  across {windowCount} mint windows
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="space-y-6">
            <h2 className="text-lg">how the recursive mechanism works</h2>
            <div className="space-y-4 text-sm max-w-2xl">
              <div className="flex gap-4 p-4 border-l-2 border-border">
                <span className="text-muted w-8 shrink-0 font-mono">01</span>
                <span className="text-muted">
                  every trade on the $LESS uniswap pool contributes a small fee
                  to the strategy contract
                </span>
              </div>
              <div className="flex gap-4 p-4 border-l-2 border-border">
                <span className="text-muted w-8 shrink-0 font-mono">02</span>
                <span className="text-muted">
                  when enough ETH accumulates (currently {thresholdEth} ETH),
                  anyone can trigger a buyback
                </span>
              </div>
              <div className="flex gap-4 p-4 border-l-2 border-border">
                <span className="text-muted w-8 shrink-0 font-mono">03</span>
                <span className="text-muted">
                  the accumulated ETH buys $LESS from the pool and sends it to
                  the dead address
                </span>
              </div>
              <div className="flex gap-4 p-4 border-l-2 border-border">
                <span className="text-muted w-8 shrink-0 font-mono">04</span>
                <span className="text-muted">
                  each burn opens a 90-minute window where LESS NFTs can be
                  minted
                </span>
              </div>
            </div>
          </section>

          {/* Links */}
          <section className="space-y-4">
            <h2 className="text-lg">links</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <a
                href={`https://www.nftstrategy.fun/strategies/${CONTRACTS.LESS_STRATEGY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 border border-border hover:border-foreground transition-colors"
              >
                <div className="text-muted mb-1">trade</div>
                <div>NFTStrategy</div>
              </a>
              <a
                href={`https://dexscreener.com/ethereum/${CONTRACTS.LESS_STRATEGY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 border border-border hover:border-foreground transition-colors"
              >
                <div className="text-muted mb-1">charts</div>
                <div>DEXScreener</div>
              </a>
              <a
                href={`https://etherscan.io/token/${CONTRACTS.LESS_STRATEGY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 border border-border hover:border-foreground transition-colors"
              >
                <div className="text-muted mb-1">contract</div>
                <div>Etherscan</div>
              </a>
              <a
                href="https://docs.nftstrategy.fun/strategy-types/recursive-strategies"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 border border-border hover:border-foreground transition-colors"
              >
                <div className="text-muted mb-1">learn</div>
                <div>Strategy Docs</div>
              </a>
            </div>
          </section>

          {/* Contract Info */}
          <section className="space-y-4 text-sm text-muted">
            <h2 className="text-lg text-foreground">contract</h2>
            <div className="font-mono text-xs break-all p-4 border border-border bg-foreground/5">
              {CONTRACTS.LESS_STRATEGY}
            </div>
            <p>
              $LESS is a TokenWorks recursive strategy token deployed on
              Ethereum mainnet.
              {/* It has no admin functions and runs autonomously forever. */}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
