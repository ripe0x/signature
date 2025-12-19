'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo, useCallback } from 'react';

const BATCH_SIZE = 20;

export interface CollectionToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  metadata?: TokenMetadata;
}

export function useCollection(page = 0) {
  // Get total supply
  const { data: totalSupply, refetch: refetchSupply, error: supplyError, isLoading: isLoadingSupply } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 10000,
    },
  });

  // Debug: log any errors
  if (supplyError) {
    console.error('Error fetching totalSupply:', supplyError);
  }

  const total = totalSupply ? Number(totalSupply) : 0;

  // Calculate token IDs for current page (newest first)
  const tokenIds = useMemo(() => {
    if (total === 0) return [];

    const start = total - page * BATCH_SIZE;
    const end = Math.max(1, start - BATCH_SIZE + 1);

    const ids: number[] = [];
    for (let i = start; i >= end; i--) {
      ids.push(i);
    }
    return ids;
  }, [total, page]);

  // Batch read token data
  const { data: tokenDataResults, isLoading: isLoadingData, refetch: refetchData } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getTokenData',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
    },
  });

  // Batch read seeds
  const { data: seedResults, isLoading: isLoadingSeeds, refetch: refetchSeeds } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'getSeed',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
    },
  });

  // Batch read tokenURIs
  const { data: uriResults, isLoading: isLoadingURIs, refetch: refetchURIs } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: tokenIds.length > 0,
    },
  });

  // Combine results into tokens
  const tokens: CollectionToken[] = useMemo(() => {
    if (!tokenIds.length) return [];

    return tokenIds.map((id, index) => {
      // getTokenData returns windowId - handle both direct bigint and object formats
      const tokenDataResult = tokenDataResults?.[index]?.result;
      let windowId = 0;
      if (tokenDataResult !== undefined && tokenDataResult !== null) {
        // Could be bigint directly or {windowId: bigint} object depending on viem version
        if (typeof tokenDataResult === 'bigint') {
          windowId = Number(tokenDataResult);
        } else if (typeof tokenDataResult === 'object' && 'windowId' in tokenDataResult) {
          windowId = Number((tokenDataResult as { windowId: bigint }).windowId);
        } else {
          // Fallback: try to convert whatever it is
          windowId = Number(tokenDataResult);
        }
      }

      const seedResult = seedResults?.[index]?.result as `0x${string}` | undefined;
      const uriResult = uriResults?.[index]?.result as string | undefined;

      const metadata = uriResult
        ? (parseDataUri(uriResult) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        windowId: isNaN(windowId) ? 0 : windowId,
        seed: seedResult ?? '0x0',
        metadata,
      };
    });
  }, [tokenIds, tokenDataResults, seedResults, uriResults]);

  const isLoading = isLoadingSupply || isLoadingData || isLoadingSeeds || isLoadingURIs;
  const hasMore = total > (page + 1) * BATCH_SIZE;
  const totalPages = Math.ceil(total / BATCH_SIZE);

  // Combined refetch function
  const refetch = useCallback(async () => {
    await refetchSupply();
    await Promise.all([refetchData(), refetchSeeds(), refetchURIs()]);
  }, [refetchSupply, refetchData, refetchSeeds, refetchURIs]);

  return {
    tokens,
    total,
    isLoading,
    hasMore,
    page,
    totalPages,
    refetch,
  };
}
