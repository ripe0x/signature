'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useReadContracts, useBalance } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI } from '@/lib/contracts';

/**
 * Shared contract state that multiple components need.
 * This eliminates duplicate RPC calls across hooks by fetching once and sharing.
 *
 * Uses conditional polling:
 * - When window is inactive: 60 second intervals (window state rarely changes)
 * - When window is active: 15 second intervals (more responsive for minting)
 */
export interface ContractState {
  // NFT contract state
  totalSupply: number;
  windowCount: number;
  isWindowActive: boolean;
  basePrice: bigint;
  windowDuration: number;
  minEthForWindow: bigint;
  canCreateWindow: boolean;

  // Strategy balance for buyback progress
  buybackBalance: bigint;

  // Loading state
  isLoading: boolean;

  // Refetch function
  refetch: () => void;
}

const ContractStateContext = createContext<ContractState | null>(null);

export function ContractStateProvider({ children }: { children: ReactNode }) {
  // Batch read all common contract state in one multicall
  const { data: nftResults, isLoading: isLoadingNft, refetch: refetchNft } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'totalSupply',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'windowCount',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'isWindowActive',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'mintPrice',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'windowDuration',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'minEthForWindow',
      },
      {
        address: CONTRACTS.LESS_NFT,
        abi: LESS_NFT_ABI,
        functionName: 'canCreateWindow',
      },
    ],
    query: {
      // Use conditional polling based on window state
      // Start with 60s (inactive), will switch to 15s when active
      refetchInterval: (data) => {
        const isActive = data?.state?.data?.[2]?.result;
        return isActive ? 15000 : 60000;
      },
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  });

  // Strategy ETH balance for buyback progress
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: CONTRACTS.LESS_STRATEGY,
    query: {
      refetchInterval: 60000, // 1 minute
      staleTime: 30000,
    },
  });

  // Parse results
  const state = useMemo<ContractState>(() => {
    const totalSupply = nftResults?.[0]?.result ? Number(nftResults[0].result) : 0;
    const windowCount = nftResults?.[1]?.result ? Number(nftResults[1].result) : 0;
    const isWindowActive = Boolean(nftResults?.[2]?.result);
    const basePrice = (nftResults?.[3]?.result as bigint) ?? BigInt(0);
    const windowDuration = nftResults?.[4]?.result ? Number(nftResults[4].result) : 5400;
    const minEthForWindow = (nftResults?.[5]?.result as bigint) ?? BigInt(0);
    const canCreateWindow = Boolean(nftResults?.[6]?.result);
    const buybackBalance = balanceData?.value ?? BigInt(0);

    return {
      totalSupply,
      windowCount,
      isWindowActive,
      basePrice,
      windowDuration,
      minEthForWindow,
      canCreateWindow,
      buybackBalance,
      isLoading: isLoadingNft,
      refetch: () => {
        refetchNft();
        refetchBalance();
      },
    };
  }, [nftResults, balanceData, isLoadingNft, refetchNft, refetchBalance]);

  return (
    <ContractStateContext.Provider value={state}>
      {children}
    </ContractStateContext.Provider>
  );
}

/**
 * Hook to access shared contract state.
 * Use this instead of making individual useReadContract calls for common data.
 */
export function useContractState(): ContractState {
  const context = useContext(ContractStateContext);
  if (!context) {
    throw new Error('useContractState must be used within ContractStateProvider');
  }
  return context;
}
