'use client';

import { useReadContract, useBalance } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI, IS_TOKEN_LIVE, DEAD_ADDRESS } from '@/lib/contracts';
import { useEffect, useState } from 'react';

export interface TokenStats {
  // Strategy token stats
  tokenSupply: bigint;
  buybackBalance: bigint;
  burnCount: number;
  tokenPrice: number | null;
  holderCount: number | null;
  burnedBalance: bigint; // Tokens at dead address

  // Threshold
  minEthForWindow: bigint;

  // NFT stats
  nftsMinted: number;
  windowCount: number;
  lastWindowStart: number; // Unix timestamp of last window creation
}

export function useTokenStats() {
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [lastWindowStart, setLastWindowStart] = useState<number>(0);

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

  // Minimum ETH required to create a window (threshold)
  const { data: minEthForWindow } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'minEthForWindow',
    query: {
      refetchInterval: 60000, // Less frequent, rarely changes
    },
  });

  // Burned token balance (tokens sent to dead address)
  const { data: burnedBalance } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'balanceOf',
    args: [DEAD_ADDRESS],
    query: {
      refetchInterval: 30000,
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

    // Fetch holder count and last window via our API route (avoids CORS issues with Etherscan)
    const fetchTokenStats = async () => {
      try {
        const response = await fetch('/api/token-stats');
        if (!response.ok) return; // Silently fail - non-critical data
        const data = await response.json();
        if (data.holderCount !== null) {
          setHolderCount(data.holderCount);
        }
        if (data.lastWindowStart !== null) {
          setLastWindowStart(data.lastWindowStart);
        }
      } catch {
        // Silently fail - non-critical
      }
    };

    // Fetch ETH price from CoinGecko
    const fetchEthPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        if (!response.ok) return;
        const data = await response.json();
        if (data.ethereum?.usd) {
          setEthPrice(data.ethereum.usd);
        }
      } catch {
        // Silently fail - non-critical
      }
    };

    fetchDexData();
    fetchTokenStats();
    fetchEthPrice();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDexData();
      fetchTokenStats();
      fetchEthPrice();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    tokenSupply: tokenSupply ?? BigInt(0),
    buybackBalance: balanceData?.value ?? BigInt(0),
    burnCount: windowCount ? Number(windowCount) : 0,
    tokenPrice,
    holderCount,
    ethPrice,
    nftsMinted: nftSupply ? Number(nftSupply) : 0,
    windowCount: windowCount ? Number(windowCount) : 0,
    minEthForWindow: minEthForWindow ?? BigInt(0),
    burnedBalance: burnedBalance ?? BigInt(0),
    lastWindowStart,
  };
}
