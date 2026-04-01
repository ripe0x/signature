'use client';

import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { CONTRACTS, ERC20_ABI } from '@/lib/contracts';

export function useLessBalance(spender?: `0x${string}`) {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.LESS_STRATEGY,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
      {
        address: CONTRACTS.LESS_STRATEGY,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [
          address ?? '0x0000000000000000000000000000000000000000',
          spender ?? '0x0000000000000000000000000000000000000000',
        ],
      },
    ],
    query: {
      enabled: !!address && !!spender,
      staleTime: 15000,
      refetchInterval: 15000,
    },
  });

  const balance = (data?.[0]?.result as bigint) ?? BigInt(0);
  const allowance = (data?.[1]?.result as bigint) ?? BigInt(0);

  return {
    balance,
    allowance,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
