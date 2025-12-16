'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { parseDataUri, seedToNumber } from '@/lib/utils';
import type { TokenMetadata, Fold } from '@/types';

export interface TokenInfo {
  id: number;
  foldId: number;
  seed: `0x${string}`;
  seedNumber: number;
  owner: `0x${string}` | undefined;
  fold: Fold | undefined;
  metadata: TokenMetadata | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useToken(tokenId: number): TokenInfo {
  // Get token data (foldId)
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

  // Get seed
  const { data: seed, isLoading: isLoadingSeed } = useReadContract({
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

  // Get fold data
  const foldId = tokenData ? Number(tokenData) : 0;
  const { data: foldData, isLoading: isLoadingFold } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getFold',
    args: foldId > 0 ? [BigInt(foldId)] : undefined,
    query: {
      enabled: foldId > 0,
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

  // Parse fold data
  const fold: Fold | undefined = foldData
    ? {
        startTime: (foldData as [bigint, bigint, `0x${string}`])[0],
        endTime: (foldData as [bigint, bigint, `0x${string}`])[1],
        blockHash: (foldData as [bigint, bigint, `0x${string}`])[2],
      }
    : undefined;

  const isLoading =
    isLoadingTokenData ||
    isLoadingSeed ||
    isLoadingOwner ||
    isLoadingFold ||
    isLoadingURI;

  return {
    id: tokenId,
    foldId,
    seed: (seed as `0x${string}`) ?? '0x0',
    seedNumber: seed ? seedToNumber(seed as `0x${string}`) : 0,
    owner: owner as `0x${string}` | undefined,
    fold,
    metadata,
    isLoading,
    error: tokenDataError as Error | null,
  };
}
