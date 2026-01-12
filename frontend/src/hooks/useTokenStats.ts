'use client';

import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { CONTRACTS, STRATEGY_ABI, IS_TOKEN_LIVE, DEAD_ADDRESS } from '@/lib/contracts';
import { useContractState } from '@/providers/ContractStateContext';

export interface TokenStats {
  // Strategy token stats
  tokenSupply: bigint;
  buybackBalance: bigint;
  burnCount: number;
  tokenPrice: number | null;
  holderCount: number | null;
  burnedBalance: bigint;
  ethPrice: number | null;

  // Threshold
  minEthForWindow: bigint;

  // NFT stats
  nftsMinted: number;
  windowCount: number;
  lastWindowStart: number;
}

/**
 * Hook to get token stats.
 * Uses React Query for external APIs and shared context for contract state.
 */
export function useTokenStats() {
  // Use shared contract state instead of making duplicate RPC calls
  const contractState = useContractState();

  // Strategy token supply (not in shared state)
  const { data: tokenSupply } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 60000, // 1 minute
      staleTime: 30000,
    },
  });

  // Burned token balance (tokens sent to dead address)
  const { data: burnedBalance } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'balanceOf',
    args: [DEAD_ADDRESS],
    query: {
      refetchInterval: 60000, // 1 minute
      staleTime: 30000,
    },
  });

  // Fetch token price from DexScreener using React Query
  const { data: dexData } = useQuery({
    queryKey: ['dexscreener', CONTRACTS.LESS_STRATEGY],
    queryFn: async () => {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${CONTRACTS.LESS_STRATEGY}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        return parseFloat(data.pairs[0].priceUsd) || null;
      }
      return null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Fetch ETH price from CoinGecko using React Query
  const { data: ethPrice } = useQuery({
    queryKey: ['coingecko', 'ethereum'],
    queryFn: async () => {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.ethereum?.usd ?? null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 60000, // ETH price doesn't need to be super fresh
    refetchInterval: 60000,
  });

  // Fetch holder count and last window from internal API
  const { data: tokenStatsApi } = useQuery({
    queryKey: ['token-stats'],
    queryFn: async () => {
      const response = await fetch('/api/token-stats');
      if (!response.ok) return { holderCount: null, lastWindowStart: null };
      return response.json();
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    tokenSupply: tokenSupply ?? BigInt(0),
    buybackBalance: contractState.buybackBalance,
    burnCount: contractState.windowCount,
    tokenPrice: dexData ?? null,
    holderCount: tokenStatsApi?.holderCount ?? null,
    ethPrice: ethPrice ?? null,
    nftsMinted: contractState.totalSupply,
    windowCount: contractState.windowCount,
    minEthForWindow: contractState.minEthForWindow,
    burnedBalance: burnedBalance ?? BigInt(0),
    lastWindowStart: tokenStatsApi?.lastWindowStart ?? 0,
  };
}
