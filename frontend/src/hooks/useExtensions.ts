'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { CONTRACTS, EXTENSIONS_EXTENSION_ABI } from '@/lib/contracts';
import { parseDataUri, normalizeTokenUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface ExtensionToken {
  tokenId: number;
  tokenUri?: string;
  metadata?: TokenMetadata;
}

async function fetchMetadata(uri: string): Promise<TokenMetadata | undefined> {
  const parsed = parseDataUri(uri) as TokenMetadata | null;
  if (parsed) return parsed;

  const url = normalizeTokenUri(uri);
  const response = await fetch(url);
  if (!response.ok) return undefined;
  return (await response.json()) as TokenMetadata;
}

export function useExtensions() {
  const extensionAddress = CONTRACTS.EXTENSIONS_EXTENSION;
  const manifoldCreator = CONTRACTS.MANIFOLD_CREATOR;

  const extensionConfigured =
    extensionAddress !== ZERO_ADDRESS && manifoldCreator !== ZERO_ADDRESS;

  const { data: tokenIdsResult, isLoading: isLoadingIds } = useReadContract({
    address: extensionConfigured ? extensionAddress : undefined,
    abi: EXTENSIONS_EXTENSION_ABI,
    functionName: 'getRegisteredTokenIds',
    query: {
      enabled: extensionConfigured,
      staleTime: 30000,
    },
  });

  const tokenIds = useMemo<number[]>(() => {
    if (!tokenIdsResult) return [];
    return (tokenIdsResult as bigint[]).map((id) => Number(id));
  }, [tokenIdsResult]);

  const { data: tokenUriResults, isLoading: isLoadingUris } = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      address: extensionConfigured ? extensionAddress : undefined,
      abi: EXTENSIONS_EXTENSION_ABI,
      functionName: 'tokenURI',
      args: [manifoldCreator, BigInt(tokenId)],
    })),
    query: {
      enabled: extensionConfigured && tokenIds.length > 0,
      staleTime: 30000,
    },
  });

  const tokenUris = useMemo(() => {
    if (!tokenUriResults) return [];
    return tokenUriResults.map((result) => result.result as string | undefined);
  }, [tokenUriResults]);

  const {
    data: metadataList,
    isLoading: isLoadingMetadata,
    error,
  } = useQuery({
    queryKey: ['extensions-metadata', tokenUris],
    queryFn: async () => {
      return Promise.all(tokenUris.map((uri) => (uri ? fetchMetadata(uri) : undefined)));
    },
    enabled: tokenUris.length > 0,
    staleTime: 60000,
  });

  const tokens: ExtensionToken[] = useMemo(() => {
    if (!tokenIds.length) return [];
    return tokenIds.map((tokenId, index) => ({
      tokenId,
      tokenUri: tokenUris[index],
      metadata: metadataList?.[index],
    }));
  }, [tokenIds, tokenUris, metadataList]);

  return {
    tokens,
    isLoading: isLoadingIds || isLoadingUris || isLoadingMetadata,
    error: error as Error | null,
    configured: extensionConfigured,
  };
}
