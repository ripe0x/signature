'use client';

import { useState } from 'react';
import { useTokenStats } from '@/hooks/useTokenStats';
import { formatCountdown, formatTimestamp } from '@/lib/utils';
import { formatEther } from 'viem';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

export function TokenPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    tokenSupply,
    lastBurnTime,
    timeUntilNextBurn,
    timeBetweenBurns,
    nftsMinted,
    foldCount,
  } = useTokenStats();

  const formattedSupply = IS_PRE_LAUNCH
    ? '—'
    : tokenSupply > 0
      ? parseFloat(formatEther(tokenSupply)).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : '—';

  return (
    <>
      {/* Toggle Button - Fixed on right side */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 px-2 py-4 bg-foreground text-background text-xs writing-mode-vertical hover:bg-foreground/90 transition-colors hidden md:block"
        style={{ writingMode: 'vertical-rl' }}
      >
        {isOpen ? 'close' : 'token'}
      </button>

      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-40 px-4 py-2 bg-foreground text-background text-xs md:hidden"
      >
        {isOpen ? 'close' : 'token info'}
      </button>

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-background border-l border-border z-30 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 pt-24 space-y-8 h-full overflow-y-auto">
          <div>
            <h2 className="text-lg mb-1">$LESS</h2>
            <p className="text-xs text-muted">recursive strategy token</p>
            {IS_PRE_LAUNCH && (
              <div className="mt-3 px-2 py-1 border border-muted text-muted text-xs inline-block">
                coming soon
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="space-y-6">
            <div className={IS_PRE_LAUNCH ? 'opacity-40' : ''}>
              <div className="text-xs text-muted mb-1">token supply</div>
              <div className="text-xl tabular-nums">{formattedSupply}</div>
            </div>

            <div className={IS_PRE_LAUNCH ? 'opacity-40' : ''}>
              <div className="text-xs text-muted mb-1">burn events</div>
              <div className="text-xl tabular-nums">{IS_PRE_LAUNCH ? '—' : foldCount}</div>
            </div>

            <div className={IS_PRE_LAUNCH ? 'opacity-40' : ''}>
              <div className="text-xs text-muted mb-1">nfts minted</div>
              <div className="text-xl tabular-nums">{IS_PRE_LAUNCH ? '—' : nftsMinted}</div>
            </div>

            {!IS_PRE_LAUNCH && lastBurnTime > 0 && (
              <div>
                <div className="text-xs text-muted mb-1">last burn</div>
                <div className="text-sm">{formatTimestamp(lastBurnTime)}</div>
              </div>
            )}

            {!IS_PRE_LAUNCH && timeUntilNextBurn > 0 && (
              <div>
                <div className="text-xs text-muted mb-1">next burn possible in</div>
                <div className="text-xl tabular-nums font-mono">
                  {formatCountdown(timeUntilNextBurn)}
                </div>
              </div>
            )}

            <div className={IS_PRE_LAUNCH ? 'opacity-40' : ''}>
              <div className="text-xs text-muted mb-1">burn interval</div>
              <div className="text-sm">{IS_PRE_LAUNCH ? '—' : formatCountdown(timeBetweenBurns)}</div>
            </div>
          </div>

          {/* Links */}
          <div className={`pt-6 border-t border-border space-y-3 ${IS_PRE_LAUNCH ? 'opacity-40 pointer-events-none' : ''}`}>
            <a
              href="#"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              trade token →
            </a>
            <a
              href="#"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              dexscreener →
            </a>
            <a
              href="#"
              className="block text-sm text-muted hover:text-foreground transition-colors"
            >
              strategy protocol docs →
            </a>
          </div>

          {/* Description */}
          <div className="pt-6 border-t border-border">
            <p className="text-xs text-muted leading-relaxed">
              every trade sends eth to the contract. that eth buys and burns $LESS.
              supply only goes down.
            </p>
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
