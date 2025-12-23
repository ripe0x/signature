import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';

const LESS_NFT = process.env.NEXT_PUBLIC_LESS_NFT || '0x008B66385ed2346E6895031E250B2ac8dc14605C';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/vCDlbqYLHrl_dZJkGmX2FgpAUpRs-iTI';

const LESS_ABI = [
  {
    inputs: [],
    name: 'getCurrentWindow',
    outputs: [
      { name: 'windowId', type: 'uint256' },
      { name: 'startTime', type: 'uint64' },
      { name: 'endTime', type: 'uint64' },
      { name: 'strategyBlock', type: 'uint64' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'windowCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowIdParam = searchParams.get('windowId');
    
    const client = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL),
    });

    let windowId: number;
    
    if (windowIdParam) {
      windowId = parseInt(windowIdParam, 10);
      if (isNaN(windowId) || windowId < 1) {
        return NextResponse.json({ error: 'Invalid window ID' }, { status: 400 });
      }
    } else {
      // Random window between 2-10
      const windowCount = await client.readContract({
        address: LESS_NFT as `0x${string}`,
        abi: LESS_ABI,
        functionName: 'windowCount',
      });
      const maxWindow = Math.min(Number(windowCount), 10);
      const minWindow = Math.max(2, Math.min(Number(windowCount), 2));
      windowId = Math.floor(Math.random() * (maxWindow - minWindow + 1)) + minWindow;
    }

    // Query all mints for this window
    // Since windowId is indexed, we can efficiently query from block 0
    // The indexed filter makes this query fast even for old windows
    const mintLogs = await client.getLogs({
      address: LESS_NFT as `0x${string}`,
      event: parseAbiItem(
        'event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)'
      ),
      args: {
        windowId: BigInt(windowId),
      },
      fromBlock: 0n, // Query from contract deployment - indexed windowId makes this efficient
      toBlock: 'latest',
    });

    const tokenIds = mintLogs
      .map((log) => Number(log.args.tokenId))
      .sort((a, b) => a - b);

    return NextResponse.json({
      windowId,
      tokenIds,
      mintCount: tokenIds.length,
    });
  } catch (error) {
    console.error('Error fetching window summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch window summary', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

