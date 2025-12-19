'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri, seedToNumber } from '@/lib/utils';
import type { TokenMetadata } from '@/types';

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

export function useToken(tokenId: number): TokenInfo {
  // Get token data (windowId only - deployed contract returns just windowId)
  const {
    data: tokenData,
    isLoading: isLoadingTokenData,
    error: tokenDataError,
  } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getTokenData',
    args: [BigInt(tokenId)],
    query: {
      enabled: tokenId > 0,
    },
  });

  // Get seed separately
  const { data: seedData, isLoading: isLoadingSeed } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getSeed',
    args: [BigInt(tokenId)],
    query: {
      enabled: tokenId > 0,
    },
  });

  // Get owner
  const { data: owner, isLoading: isLoadingOwner } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'ownerOf',
    args: [BigInt(tokenId)],
    query: {
      enabled: tokenId > 0,
    },
  });

  // Get token URI
  const { data: tokenURI, isLoading: isLoadingURI } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'tokenURI',
    args: [BigInt(tokenId)],
    query: {
      enabled: tokenId > 0,
    },
  });

  // Parse metadata from tokenURI
  const metadata = tokenURI
    ? (parseDataUri(tokenURI as string) as TokenMetadata | null) ?? undefined
    : undefined;

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

  const isLoading =
    isLoadingTokenData ||
    isLoadingSeed ||
    isLoadingOwner ||
    isLoadingURI;

  return {
    id: tokenId,
    windowId,
    seed,
    seedNumber: seed !== '0x0' ? seedToNumber(seed) : 0,
    owner: owner as `0x${string}` | undefined,
    metadata,
    isLoading,
    error: tokenDataError as Error | null,
  };
}
