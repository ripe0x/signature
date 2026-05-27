import { NextResponse } from 'next/server';
import { getMainnetRpcUrls } from '@/lib/rpc';

const LESS_STRATEGY = '0x9c2ca573009f181eac634c4d6e44a0977c24f335';
const LESS_NFT = '0x008B66385ed2346E6895031E250B2ac8dc14605C';

// WindowCreated event signature: keccak256("WindowCreated(uint256,uint64,uint64)")
const WINDOW_CREATED_TOPIC = '0xe06ce442afd483033ce0a251188ca4c4d1c81a74bf69c6d3699cede668afda47';

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;

  // Fetch holder count and last window in parallel
  const [holderCount, lastWindowStart] = await Promise.all([
    fetchHolderCount(apiKey),
    fetchLastWindowStart(),
  ]);

  return NextResponse.json({ holderCount, lastWindowStart });
}

async function fetchHolderCount(apiKey: string | undefined): Promise<number | null> {
  try {
    const url = apiKey
      ? `https://api.etherscan.io/api?module=token&action=tokenholdercount&contractaddress=${LESS_STRATEGY}&apikey=${apiKey}`
      : `https://api.etherscan.io/api?module=token&action=tokenholdercount&contractaddress=${LESS_STRATEGY}`;

    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;

    const data = await response.json();
    return data.status === '1' && data.result ? parseInt(data.result, 10) : null;
  } catch {
    return null;
  }
}

// Try each RPC in order, returning the first non-error JSON-RPC result.
// Logs which provider served so degradation off the paid tier is visible.
async function rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T | null> {
  const urls = getMainnetRpcUrls();
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.error || data.result === undefined) continue;
      if (url !== urls[0]) {
        console.warn(`[token-stats] RPC fell back to ${url} for ${method}`);
      }
      return data.result as T;
    } catch (err) {
      console.warn(`[token-stats] RPC ${url} failed for ${method}:`, err);
    }
  }
  return null;
}

async function fetchLastWindowStart(): Promise<number | null> {
  try {
    const blockHex = await rpcCall<string>('eth_blockNumber', []);
    if (!blockHex) return null;

    const currentBlock = parseInt(blockHex, 16);
    const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks

    const logs = await rpcCall<Array<{ data: string }>>('eth_getLogs', [
      {
        address: LESS_NFT,
        topics: [WINDOW_CREATED_TOPIC],
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: 'latest',
      },
    ]);
    if (!logs || logs.length === 0) return null;

    const lastEvent = logs[logs.length - 1];
    // Data contains startTime (uint64) and endTime (uint64) packed as uint256s
    // startTime is first 32 bytes (64 hex chars) after 0x
    const dataHex = lastEvent.data;
    const startTimeHex = dataHex.slice(2, 66);
    return parseInt(startTimeHex, 16);
  } catch (error) {
    console.error('Failed to fetch last window:', error);
    return null;
  }
}
