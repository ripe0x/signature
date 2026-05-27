'use client';

import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { CONTRACTS, STRATEGY_ABI, IS_TOKEN_LIVE, DEAD_ADDRESS } from '@/lib/contracts';
import { useContractState } from '@/providers/ContractStateContext';
import { useEthPrice, useLessPrice } from '@/hooks/usePrices';

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

  // ETH/USD with multi-source fallback (CoinGecko → Chainlink on-chain).
  // Computed first because the on-chain LESS price fallback uses it.
  const { price: ethPrice } = useEthPrice();

  // LESS/USD with multi-source fallback (GeckoTerminal → DexScreener → on-chain V4)
  const { price: tokenPrice } = useLessPrice(ethPrice);

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
    tokenPrice,
    holderCount: tokenStatsApi?.holderCount ?? null,
    ethPrice,
    nftsMinted: contractState.totalSupply,
    windowCount: contractState.windowCount,
    minEthForWindow: contractState.minEthForWindow,
    burnedBalance: burnedBalance ?? BigInt(0),
    lastWindowStart: tokenStatsApi?.lastWindowStart ?? 0,
  };
}
