'use client';

import { useAccount } from 'wagmi';
import { useMintWindow } from '@/hooks/useMintWindow';
import { useTokenStats } from '@/hooks/useTokenStats';
import { useCollection } from '@/hooks/useCollection';
import { ArtworkCanvas } from '@/components/artwork/ArtworkCanvas';
import { CountdownTimer } from './CountdownTimer';
import { MintButton } from './MintButton';
import { CONTRACTS, CHAIN_ID } from '@/lib/contracts';
import { formatCountdown, formatEth, getAddressUrl, getTxUrl, seedToNumber } from '@/lib/utils';
import { useMemo } from 'react';

// Progress bar for balance to threshold
function BalanceProgress({ current, threshold }: { current: number; threshold: number }) {
  const percentage = Math.min((current / threshold) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted">balance</span>
        <span>{current.toFixed(4)} / {threshold} ETH</span>
      </div>
      <div className="h-2 bg-border overflow-hidden">
        <div
          className="h-full bg-foreground transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted text-center">
        {percentage < 100
          ? `${(threshold - current).toFixed(4)} ETH until next window`
          : 'threshold reached — window can open'}
      </p>
    </div>
  );
}

// Recent mints grouped by fold
function RecentMints() {
  const { tokens, total, isLoading } = useCollection(0);

  // Group tokens by foldId
  const groupedByFold = useMemo(() => {
    const groups: { [foldId: number]: typeof tokens } = {};
    tokens.forEach(token => {
      if (!groups[token.foldId]) {
        groups[token.foldId] = [];
      }
      groups[token.foldId].push(token);
    });
    // Sort by fold ID descending (most recent first)
    return Object.entries(groups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([foldId, tokens]) => ({ foldId: Number(foldId), tokens }));
  }, [tokens]);

  if (isLoading) {
    return (
      <div className="text-center text-muted text-sm">loading recent mints...</div>
    );
  }

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      <h2 className="text-lg text-center">recent mints</h2>
      {groupedByFold.map(({ foldId, tokens }) => (
        <div key={foldId} className="space-y-4">
          <div className="text-sm text-muted">fold #{foldId}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {tokens.map(token => (
              <div key={token.id} className="space-y-2">
                <ArtworkCanvas
                  seed={seedToNumber(token.seed)}
                  width={200}
                  height={250}
                />
                <div className="text-xs text-center text-muted">#{token.id}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MintWindow() {
  const { isConnected } = useAccount();
  const {
    isActive,
    foldId,
    timeRemaining,
    price,
    hasMinted,
    canCreateFold,
    windowDuration,
    mint,
    canMint,
    isMintPending,
    isConfirming,
    isConfirmed,
    mintError,
    mintTxHash,
    resetMint,
  } = useMintWindow();

  const { foldCount } = useTokenStats();

  // Get the most recent token for showing artwork on confirmation
  const { tokens } = useCollection(0);
  const latestToken = tokens[0];

  const contractUrl = getAddressUrl(CONTRACTS.LESS_NFT, CHAIN_ID);

  // Count mints in current fold
  const mintsThisFold = tokens.filter(t => t.foldId === foldId).length;

  // STATE 1: Window is open
  if (isActive) {
    return (
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl">mint LESS</h1>
          <div className="inline-block px-4 py-2 bg-foreground text-background text-sm">
            fold #{foldId} — window open
          </div>
          <p className="text-sm text-muted">
            {mintsThisFold} minted this window
          </p>
        </div>

        {/* Countdown */}
        <CountdownTimer seconds={timeRemaining} label="time remaining" />

        {/* Mint Section */}
        <div className="max-w-md mx-auto space-y-6">
          {/* Show artwork only after successful mint */}
          {isConfirmed && latestToken && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm mb-4">
                  minted successfully!
                </div>
              </div>
              <ArtworkCanvas
                seed={seedToNumber(latestToken.seed)}
                width={400}
                height={500}
              />
              <div className="text-center space-y-2">
                <p className="text-sm">LESS #{latestToken.id}</p>
                {mintTxHash && (
                  <a
                    href={getTxUrl(mintTxHash, CHAIN_ID)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-foreground"
                  >
                    view transaction →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Mint button - hide after confirmed */}
          {!isConfirmed && (
            <div className="text-center space-y-4">
              <MintButton
                price={price}
                canMint={canMint}
                isPending={isMintPending}
                isConfirming={isConfirming}
                hasMinted={hasMinted}
                isConnected={isConnected}
                onMint={mint}
              />

              {hasMinted && (
                <p className="text-sm text-muted">
                  you have already minted this fold
                </p>
              )}

              {mintError && (
                <div className="p-4 bg-red-50 border border-red-200 text-sm">
                  <p className="text-red-800">
                    {mintError.message.includes('User rejected')
                      ? 'transaction cancelled'
                      : 'mint failed'}
                  </p>
                  <button
                    onClick={resetMint}
                    className="text-red-600 hover:underline mt-2"
                  >
                    try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-muted text-center space-y-2 pt-4 border-t border-border">
            <p>mint price: {formatEth(price, 2)} ETH</p>
            <p>one mint per wallet per window</p>
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:text-foreground"
            >
              view contract →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Window closed but threshold met - can create fold
  if (canCreateFold) {
    const nextFoldId = foldCount + 1;

    return (
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl">mint LESS</h1>
          <div className="inline-block px-4 py-2 border border-foreground text-sm">
            fold #{nextFoldId} — ready to open
          </div>
          <p className="text-sm text-muted">
            threshold reached — mint to open the window
          </p>
        </div>

        {/* Faded countdown placeholder */}
        <div className="text-center opacity-40">
          <div className="text-sm text-muted mb-2">window duration</div>
          <div className="text-4xl font-mono">{formatCountdown(windowDuration)}</div>
          <p className="text-xs text-muted mt-2">timer starts when window opens</p>
        </div>

        {/* Mint Section */}
        <div className="max-w-md mx-auto space-y-6">
          {/* Show artwork after successful mint */}
          {isConfirmed && latestToken && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm mb-4">
                  window opened + minted!
                </div>
              </div>
              <ArtworkCanvas
                seed={seedToNumber(latestToken.seed)}
                width={400}
                height={500}
              />
              <div className="text-center space-y-2">
                <p className="text-sm">LESS #{latestToken.id}</p>
                {mintTxHash && (
                  <a
                    href={getTxUrl(mintTxHash, CHAIN_ID)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-foreground"
                  >
                    view transaction →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Mint button - opens window and mints */}
          {!isConfirmed && (
            <div className="text-center space-y-4">
              <MintButton
                price={price}
                canMint={isConnected && !isMintPending && !isConfirming}
                isPending={isMintPending}
                isConfirming={isConfirming}
                hasMinted={false}
                isConnected={isConnected}
                onMint={mint}
              />

              <p className="text-xs text-muted">
                minting opens the window for others to mint
              </p>

              {mintError && (
                <div className="p-4 bg-red-50 border border-red-200 text-sm">
                  <p className="text-red-800">
                    {mintError.message.includes('User rejected')
                      ? 'transaction cancelled'
                      : 'mint failed'}
                  </p>
                  <button
                    onClick={resetMint}
                    className="text-red-600 hover:underline mt-2"
                  >
                    try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-muted text-center space-y-2 pt-4 border-t border-border">
            <p>mint price: {formatEth(price, 2)} ETH</p>
            <p>one mint per wallet per window</p>
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:text-foreground"
            >
              view contract →
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center text-sm">
          <div className="text-center">
            <div className="text-muted mb-1">total folds</div>
            <div className="text-2xl">{foldCount}</div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: Window closed and threshold not met
  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-3xl">mint LESS</h1>
        <p className="text-muted">no active window</p>
      </div>

      {/* How it works */}
      <div className="max-w-lg mx-auto space-y-6">
        <div className="p-6 border border-border space-y-4">
          <h2 className="text-lg">how mint windows work</h2>
          <div className="text-sm text-muted space-y-3">
            <p>
              trading fees from the $LESS token accumulate in the recursive strategy contract.
            </p>
            <p>
              when the balance reaches <strong className="text-foreground">0.25 ETH</strong>,
              anyone can trigger a burn — the ETH buys and burns $LESS tokens,
              and a <strong className="text-foreground">1-hour mint window</strong> opens.
            </p>
            <p>
              during the window, each wallet can mint one unique piece.
              your artwork is generated from the burn transaction data.
            </p>
          </div>
        </div>

        {/* Balance progress - placeholder for now */}
        <BalanceProgress current={0.12} threshold={0.25} />
      </div>

      {/* Stats */}
      <div className="flex justify-center text-sm">
        <div className="text-center">
          <div className="text-muted mb-1">total folds</div>
          <div className="text-2xl">{foldCount}</div>
        </div>
      </div>

      {/* Contract link */}
      <div className="text-center">
        <a
          href={contractUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted hover:text-foreground"
        >
          view contract on etherscan →
        </a>
      </div>

      {/* Recent mints */}
      <RecentMints />
    </div>
  );
}
