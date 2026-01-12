'use client';

import { useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

export interface WindowToken {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  owner?: `0x${string}`;
  metadata?: TokenMetadata;
}

interface WindowTokensApiResponse {
  windowId: number;
  tokens: Array<{ tokenId: number; seed: string; owner: string }>;
  mintCount: number;
  startTime: number | null;
  endTime: number | null;
  generatedAt: number;
}

/**
 * Hook to fetch all tokens that belong to a specific mint window
 * Now uses pre-indexed API data instead of scanning all tokens via RPC
 */
export function useWindowTokens(windowId: number, options?: { skipMetadata?: boolean }) {
  const skipMetadata = options?.skipMetadata ?? false;

  // Fetch window tokens from API (eliminates N RPC calls for scanning)
  const {
    data: apiData,
    isLoading: isLoadingApi,
    refetch: refetchApi,
  } = useQuery<WindowTokensApiResponse>({
    queryKey: ['window-tokens', windowId],
    queryFn: async () => {
      const response = await fetch(`${IMAGE_API_URL}/api/window-tokens/${windowId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch window tokens');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refresh every minute
    enabled: windowId >= 0,
  });

  // Extract token IDs from API response
  const windowTokenIds = useMemo(() => {
    if (!apiData?.tokens) return [];
    // Sort by ID descending (newest first)
    return apiData.tokens.map(t => t.tokenId).sort((a, b) => b - a);
  }, [apiData]);

  // Create a map for quick seed/owner lookup
  const tokenDataMap = useMemo(() => {
    if (!apiData?.tokens) return new Map<number, { seed: string; owner: string }>();
    return new Map(apiData.tokens.map(t => [t.tokenId, { seed: t.seed, owner: t.owner }]));
  }, [apiData]);

  // Only fetch tokenURIs if metadata is needed (still uses RPC, but only for tokens in window)
  const { data: uriResults, isLoading: isLoadingURIs, refetch: refetchURIs } = useReadContracts({
    contracts: windowTokenIds.map((id) => ({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })),
    query: {
      enabled: windowTokenIds.length > 0 && !skipMetadata,
      staleTime: 300000, // 5 minutes - metadata doesn't change
    },
  });

  // Combine results into tokens
  const tokens: WindowToken[] = useMemo(() => {
    if (!windowTokenIds.length) return [];

    return windowTokenIds.map((id, index) => {
      const tokenData = tokenDataMap.get(id);
      const uriResult = uriResults?.[index]?.result as string | undefined;

      const metadata = uriResult
        ? (parseDataUri(uriResult) as TokenMetadata | null) ?? undefined
        : undefined;

      return {
        id,
        windowId,
        seed: (tokenData?.seed as `0x${string}`) ?? '0x0',
        owner: tokenData?.owner as `0x${string}` | undefined,
        metadata,
      };
    });
  }, [windowTokenIds, windowId, tokenDataMap, uriResults]);

  const isLoading = isLoadingApi || (!skipMetadata && isLoadingURIs);

  const refetch = useCallback(async () => {
    await Promise.all([
      refetchApi(),
      ...(skipMetadata ? [] : [refetchURIs()]),
    ]);
  }, [refetchApi, refetchURIs, skipMetadata]);

  return {
    tokens,
    count: windowTokenIds.length,
    isLoading,
    refetch,
  };
}
