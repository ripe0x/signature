import { formatEther } from 'viem';

// Format ETH value for display (strips trailing zeros)
export function formatEth(value: bigint, decimals = 4): string {
  const formatted = formatEther(value);
  const num = parseFloat(formatted);
  return parseFloat(num.toFixed(decimals)).toString();
}

// Format token balance for display (18 decimals, compact format)
export function formatTokenBalance(balanceStr: string, compact = true): string {
  if (!balanceStr || balanceStr === '0') return '0';

  try {
    const balance = BigInt(balanceStr);
    const formatted = formatEther(balance);
    const num = parseFloat(formatted);

    if (compact) {
      // Compact format: 1.2K, 1.2M, etc.
      if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(1)}M`;
      } else if (num >= 1_000) {
        return `${(num / 1_000).toFixed(1)}K`;
      } else if (num >= 1) {
        return num.toFixed(1);
      } else if (num > 0) {
        return num.toFixed(4);
      }
    }

    // Full format with commas
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return '0';
  }
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

// Normalize token URI to a fetchable URL
export function normalizeTokenUri(uri: string): string {
  if (!uri) return uri;

  if (uri.startsWith("ipfs://")) {
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";
    return gateway + uri.replace("ipfs://", "");
  }

  if (uri.startsWith("ar://")) {
    return "https://arweave.net/" + uri.replace("ar://", "");
  }

  return uri;
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

// Get Etherscan base URL
export function getEtherscanUrl(): string {
  return 'https://etherscan.io';
}

// Build Etherscan URL for address
export function getAddressUrl(address: string): string {
  return `${getEtherscanUrl()}/address/${address}`;
}

// Build Etherscan URL for transaction
export function getTxUrl(txHash: string): string {
  return `${getEtherscanUrl()}/tx/${txHash}`;
}

// Generate Unicode progress bar (dark shade for filled, light shade for empty)
export function generateUnicodeProgressBar(percentage: number, length: number = 20): string {
  const progressPercent = Math.min(percentage, 100);
  const filledBlocks = Math.floor((progressPercent / 100) * length);

  let progressBar = "";

  // Add filled blocks (dark shade ▓)
  for (let i = 0; i < filledBlocks; i++) {
    progressBar += "▓";
  }

  // Fill rest with light shade (░)
  while (progressBar.length < length) {
    progressBar += "░";
  }

  return progressBar;
}

// Generate Unicode progress bar as array of characters for flex layout
export function generateUnicodeProgressBarArray(percentage: number, length: number = 20): string[] {
  return generateUnicodeProgressBar(percentage, length).split("");
}
