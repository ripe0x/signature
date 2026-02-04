'use client';

import { useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { useContractState } from '@/providers/ContractStateContext';
import { useMemo } from 'react';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';

export interface CurrentWindowToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  owner?: `0x${string}`;
  metadata?: TokenMetadata;
}

/**
 * Hook to fetch tokens from the currently active window directly from chain.
 * This supplements the pre-indexed API data with real-time on-chain data.
 * Only fetches when a window is active.
 */
export function useCurrentWindowTokens() {
  const { isWindowActive, windowCount, totalSupply } = useContractState();

  // When window is active, we need to scan recent tokens to find ones in this window
  // We'll check the last 50 tokens (or all if less than 50 total)
  const tokensToCheck = useMemo(() => {
    if (!isWindowActive || totalSupply === 0) return [];
    const count = Math.min(50, totalSupply);
    const startId = Math.max(1, totalSupply - count + 1);
    return Array.from({ length: count }, (_, i) => startId + i);
  }, [isWindowActive, totalSupply]);

  // Fetch token data (windowId) for recent tokens
  const { data: tokenDataResults, isLoading: isLoadingData } = useReadContracts({
    contracts: tokensToCheck.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getTokenData',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokensToCheck.length > 0,
      refetchInterval: 15000, // Refresh every 15s during active window
      staleTime: 10000,
    },
  });

  // Filter to only tokens in the current window
  const currentWindowTokenIds = useMemo(() => {
    if (!tokenDataResults || !isWindowActive) return [];

    const ids: number[] = [];
    tokenDataResults.forEach((result, index) => {
      const windowId = result.result ? Number(result.result) : 0;
      if (windowId === windowCount) {
        ids.push(tokensToCheck[index]);
      }
    });
    return ids.sort((a, b) => b - a); // Newest first
  }, [tokenDataResults, tokensToCheck, windowCount, isWindowActive]);

  // Fetch seeds for current window tokens
  const { data: seedResults, isLoading: isLoadingSeeds } = useReadContracts({
    contracts: currentWindowTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getSeed',
      args: [BigInt(id)],
    })),
    query: {
      enabled: currentWindowTokenIds.length > 0,
      staleTime: 300000, // Seeds don't change
    },
  });

  // Fetch URIs for metadata
  const { data: uriResults, isLoading: isLoadingURIs } = useReadContracts({
    contracts: currentWindowTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: currentWindowTokenIds.length > 0,
      staleTime: 300000,
    },
  });

  // Combine into token objects
  const tokens: CurrentWindowToken[] = useMemo(() => {
    if (!currentWindowTokenIds.length) return [];

    return currentWindowTokenIds.map((id, index) => {
      const seed = seedResults?.[index]?.result as `0x${string}` | undefined;
      const uri = uriResults?.[index]?.result as string | undefined;
      const metadata = uri
        ? (parseDataUri(uri) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        windowId: windowCount,
        seed: seed ?? '0x0',
        metadata,
      };
    });
  }, [currentWindowTokenIds, seedResults, uriResults, windowCount]);

  return {
    tokens,
    windowId: windowCount,
    isActive: isWindowActive,
    isLoading: isLoadingData || isLoadingSeeds || isLoadingURIs,
    count: currentWindowTokenIds.length,
  };
}
