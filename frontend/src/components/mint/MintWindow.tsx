'use client';

import { useAccount } from 'wagmi';
import { useMintWindow } from '@/hooks/useMintWindow';
import { useTokenStats } from '@/hooks/useTokenStats';
import { ArtworkCanvas } from '@/components/artwork/ArtworkCanvas';
import { CountdownTimer } from './CountdownTimer';
import { MintButton } from './MintButton';
import { MintStatus } from './MintStatus';
import { formatCountdown } from '@/lib/utils';

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

  const { timeUntilNextBurn, foldCount } = useTokenStats();

  // Generate preview seed from fold ID
  const previewSeed = foldId > 0 ? foldId * 1000000 + 12345 : 42069;

  if (isActive) {
    return (
      <div className="space-y-12">
        {/* Active Window Header */}
        <div className="text-center space-y-4">
          <div className="inline-block px-4 py-2 bg-foreground text-background text-sm">
            mint window open
          </div>
          <h1 className="text-3xl">fold #{foldId}</h1>
        </div>

        {/* Countdown */}
        <CountdownTimer seconds={timeRemaining} label="time remaining" />

        {/* Preview Artwork */}
        <div className="max-w-lg mx-auto">
          <ArtworkCanvas seed={previewSeed} width={600} height={750} />
          <p className="text-xs text-muted text-center mt-4">
            preview — your piece will be unique
          </p>
        </div>

        {/* Mint Section */}
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
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
          </div>

          <MintStatus
            isConfirmed={isConfirmed}
            error={mintError}
            txHash={mintTxHash}
            onReset={resetMint}
          />

          <div className="text-xs text-muted text-center space-y-1">
            <p>one mint per address per fold</p>
            <p>window duration: {formatCountdown(windowDuration)}</p>
          </div>
        </div>
      </div>
    );
  }

  // No active window
  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-3xl">no active window</h1>
        <p className="text-muted">
          the next mint window will open when the recursive token burns
        </p>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-12 text-sm">
        <div className="text-center">
          <div className="text-muted mb-1">total folds</div>
          <div className="text-2xl">{foldCount}</div>
        </div>
        {timeUntilNextBurn > 0 && (
          <div className="text-center">
            <div className="text-muted mb-1">next burn possible</div>
            <div className="text-2xl">{formatCountdown(timeUntilNextBurn)}</div>
          </div>
        )}
      </div>

      {/* Can create fold indicator */}
      {canCreateFold && (
        <div className="text-center space-y-4">
          <p className="text-sm">a new fold can be created</p>
          <p className="text-xs text-muted">
            anyone can trigger a mint by calling the contract or minting directly
          </p>
        </div>
      )}

      {/* Recent fold preview */}
      {foldCount > 0 && (
        <div className="max-w-sm mx-auto">
          <p className="text-sm text-muted text-center mb-4">
            last fold: #{foldCount}
          </p>
          <ArtworkCanvas
            seed={foldCount * 1000000 + 12345}
            width={400}
            height={500}
          />
        </div>
      )}
    </div>
  );
}
