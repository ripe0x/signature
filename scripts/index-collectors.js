#!/usr/bin/env node
/**
 * Collector Indexer Script
 *
 * Scans all tokens and builds a leaderboard of collectors.
 * Outputs to data/leaderboard.json for serving via API.
 *
 * Run: node scripts/index-collectors.js
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Write to frontend/public for static serving
const DATA_DIR = join(__dirname, '../frontend/public/data');
const OUTPUT_FILE = join(DATA_DIR, 'leaderboard.json');

// Contract config
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo';
const CONTRACT_ADDRESS = '0x008B66385ed2346E6895031E250B2ac8dc14605C';
const LESS_STRATEGY_ADDRESS = '0x9c2ca573009f181eac634c4d6e44a0977c24f335';

const LESS_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getTokenData',
    outputs: [{ name: 'windowId', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getSeed',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// LESS Strategy Token ABI (for balance fetching)
const STRATEGY_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Batch size for multicall
const BATCH_SIZE = 100;

async function main() {
  console.log('Starting collector indexer...');
  console.log(`RPC: ${RPC_URL.substring(0, 50)}...`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  // Check for changes since last index by looking for Transfer events
  let lastIndexedBlock = 0n;
  let existingLeaderboard = null;
  try {
    const data = readFileSync(OUTPUT_FILE, 'utf-8');
    existingLeaderboard = JSON.parse(data);
    lastIndexedBlock = BigInt(existingLeaderboard?.lastIndexedBlock ?? 0);
  } catch {
    // No existing leaderboard or invalid JSON - will do full index
  }

  const currentBlock = await client.getBlockNumber();

  // If we have a previous index, check for Transfer events since then
  if (lastIndexedBlock > 0n) {
    console.log(`Checking for transfers since block ${lastIndexedBlock}...`);
    const transferLogs = await client.getLogs({
      address: CONTRACT_ADDRESS,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'tokenId', type: 'uint256', indexed: true },
        ],
      },
      fromBlock: lastIndexedBlock + 1n,
      toBlock: currentBlock,
    });

    if (transferLogs.length === 0) {
      console.log('No transfers since last index, skipping re-index.');
      console.log(`Last indexed block: ${lastIndexedBlock}`);
      console.log(`Current block: ${currentBlock}`);
      return;
    }

    console.log(`Found ${transferLogs.length} transfer(s) since block ${lastIndexedBlock}, re-indexing...`);
  }

  // Get total supply and window count
  const [totalSupply, windowCount] = await Promise.all([
    client.readContract({
      address: CONTRACT_ADDRESS,
      abi: LESS_ABI,
      functionName: 'totalSupply',
    }),
    client.readContract({
      address: CONTRACT_ADDRESS,
      abi: LESS_ABI,
      functionName: 'windowCount',
    }),
  ]);

  const total = Number(totalSupply);
  const windows = Number(windowCount) + 1; // +1 to include Window 0

  console.log(`Total tokens: ${total}`);
  console.log(`Total windows: ${windows} (including window 0)`);

  if (total === 0) {
    console.log('No tokens minted yet. Exiting.');
    return;
  }

  // Fetch all token data in batches
  const tokenData = [];

  for (let start = 1; start <= total; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, total);
    console.log(`Fetching tokens ${start}-${end}...`);

    const tokenIds = [];
    for (let i = start; i <= end; i++) {
      tokenIds.push(i);
    }

    // Batch fetch owner, windowId, and seed for each token
    const calls = tokenIds.flatMap(tokenId => [
      {
        address: CONTRACT_ADDRESS,
        abi: LESS_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACT_ADDRESS,
        abi: LESS_ABI,
        functionName: 'getTokenData',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACT_ADDRESS,
        abi: LESS_ABI,
        functionName: 'getSeed',
        args: [BigInt(tokenId)],
      },
    ]);

    const results = await client.multicall({ contracts: calls });

    // Process results (3 results per token: owner, windowId, seed)
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      const ownerResult = results[i * 3];
      const windowResult = results[i * 3 + 1];
      const seedResult = results[i * 3 + 2];

      if (ownerResult.status === 'success' && windowResult.status === 'success' && seedResult.status === 'success') {
        tokenData.push({
          tokenId,
          owner: ownerResult.result.toLowerCase(),
          windowId: Number(windowResult.result),
          seed: seedResult.result,
        });
      } else {
        console.warn(`Failed to fetch data for token ${tokenId}`);
      }
    }
  }

  console.log(`Fetched ${tokenData.length} tokens`);

  // Group by collector
  const collectorMap = new Map();

  for (const token of tokenData) {
    const existing = collectorMap.get(token.owner) || {
      address: token.owner,
      tokens: [],
      windowsSet: new Set(),
    };

    existing.tokens.push({
      tokenId: token.tokenId,
      windowId: token.windowId,
      seed: token.seed,
    });
    existing.windowsSet.add(token.windowId);

    collectorMap.set(token.owner, existing);
  }

  // Fetch $LESS token balances for all collectors
  const collectorAddresses = Array.from(collectorMap.keys());
  console.log(`Fetching $LESS balances for ${collectorAddresses.length} collectors...`);

  const balanceMap = new Map();
  for (let start = 0; start < collectorAddresses.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, collectorAddresses.length);
    const batch = collectorAddresses.slice(start, end);

    const balanceCalls = batch.map(address => ({
      address: LESS_STRATEGY_ADDRESS,
      abi: STRATEGY_ABI,
      functionName: 'balanceOf',
      args: [address],
    }));

    const balanceResults = await client.multicall({ contracts: balanceCalls });

    for (let i = 0; i < batch.length; i++) {
      const result = balanceResults[i];
      if (result.status === 'success') {
        balanceMap.set(batch[i], result.result.toString());
      } else {
        balanceMap.set(batch[i], '0');
      }
    }
  }

  // Convert to array and calculate stats
  const collectors = Array.from(collectorMap.values()).map(c => ({
    address: c.address,
    tokenCount: c.tokens.length,
    windowsCollected: Array.from(c.windowsSet).sort((a, b) => a - b),
    windowCount: c.windowsSet.size,
    isFullCollector: c.windowsSet.size === windows,
    lessBalance: balanceMap.get(c.address) || '0',
    tokens: c.tokens.sort((a, b) => a.tokenId - b.tokenId),
  }));

  // Sort by token count descending, then by window count
  collectors.sort((a, b) => {
    if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
    return b.windowCount - a.windowCount;
  });

  // Build final leaderboard object
  const leaderboard = {
    totalWindows: windows,
    totalTokens: total,
    totalCollectors: collectors.length,
    fullCollectors: collectors.filter(c => c.isFullCollector).map(c => c.address),
    collectors,
    lastIndexedBlock: Number(currentBlock),
    generatedAt: Date.now(),
    generatedAtISO: new Date().toISOString(),
  };

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Write to file
  writeFileSync(OUTPUT_FILE, JSON.stringify(leaderboard, null, 2));
  console.log(`\nLeaderboard saved to ${OUTPUT_FILE}`);
  console.log(`Total collectors: ${collectors.length}`);
  console.log(`Full collectors: ${leaderboard.fullCollectors.length}`);

  // Print top 10
  console.log('\nTop 10 Collectors:');
  collectors.slice(0, 10).forEach((c, i) => {
    const rank = i + 1;
    const status = c.isFullCollector ? '★ FULL' : `${c.windowCount}/${windows}`;
    console.log(`  ${rank}. ${c.address.slice(0, 8)}...${c.address.slice(-6)} - ${c.tokenCount} tokens (${status})`);
  });
}

main().catch(err => {
  console.error('Indexer failed:', err);
  process.exit(1);
});
