'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI } from '@/lib/contracts';
import { useEffect, useState } from 'react';

export interface TokenStats {
  // Strategy token stats
  tokenSupply: bigint;
  lastBurnTime: number;
  timeUntilNextBurn: number;
  timeBetweenBurns: number;

  // NFT stats
  nftsMinted: number;
  windowCount: number;
}

export function useTokenStats() {
  const [timeUntilNextBurn, setTimeUntilNextBurn] = useState(0);

  // Strategy token supply
  const { data: tokenSupply } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 30000,
    },
  });

  // Last burn timestamp
  const { data: lastBurn } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'lastBurn',
    query: {
      refetchInterval: 30000,
    },
  });

  // Time until funds can be moved (next burn)
  const { data: timeUntilFundsMoved } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'timeUntilFundsMoved',
    query: {
      refetchInterval: 5000,
    },
  });

  // Time between burns
  const { data: timeBetweenBurn } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'timeBetweenBurn',
  });

  // NFT total supply
  const { data: nftSupply } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 10000,
    },
  });

  // Current window count
  const { data: windowCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowCount',
    query: {
      refetchInterval: 10000,
    },
  });

  // Countdown for next burn
  useEffect(() => {
    if (timeUntilFundsMoved) {
      setTimeUntilNextBurn(Number(timeUntilFundsMoved));
    }

    const interval = setInterval(() => {
      setTimeUntilNextBurn((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeUntilFundsMoved]);

  return {
    tokenSupply: tokenSupply ?? BigInt(0),
    lastBurnTime: lastBurn ? Number(lastBurn) : 0,
    timeUntilNextBurn,
    timeBetweenBurns: timeBetweenBurn ? Number(timeBetweenBurn) : 1800,
    nftsMinted: nftSupply ? Number(nftSupply) : 0,
    windowCount: windowCount ? Number(windowCount) : 0,
  };
}
