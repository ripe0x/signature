'use client';

import { useReadContracts } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo, useCallback } from 'react';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';
const BATCH_SIZE = 20;

export interface CollectionToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  owner?: `0x${string}`;
  metadata?: TokenMetadata;
}

interface CollectionApiResponse {
  tokens: Array<{ tokenId: number; windowId: number; seed: string; owner: string }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  generatedAt: number;
}

/**
 * Hook to fetch paginated collection data.
 * Now uses pre-indexed API data instead of RPC calls for basic token info.
 * Only fetches tokenURIs via RPC if metadata is needed.
 */
export function useCollection(page = 0, options?: { skipMetadata?: boolean; enabled?: boolean }) {
  const skipMetadata = options?.skipMetadata ?? false;
  const enabled = options?.enabled ?? true;

  // Fetch paginated tokens from API (eliminates most RPC calls)
  const {
    data: apiData,
    isLoading: isLoadingApi,
    error: apiError,
    refetch: refetchApi,
  } = useQuery<CollectionApiResponse>({
    queryKey: ['collection', page, BATCH_SIZE],
    queryFn: async () => {
      const response = await fetch(`${IMAGE_API_URL}/api/collection?page=${page}&limit=${BATCH_SIZE}`);
      if (!response.ok) {
        throw new Error('Failed to fetch collection');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
    enabled,
    retry: 2, // Retry twice on failure
  });

  // Extract token IDs for metadata fetch
  const tokenIds = useMemo(() => {
    if (!apiData?.tokens) return [];
    return apiData.tokens.map(t => t.tokenId);
  }, [apiData]);

  // Only fetch tokenURIs if metadata is needed (still uses RPC, but only for this)
  const { data: uriResults, isLoading: isLoadingURIs, refetch: refetchURIs } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: enabled && tokenIds.length > 0 && !skipMetadata,
      staleTime: 300000, // 5 minutes - metadata doesn't change
    },
  });

  // Combine API data with metadata
  const tokens: CollectionToken[] = useMemo(() => {
    if (!apiData?.tokens) return [];

    return apiData.tokens.map((token, index) => {
      const uriResult = uriResults?.[index]?.result as string | undefined;
      const metadata = uriResult
        ? (parseDataUri(uriResult) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id: token.tokenId,
        windowId: token.windowId,
        seed: token.seed as `0x${string}`,
        owner: token.owner as `0x${string}`,
        metadata,
      };
    });
  }, [apiData, uriResults]);

  const isLoading = isLoadingApi || (!skipMetadata && isLoadingURIs);
  const total = apiData?.total ?? 0;
  const hasMore = apiData?.hasMore ?? false;
  const totalPages = apiData?.totalPages ?? 0;

  // Combined refetch function
  const refetch = useCallback(async () => {
    await refetchApi();
    if (!skipMetadata) {
      await refetchURIs();
    }
  }, [refetchApi, refetchURIs, skipMetadata]);

  return {
    tokens,
    total,
    isLoading,
    hasMore,
    page,
    totalPages,
    refetch,
    error: apiError,
  };
}
