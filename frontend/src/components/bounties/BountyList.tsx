'use client';

import { useState } from 'react';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useBounties, useExecuteBounty, type BountyStatus } from '@/hooks/useBounties';
import { truncateAddress, getAddressUrl, getTxUrl } from '@/lib/utils';

function BountyItem({
  bounty,
  onSuccess,
}: {
  bounty: BountyStatus;
  onSuccess?: () => void;
}) {
  const { isConnected } = useAccount();
  const { execute, isPending, isConfirming, isConfirmed, error, txHash, reset } =
    useExecuteBounty(bounty.bountyAddress);

  const handleExecute = () => {
    execute();
  };

  const handleReset = () => {
    reset();
    onSuccess?.();
  };

  const rewardEth = Number(formatEther(bounty.reward)).toFixed(4);

  if (isConfirmed) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="text-sm text-green-700">
          claimed!{' '}
          {txHash && (
            <a
              href={getTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              view tx
            </a>
          )}
        </div>
        <button onClick={handleReset} className="text-xs text-muted hover:text-foreground">
          dismiss
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="text-sm text-red-700">
          {error.message.includes('User rejected') ? 'cancelled' : 'failed'}
        </div>
        <button onClick={reset} className="text-xs text-muted hover:text-foreground">
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono">{rewardEth} ETH</span>
        <span className="text-xs text-muted">
          from{' '}
          <Link
            href={`/collector/${bounty.owner}`}
            className="hover:text-foreground hover:underline"
          >
            {truncateAddress(bounty.owner, 4)}
          </Link>
        </span>
      </div>
      <button
        onClick={handleExecute}
        disabled={!isConnected || isPending || isConfirming}
        className="px-3 py-1 text-xs border border-foreground hover:bg-foreground hover:text-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'confirm...' : isConfirming ? 'claiming...' : 'claim'}
      </button>
    </div>
  );
}

interface BountyListProps {
  windowId: number;
  isWindowActive: boolean;
  compact?: boolean;
}

export function BountyList({ windowId, isWindowActive, compact = false }: BountyListProps) {
  const [expanded, setExpanded] = useState(false);
  const { claimableBounties, isLoading, refetch } = useBounties();

  if (isLoading) {
    return null;
  }

  if (claimableBounties.length === 0) {
    if (compact) return null;
    return (
      <div className="text-sm text-muted text-center py-4">
        no open bounties for window {windowId}
      </div>
    );
  }

  const displayBounties = expanded ? claimableBounties : claimableBounties.slice(0, 3);
  const hasMore = claimableBounties.length > 3;

  // Calculate total available
  const totalReward = claimableBounties.reduce(
    (sum, b) => sum + b.reward,
    BigInt(0)
  );
  const totalEth = Number(formatEther(totalReward)).toFixed(4);

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-border/30">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            {isWindowActive ? (
              <>open bounties for window {windowId}</>
            ) : (
              <>{claimableBounties.length} bounties waiting</>
            )}
          </span>
          <span className="text-xs text-muted">{totalEth} ETH total</span>
        </div>
      </div>

      {/* List */}
      {isWindowActive && (
        <div className="px-4">
          {displayBounties.map((bounty) => (
            <BountyItem key={bounty.bountyAddress} bounty={bounty} onSuccess={refetch} />
          ))}
        </div>
      )}

      {/* Expand/collapse */}
      {isWindowActive && hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-xs text-muted hover:text-foreground text-center border-t border-border"
        >
          {expanded
            ? 'show less'
            : `+ ${claimableBounties.length - 3} more bounties`}
        </button>
      )}

      {/* When window not active, show summary only */}
      {!isWindowActive && (
        <div className="px-4 py-3 text-xs text-muted">
          bounties can be claimed when mint window opens
        </div>
      )}
    </div>
  );
}
