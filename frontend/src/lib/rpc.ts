/**
 * Shared RPC endpoint list for mainnet.
 *
 * The primary endpoint is the project's paid provider (Alchemy via
 * NEXT_PUBLIC_RPC_URL when set). Public endpoints follow as fallbacks so the
 * site keeps functioning if the paid endpoint is rate-limited, hits its
 * monthly quota, or is otherwise unavailable.
 *
 * All three public endpoints below were probed and confirmed serving
 * eth_getBalance for our strategy contract without authentication.
 */

export const PUBLIC_MAINNET_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://1rpc.io/eth",
] as const;

/**
 * Ordered list of mainnet RPCs to try, paid endpoint first when configured.
 * Use for fallback chains: paid → publicnode → blastapi → 1rpc.
 */
export function getMainnetRpcUrls(): string[] {
  const primary = process.env.NEXT_PUBLIC_RPC_URL;
  return primary ? [primary, ...PUBLIC_MAINNET_RPCS] : [...PUBLIC_MAINNET_RPCS];
}
