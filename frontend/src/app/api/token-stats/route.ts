import { NextResponse } from 'next/server';

const LESS_STRATEGY = '0x9c2ca573009f181eac634c4d6e44a0977c24f335';
const LESS_NFT = '0x008B66385ed2346E6895031E250B2ac8dc14605C';

// WindowCreated event signature: keccak256("WindowCreated(uint256,uint64,uint64)")
const WINDOW_CREATED_TOPIC = '0xe06ce442afd483033ce0a251188ca4c4d1c81a74bf69c6d3699cede668afda47';

// Alchemy RPC URL (public key from the project)
const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/vCDlbqYLHrl_dZJkGmX2FgpAUpRs-iTI';

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

async function fetchLastWindowStart(): Promise<number | null> {
  try {
    // Get current block number
    const blockResponse = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
      next: { revalidate: 30 },
    });

    const blockData = await blockResponse.json();
    const currentBlock = parseInt(blockData.result, 16);
    const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks

    // Query logs via Alchemy RPC
    const logsResponse = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [{
          address: LESS_NFT,
          topics: [WINDOW_CREATED_TOPIC],
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: 'latest',
        }],
      }),
      next: { revalidate: 30 },
    });

    const logsData = await logsResponse.json();
    if (!logsData.result || logsData.result.length === 0) return null;

    // Get the last event (most recent window)
    const lastEvent = logsData.result[logsData.result.length - 1];
    // Data contains startTime (uint64) and endTime (uint64) packed as uint256s
    // startTime is first 32 bytes (64 hex chars) after 0x
    const dataHex = lastEvent.data;
    const startTimeHex = dataHex.slice(2, 66); // First uint256 (padded uint64)
    const startTime = parseInt(startTimeHex, 16);

    return startTime;
  } catch (error) {
    console.error('Failed to fetch last window:', error);
    return null;
  }
}
