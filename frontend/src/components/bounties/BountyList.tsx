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
  const { bounties, claimableBounties, isLoading, refetch } = useBounties();

  // For active windows, show claimable bounties
  // For future windows, show all bounties that have enough balance to fund the next mint
  const relevantBounties = isWindowActive
    ? claimableBounties
    : bounties.filter(b => b.balance >= b.totalCost && b.totalCost > BigInt(0));

  if (isLoading) {
    return null;
  }

  if (relevantBounties.length === 0) {
    if (compact) return null;
    return (
      <div className="text-sm text-muted text-center py-4">
        no open bounties for window {windowId}. <Link href="/bounties" className="text-foreground hover:underline">create one</Link>
      </div>
    );
  }

  const displayBounties = expanded ? relevantBounties : relevantBounties.slice(0, 3);
  const hasMore = relevantBounties.length > 3;

  // Calculate total cost (mint + reward) available
  const totalCost = relevantBounties.reduce(
    (sum, b) => sum + b.totalCost,
    BigInt(0)
  );
  const totalEth = Number(formatEther(totalCost)).toFixed(4);

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-border/30">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            {isWindowActive ? (
              <Link href="/bounties" className="hover:underline">open bounties for window {windowId}</Link>
            ) : (
              <Link href="/bounties" className="hover:underline">{relevantBounties.length} mint bounties waiting</Link>
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
            : `+ ${relevantBounties.length - 3} more bounties`}
        </button>
      )}

      {/* When window not active, show summary only */}
      {!isWindowActive && (
        <div className="px-4 py-3 text-xs text-muted space-y-1">
          <div>bounties can be claimed when mint window opens</div>
          <div><Link href="/bounties" className="text-foreground hover:underline">create a bounty</Link></div>
        </div>
      )}
    </div>
  );
}
