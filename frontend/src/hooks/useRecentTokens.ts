'use client';

import { useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { useContractState } from '@/providers/ContractStateContext';
import { useMemo } from 'react';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';

export interface RecentToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  metadata?: TokenMetadata;
}

/**
 * Hook to fetch recent tokens directly from chain.
 * Used as a fallback when the API is unavailable or behind.
 * Fetches the last N tokens regardless of window.
 */
export function useRecentTokens(count: number = 40) {
  const { totalSupply } = useContractState();

  // Get IDs of recent tokens
  const tokenIds = useMemo(() => {
    if (totalSupply === 0 || count === 0) return [];
    const numTokens = Math.min(count, totalSupply);
    return Array.from({ length: numTokens }, (_, i) => totalSupply - i);
  }, [totalSupply, count]);

  // Fetch token data (windowId) for all tokens
  const { data: tokenDataResults, isLoading: isLoadingData } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getTokenData',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
      staleTime: 60000,
    },
  });

  // Fetch seeds
  const { data: seedResults, isLoading: isLoadingSeeds } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getSeed',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
      staleTime: 300000,
    },
  });

  // Fetch URIs for metadata
  const { data: uriResults, isLoading: isLoadingURIs } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
      staleTime: 300000,
    },
  });

  // Combine into token objects
  const tokens: RecentToken[] = useMemo(() => {
    if (!tokenIds.length || !tokenDataResults) return [];

    return tokenIds.map((id, index) => {
      const windowId = tokenDataResults[index]?.result ? Number(tokenDataResults[index].result) : 0;
      const seed = seedResults?.[index]?.result as `0x${string}` | undefined;
      const uri = uriResults?.[index]?.result as string | undefined;
      const metadata = uri
        ? (parseDataUri(uri) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        windowId,
        seed: seed ?? '0x0',
        metadata,
      };
    });
  }, [tokenIds, tokenDataResults, seedResults, uriResults]);

  return {
    tokens,
    isLoading: isLoadingData || isLoadingSeeds || isLoadingURIs,
    total: totalSupply,
  };
}
