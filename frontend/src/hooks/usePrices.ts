"use client";

import { useQuery } from "@tanstack/react-query";
import { readContract } from "@wagmi/core";
import { config as wagmiConfig } from "@/lib/wagmi";
import { CONTRACTS, IS_TOKEN_LIVE } from "@/lib/contracts";
import {
  CHAINLINK_AGGREGATOR_ABI,
  CHAINLINK_ETH_USD,
  LESS_ETH_V4_POOL_ID,
  V4_STATE_VIEW,
  V4_STATE_VIEW_ABI,
  lessUsdFromSqrtPrice,
} from "@/lib/pricing";

export type LessPriceSource = "geckoterminal" | "dexscreener" | "onchain";
export type EthPriceSource = "coingecko" | "chainlink";

/**
 * ETH/USD with a CoinGecko primary and a Chainlink on-chain fallback.
 * Both queries are always live so the fallback is warm if CoinGecko hits a
 * rate limit. Chainlink ETH/USD updates roughly hourly so the 60s interval
 * is plenty.
 *
 * The on-chain Chainlink read goes through `@wagmi/core`'s `readContract`
 * (driven by the shared wagmi config) rather than wagmi's `useReadContract`
 * hook. Using uniform `useQuery` hooks throughout this file keeps the React
 * hook call sequence deterministic across renders — `useReadContract` can
 * shift its internal hook count as data transitions from unset to set, which
 * trips React's hooks-order check when nested inside other hooks.
 */
export function useEthPrice(): {
  price: number | null;
  source: EthPriceSource | null;
} {
  const { data: coingecko } = useQuery<number | null>({
    queryKey: ["coingecko", "ethereum"],
    queryFn: async () => {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      if (!response.ok) return null;
      const data = await response.json();
      const value = data?.ethereum?.usd;
      return typeof value === "number" && value > 0 ? value : null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const { data: chainlink } = useQuery<number | null>({
    queryKey: ["chainlink-eth-usd"],
    queryFn: async () => {
      const result = await readContract(wagmiConfig, {
        address: CHAINLINK_ETH_USD,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "latestRoundData",
      });
      const answer = result[1];
      if (answer <= BigInt(0)) return null;
      return Number(answer) / 1e8;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  if (coingecko != null) return { price: coingecko, source: "coingecko" };
  if (chainlink != null) return { price: chainlink, source: "chainlink" };
  return { price: null, source: null };
}

/**
 * LESS/USD with a three-stage fallback:
 *   1. GeckoTerminal — indexes the Uniswap V4 native-ETH pool.
 *   2. DexScreener — fallback in case GeckoTerminal is down or a v3/v2 pair
 *      gets added later.
 *   3. On-chain — read sqrtPriceX96 directly from the V4 pool via StateView
 *      and convert to USD using whatever ETH/USD source is available.
 *
 * All three sources are always polled so a fallback is ready the instant the
 * primary fails. The cost is two free API calls plus one batched on-chain
 * read every 30–60s.
 */
export function useLessPrice(ethPrice: number | null): {
  price: number | null;
  source: LessPriceSource | null;
} {
  const { data: geckoTerminal } = useQuery<number | null>({
    queryKey: ["geckoterminal-less", CONTRACTS.LESS_STRATEGY],
    queryFn: async () => {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${CONTRACTS.LESS_STRATEGY}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      const priceStr = data?.data?.attributes?.price_usd;
      if (!priceStr) return null;
      const parsed = parseFloat(priceStr);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const { data: dexScreener } = useQuery<number | null>({
    queryKey: ["dexscreener-less", CONTRACTS.LESS_STRATEGY],
    queryFn: async () => {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${CONTRACTS.LESS_STRATEGY}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      const pairs = data?.pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) return null;
      const parsed = parseFloat(pairs[0]?.priceUsd);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const { data: onchainSqrtPrice } = useQuery<bigint | null>({
    queryKey: ["v4-pool-slot0", LESS_ETH_V4_POOL_ID],
    queryFn: async () => {
      const result = await readContract(wagmiConfig, {
        address: V4_STATE_VIEW,
        abi: V4_STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [LESS_ETH_V4_POOL_ID],
      });
      const sqrtPriceX96 = result[0];
      return sqrtPriceX96 > BigInt(0) ? sqrtPriceX96 : null;
    },
    enabled: IS_TOKEN_LIVE,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  if (geckoTerminal != null) {
    return { price: geckoTerminal, source: "geckoterminal" };
  }
  if (dexScreener != null) {
    return { price: dexScreener, source: "dexscreener" };
  }
  if (onchainSqrtPrice != null && ethPrice != null) {
    const onchain = lessUsdFromSqrtPrice(onchainSqrtPrice, ethPrice);
    if (onchain > 0) return { price: onchain, source: "onchain" };
  }
  return { price: null, source: null };
}
