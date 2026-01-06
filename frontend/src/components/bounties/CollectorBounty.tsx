'use client';

import { useMemo } from 'react';
import { formatEther } from 'viem';
import { useReadContract, useBalance } from 'wagmi';
import Link from 'next/link';
import {
  BOUNTY_FACTORY_ADDRESS,
  BOUNTY_FACTORY_ABI,
  BOUNTY_ABI,
  CONTRACTS,
  LESS_NFT_ABI,
} from '@/lib/contracts';
import { getAddressUrl } from '@/lib/utils';

interface CollectorBountyProps {
  address: string;
}

export function CollectorBounty({ address }: CollectorBountyProps) {
  // Check if this collector has a bounty
  const { data: bountyAddress, isLoading: isLoadingAddress } = useReadContract({
    address: BOUNTY_FACTORY_ADDRESS,
    abi: BOUNTY_FACTORY_ABI,
    functionName: 'getBounty',
    args: [address as `0x${string}`],
  });

  const hasBounty =
    bountyAddress && bountyAddress !== '0x0000000000000000000000000000000000000000';

  // Get bounty balance
  const { data: balanceData } = useBalance({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    query: {
      enabled: hasBounty,
    },
  });

  // Get bounty config
  const { data: mintsPerWindow } = useReadContract({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    abi: BOUNTY_ABI,
    functionName: 'mintsPerWindow',
    query: {
      enabled: hasBounty,
    },
  });

  const { data: isPaused } = useReadContract({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    abi: BOUNTY_ABI,
    functionName: 'paused',
    query: {
      enabled: hasBounty,
    },
  });

  const { data: executorReward } = useReadContract({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    abi: BOUNTY_ABI,
    functionName: 'executorReward',
    query: {
      enabled: hasBounty,
    },
  });

  // Get bounty status for totalCost and windowActive
  const { data: bountyStatus } = useReadContract({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    abi: BOUNTY_ABI,
    functionName: 'getBountyStatus',
    query: {
      enabled: hasBounty,
      refetchInterval: 30000,
    },
  });

  // Get base mint price for estimating cost when window is not active
  const { data: baseMintPriceWei } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'mintPrice',
    query: { refetchInterval: 30000 },
  });

  // Parse bounty status
  const parsedStatus = useMemo(() => {
    if (!bountyStatus) return null;
    const [
      , // isActive
      , // isPaused (already fetched separately)
      , // currentWindowId
      windowActive,
      , // windowMintedAlready
      , // windowTargeted
      , // canClaim
      , // mintCost
      reward,
      totalCost,
      balance,
    ] = bountyStatus as [boolean, boolean, bigint, boolean, boolean, boolean, boolean, bigint, bigint, bigint, bigint, bigint];
    return { windowActive, reward, totalCost, balance };
  }, [bountyStatus]);

  // Determine if bounty can fund the next window
  const canFundNextWindow = useMemo(() => {
    if (!parsedStatus) return false;
    const { windowActive, reward, totalCost, balance } = parsedStatus;

    let estimatedCost: bigint;
    if (windowActive) {
      // Window is active - use on-chain totalCost (includes escalating pricing)
      estimatedCost = totalCost;
    } else {
      // Window is NOT active - estimate using base mint price (mint counts will reset)
      const baseCost = baseMintPriceWei ?? BigInt(0);
      estimatedCost = baseCost + reward;
    }

    return balance >= estimatedCost && estimatedCost > BigInt(0);
  }, [parsedStatus, baseMintPriceWei]);

  if (isLoadingAddress) {
    return null;
  }

  if (!hasBounty) {
    return null;
  }

  const balance = balanceData?.value ?? BigInt(0);
  const balanceEth = Number(formatEther(balance)).toFixed(4);
  const rewardEth = executorReward ? Number(formatEther(executorReward as bigint)).toFixed(4) : '0';

  return (
    <div className="border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm">mint bounty</h3>
        {isPaused ? (
          <span className="text-xs px-2 py-0.5 bg-border text-muted">paused</span>
        ) : canFundNextWindow ? (
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800">active</span>
        ) : balance > BigInt(0) ? (
          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">inactive</span>
        ) : (
          <span className="text-xs px-2 py-0.5 bg-border text-muted">unfunded</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted">balance</div>
          <div>{balanceEth} ETH</div>
        </div>
        <div>
          <div className="text-xs text-muted">mints/window</div>
          <div>{mintsPerWindow ? Number(mintsPerWindow) : '-'}</div>
        </div>
      </div>

      {executorReward && executorReward > BigInt(0) && (
        <div className="text-xs text-muted">
          claimer reward: {rewardEth} ETH
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <a
          href={getAddressUrl(bountyAddress as string)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted hover:text-foreground"
        >
          view contract →
        </a>
      </div>
    </div>
  );
}
