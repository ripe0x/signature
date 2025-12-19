import { formatEther } from 'viem';

// Format ETH value for display
export function formatEth(value: bigint, decimals = 4): string {
  const formatted = formatEther(value);
  const num = parseFloat(formatted);
  return num.toFixed(decimals);
}

// Truncate address for display
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format timestamp to readable date
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// Format seconds to countdown string
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format large numbers with commas
export function formatNumber(num: number | bigint): string {
  return num.toLocaleString();
}

// Parse base64 data URI to JSON
export function parseDataUri(dataUri: string): unknown {
  try {
    // Handle data:application/json;base64,...
    const base64Match = dataUri.match(/^data:[^;]+;base64,(.+)$/);
    if (base64Match) {
      const decoded = atob(base64Match[1]);
      return JSON.parse(decoded);
    }

    // Handle data:application/json,...
    const jsonMatch = dataUri.match(/^data:[^,]+,(.+)$/);
    if (jsonMatch) {
      return JSON.parse(decodeURIComponent(jsonMatch[1]));
    }

    return null;
  } catch {
    return null;
  }
}

// Convert hex seed to number for artwork generation
// Must match hexSeedToNumber in fold-core.js exactly
export function seedToNumber(seed: `0x${string}`): number {
  // Take first 8 bytes of hex (16 chars after 0x) and convert to number
  const hex = seed.replace(/^0x/, '').slice(0, 16);
  // Use BigInt for large numbers, then convert to safe integer range
  const bigNum = BigInt('0x' + hex);
  return Number(bigNum % BigInt(2147483647));
}

// Class name helper
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Get Etherscan base URL based on chain ID
export function getEtherscanUrl(chainId: number): string {
  if (chainId === 11155111) return 'https://sepolia.etherscan.io';
  return 'https://etherscan.io';
}

// Build Etherscan URL for address
export function getAddressUrl(address: string, chainId: number): string {
  return `${getEtherscanUrl(chainId)}/address/${address}`;
}

// Build Etherscan URL for transaction
export function getTxUrl(txHash: string, chainId: number): string {
  return `${getEtherscanUrl(chainId)}/tx/${txHash}`;
}
