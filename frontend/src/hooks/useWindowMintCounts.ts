'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { useMemo } from 'react';

const BATCH_SIZE = 50; // Larger batch for counting only

/**
 * Hook to get accurate mint counts per window by querying all tokens' windowIds
 */
export function useWindowMintCounts() {
  // Get total supply
  const { data: totalSupply, isLoading: isLoadingSupply } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 10000,
    },
  });

  const total = totalSupply ? Number(totalSupply) : 0;

  // Generate all token IDs
  const allTokenIds = useMemo(() => {
    if (total === 0) return [];
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [total]);

  // Batch read all windowIds
  const { data: windowIdResults, isLoading: isLoadingWindowIds } = useReadContracts({
    contracts: allTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getTokenData',
      args: [BigInt(id)],
    })),
    query: {
      enabled: allTokenIds.length > 0,
    },
  });

  // Count tokens per window
  const windowMintCounts = useMemo(() => {
    if (!windowIdResults) return new Map<number, number>();

    const counts = new Map<number, number>();

    for (let i = 0; i < allTokenIds.length; i++) {
      const result = windowIdResults[i]?.result;
      let windowId = 0;

      if (result !== undefined && result !== null) {
        if (typeof result === 'bigint') {
          windowId = Number(result);
        } else if (typeof result === 'object' && 'windowId' in result) {
          windowId = Number((result as { windowId: bigint }).windowId);
        } else {
          windowId = Number(result);
        }
      }

      if (!isNaN(windowId)) {
        counts.set(windowId, (counts.get(windowId) || 0) + 1);
      }
    }

    return counts;
  }, [allTokenIds, windowIdResults]);

  const isLoading = isLoadingSupply || isLoadingWindowIds;

  return {
    windowMintCounts,
    isLoading,
    total,
  };
}
