'use client';

import { formatEther } from 'viem';
import { useReadContract, useBalance } from 'wagmi';
import Link from 'next/link';
import {
  BOUNTY_FACTORY_ADDRESS,
  BOUNTY_FACTORY_ABI,
  BOUNTY_ABI,
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
        ) : balance > BigInt(0) ? (
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800">active</span>
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
