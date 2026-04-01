'use client';

import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { CONTRACTS, EXTENSIONS_EXTENSION_ABI } from '@/lib/contracts';
import { parseDataUri, normalizeTokenUri } from '@/lib/utils';
import type { TokenMetadata } from '@/types';
import { useQuery } from '@tanstack/react-query';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function fetchMetadata(uri: string): Promise<TokenMetadata | undefined> {
  const parsed = parseDataUri(uri) as TokenMetadata | null;
  if (parsed) return parsed;

  const url = normalizeTokenUri(uri);
  const response = await fetch(url);
  if (!response.ok) return undefined;
  return (await response.json()) as TokenMetadata;
}

export function useExtensionToken(tokenId: number) {
  const extensionAddress = CONTRACTS.EXTENSIONS_EXTENSION;
  const manifoldCreator = CONTRACTS.MANIFOLD_CREATOR;
  const configured = extensionAddress !== ZERO_ADDRESS && manifoldCreator !== ZERO_ADDRESS && tokenId > 0;

  const { data: tokenUri, isLoading: isLoadingUri } = useReadContract({
    address: configured ? extensionAddress : undefined,
    abi: EXTENSIONS_EXTENSION_ABI,
    functionName: 'tokenURI',
    args: [manifoldCreator, BigInt(tokenId)],
    query: {
      enabled: configured,
      staleTime: 30000,
    },
  });

  const {
    data: metadata,
    isLoading: isLoadingMetadata,
    error,
  } = useQuery({
    queryKey: ['extension-token-metadata', tokenId, tokenUri],
    queryFn: async () => (tokenUri ? fetchMetadata(tokenUri as string) : undefined),
    enabled: !!tokenUri,
    staleTime: 60000,
  });

  return {
    tokenId,
    tokenUri: tokenUri as string | undefined,
    metadata,
    isLoading: isLoadingUri || isLoadingMetadata,
    error: error as Error | null,
    configured,
  };
}
