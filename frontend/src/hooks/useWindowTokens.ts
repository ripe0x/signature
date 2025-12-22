'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo, useCallback } from 'react';

export interface WindowToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  metadata?: TokenMetadata;
}

/**
 * Hook to fetch all tokens that belong to a specific mint window
 */
export function useWindowTokens(windowId: number, options?: { skipMetadata?: boolean }) {
  const skipMetadata = options?.skipMetadata ?? false;

  // Get total supply to know how many tokens to scan
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

  // Batch read all windowIds to find tokens in this window
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

  // Find token IDs that belong to this window
  const windowTokenIds = useMemo(() => {
    if (!windowIdResults) return [];

    const ids: number[] = [];

    for (let i = 0; i < allTokenIds.length; i++) {
      const result = windowIdResults[i]?.result;
      let tokenWindowId = 0;

      if (result !== undefined && result !== null) {
        if (typeof result === 'bigint') {
          tokenWindowId = Number(result);
        } else if (typeof result === 'object' && 'windowId' in result) {
          tokenWindowId = Number((result as { windowId: bigint }).windowId);
        } else {
          tokenWindowId = Number(result);
        }
      }

      if (!isNaN(tokenWindowId) && tokenWindowId === windowId) {
        ids.push(allTokenIds[i]);
      }
    }

    // Sort by ID descending (newest first)
    return ids.sort((a, b) => b - a);
  }, [allTokenIds, windowIdResults, windowId]);

  // Batch read seeds for matching tokens
  const { data: seedResults, isLoading: isLoadingSeeds, refetch: refetchSeeds } = useReadContracts({
    contracts: windowTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getSeed',
      args: [BigInt(id)],
    })),
    query: {
      enabled: windowTokenIds.length > 0,
    },
  });

  // Batch read tokenURIs (optional)
  const { data: uriResults, isLoading: isLoadingURIs, refetch: refetchURIs } = useReadContracts({
    contracts: windowTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: windowTokenIds.length > 0 && !skipMetadata,
    },
  });

  // Combine results into tokens
  const tokens: WindowToken[] = useMemo(() => {
    if (!windowTokenIds.length) return [];

    return windowTokenIds.map((id, index) => {
      const seedResult = seedResults?.[index]?.result as `0x${string}` | undefined;
      const uriResult = uriResults?.[index]?.result as string | undefined;

      const metadata = uriResult
        ? (parseDataUri(uriResult) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        windowId,
        seed: seedResult ?? '0x0',
        metadata,
      };
    });
  }, [windowTokenIds, windowId, seedResults, uriResults]);

  const isLoading = isLoadingSupply || isLoadingWindowIds || isLoadingSeeds || (!skipMetadata && isLoadingURIs);

  const refetch = useCallback(async () => {
    await Promise.all([refetchSeeds(), refetchURIs()]);
  }, [refetchSeeds, refetchURIs]);

  return {
    tokens,
    count: windowTokenIds.length,
    isLoading,
    refetch,
  };
}
