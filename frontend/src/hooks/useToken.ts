'use client';

import { useReadContracts } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri, seedToNumber } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useMemo } from 'react';

export interface TokenInfo {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  seedNumber: number;
  owner: `0x${string}` | undefined;
  metadata: TokenMetadata | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch token data.
 * Uses a single multicall to batch 4 RPC calls into 1.
 */
export function useToken(tokenId: number): TokenInfo {
  // Batch all 4 contract reads into a single multicall
  const { data: results, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'getTokenData',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'getSeed',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      },
    ],
    query: {
      enabled: tokenId > 0,
      staleTime: 300000, // 5 minutes - token data doesn't change
    },
  });

  // Parse results
  const tokenInfo = useMemo<Omit<TokenInfo, 'isLoading' | 'error'>>(() => {
    const tokenData = results?.[0]?.result;
    const seedData = results?.[1]?.result;
    const owner = results?.[2]?.result as `0x${string}` | undefined;
    const tokenURI = results?.[3]?.result as string | undefined;

    // Extract windowId - handle both direct bigint and object formats
    let windowId = 0;
    if (tokenData !== undefined && tokenData !== null) {
      if (typeof tokenData === 'bigint') {
        windowId = Number(tokenData);
      } else if (typeof tokenData === 'object' && 'windowId' in tokenData) {
        windowId = Number((tokenData as { windowId: bigint }).windowId);
      } else {
        windowId = Number(tokenData);
      }
    }
    if (isNaN(windowId)) windowId = 0;

    const seed = (seedData as `0x${string}`) ?? ('0x0' as `0x${string}`);

    // Parse metadata from tokenURI
    const metadata = tokenURI
      ? (parseDataUri(tokenURI) as TokenMetadata | null) ?? undefined
      : undefined;

    return {
      id: tokenId,
      windowId,
      seed,
      seedNumber: seed !== '0x0' ? seedToNumber(seed) : 0,
      owner,
      metadata,
    };
  }, [results, tokenId]);

  return {
    ...tokenInfo,
    isLoading,
    error: error as Error | null,
  };
}
