'use client';

import { useReadContract, useBalance } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI, IS_TOKEN_LIVE } from '@/lib/contracts';
import { useEffect, useState } from 'react';

export interface TokenStats {
  // Strategy token stats
  tokenSupply: bigint;
  buybackBalance: bigint;
  burnCount: number;
  tokenPrice: number | null;
  holderCount: number | null;

  // NFT stats
  nftsMinted: number;
  windowCount: number;
}

export function useTokenStats() {
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [holderCount, setHolderCount] = useState<number | null>(null);

  // Strategy token supply
  const { data: tokenSupply } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'totalSupply',
    query: {
      refetchInterval: 30000,
    },
  });

  // ETH balance available for buyback (contract's ETH balance)
  const { data: balanceData } = useBalance({
    address: CONTRACTS.LESS_STRATEGY,
    query: {
      refetchInterval: 10000,
      enabled: IS_TOKEN_LIVE,
    },
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

  // Current window count (also serves as burn count)
  const { data: windowCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowCount',
    query: {
      refetchInterval: 10000,
    },
  });

  // Fetch token price and holder count from DexScreener
  useEffect(() => {
    if (!IS_TOKEN_LIVE) return;

    const fetchDexData = async () => {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${CONTRACTS.LESS_STRATEGY}`
        );
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          // Get the main pair (usually highest liquidity)
          const mainPair = data.pairs[0];
          setTokenPrice(parseFloat(mainPair.priceUsd) || null);
        }
      } catch (error) {
        console.error('Failed to fetch DEX data:', error);
      }
    };

    // Fetch holder count via our API route (avoids CORS issues with Etherscan)
    const fetchHolderCount = async () => {
      try {
        const response = await fetch('/api/token-stats');
        if (!response.ok) return; // Silently fail - non-critical data
        const data = await response.json();
        if (data.holderCount !== null) {
          setHolderCount(data.holderCount);
        }
      } catch {
        // Silently fail - holder count is non-critical
      }
    };

    fetchDexData();
    fetchHolderCount();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDexData();
      fetchHolderCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    tokenSupply: tokenSupply ?? BigInt(0),
    buybackBalance: balanceData?.value ?? BigInt(0),
    burnCount: windowCount ? Number(windowCount) : 0,
    tokenPrice,
    holderCount,
    nftsMinted: nftSupply ? Number(nftSupply) : 0,
    windowCount: windowCount ? Number(windowCount) : 0,
  };
}
