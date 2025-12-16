'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo } from 'react';

const BATCH_SIZE = 20;

export interface CollectionToken {
  id: number;
  foldId: number;
  seed: `0x${string}`;
  metadata?: TokenMetadata;
}

export function useCollection(page = 0) {
  // Get total supply
  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 10000,
    },
  });

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
  const { data: tokenDataResults, isLoading: isLoadingData } = useReadContracts({
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
  const { data: seedResults, isLoading: isLoadingSeeds } = useReadContracts({
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
  const { data: uriResults, isLoading: isLoadingURIs } = useReadContracts({
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
      const tokenData = tokenDataResults?.[index]?.result;
      const seedResult = seedResults?.[index]?.result as `0x${string}` | undefined;
      const uriResult = uriResults?.[index]?.result as string | undefined;

      const metadata = uriResult
        ? (parseDataUri(uriResult) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        foldId: tokenData ? Number(tokenData) : 0,
        seed: seedResult ?? '0x0',
        metadata,
      };
    });
  }, [tokenIds, tokenDataResults, seedResults, uriResults]);

  const isLoading = isLoadingData || isLoadingSeeds || isLoadingURIs;
  const hasMore = total > (page + 1) * BATCH_SIZE;
  const totalPages = Math.ceil(total / BATCH_SIZE);

  return {
    tokens,
    total,
    isLoading,
    hasMore,
    page,
    totalPages,
  };
}
