import type { Address } from "viem";

/**
 * Uniswap V4 StateView (mainnet).
 * Periphery contract that exposes pool storage reads as plain view functions.
 * https://docs.uniswap.org/contracts/v4/deployments
 */
export const V4_STATE_VIEW: Address =
  "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227";

/**
 * The LESS/ETH V4 pool ID.
 *
 * The pool was initialized with currency0 = native ETH (address(0)) and
 * currency1 = LESS — i.e. NOT a WETH pair. Empirically:
 *   (sqrtPriceX96 / 2^96)^2 ≈ 23.9M atomic LESS per atomic ETH
 *   ETH_USD / 23.9M ≈ $0.0000865, matching GeckoTerminal's $0.0000885.
 *
 * Found via scripts/find-less-v4-pool.mjs (the script's WETH search returns
 * nothing; the real pool uses native ETH). Address came from GeckoTerminal's
 * top_pools relationship for the LESS token.
 */
export const LESS_ETH_V4_POOL_ID =
  "0x86f5c39e644c2f1085c5ebd37f581d5aa4e52d1ccc3f486040bd7ffb9c9f0efb" as `0x${string}`;

/**
 * Chainlink ETH/USD aggregator on mainnet. 8 decimals.
 */
export const CHAINLINK_ETH_USD: Address =
  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

export const V4_STATE_VIEW_ABI = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

export const CHAINLINK_AGGREGATOR_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/**
 * Convert a V4 pool sqrtPriceX96 reading for the LESS/ETH pool into LESS/USD.
 *
 * The pool's currency0 is native ETH, currency1 is LESS, both with 18 decimals.
 * Uniswap stores sqrtPriceX96 = sqrt(currency1/currency0) * 2^96 in atomic
 * units. Same-decimal pair → atomic ratio equals the human ratio, so
 *   lessPerEth = (sqrtPriceX96 / 2^96)^2
 * and a single LESS is worth ethUsd / lessPerEth dollars.
 *
 * sqrtPriceX96 is up to ~3.87e32 — outside Number.MAX_SAFE_INTEGER — but
 * dividing by 2^96 (~7.92e28) yields a ~5e3 scale value that fits well within
 * double precision for the squaring step.
 */
// 2^96 — Q96 fixed-point divisor used by Uniswap's sqrtPriceX96.
const TWO_96 = BigInt("79228162514264337593543950336");
const ZERO = BigInt(0);

export function lessUsdFromSqrtPrice(
  sqrtPriceX96: bigint,
  ethUsd: number
): number {
  if (sqrtPriceX96 <= ZERO || ethUsd <= 0) return 0;
  const sqrtPrice = Number(sqrtPriceX96) / Number(TWO_96);
  const lessPerEth = sqrtPrice * sqrtPrice;
  if (!Number.isFinite(lessPerEth) || lessPerEth <= 0) return 0;
  return ethUsd / lessPerEth;
}
