#!/usr/bin/env node
/**
 * Fetch and cache secondary tokens (tokens you own but didn't mint)
 * Run once, then send-bounty-rewards.js reads from the cache.
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import 'dotenv/config';

const RPC_URL = process.env.MAINNET_RPC_URL;
const LESS_CONTRACT = '0x008B66385ed2346E6895031E250B2ac8dc14605C';
const YOUR_ADDRESS = '0xCB43078C32423F5348Cab5885911C3B5faE217F9'.toLowerCase();

if (!RPC_URL) {
  console.error('MAINNET_RPC_URL not set');
  process.exit(1);
}

const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL),
});

const LESS_ABI = [
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'ownerOf', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];

async function main() {
  console.log('Fetching minted events...');
  const minters = new Map();

  const output = execSync(
    `cast logs --rpc-url "${RPC_URL}" --address ${LESS_CONTRACT} ` +
    `"Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)" ` +
    `--from-block 21100000 --to-block latest 2>/dev/null`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );

  const lines = output.split('\n');
  let currentTopics = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('topics:')) {
      currentTopics = [];
    } else if (trimmed.startsWith('0x') && currentTopics.length < 4) {
      currentTopics.push(trimmed);
      if (currentTopics.length === 4) {
        const tokenId = parseInt(currentTopics[1], 16);
        const minter = '0x' + currentTopics[3].slice(-40);
        minters.set(tokenId, minter.toLowerCase());
      }
    }
  }

  console.log(`Found ${minters.size} minted tokens`);

  const totalSupply = await client.readContract({
    address: LESS_CONTRACT,
    abi: LESS_ABI,
    functionName: 'totalSupply',
  });

  console.log(`Total supply: ${totalSupply}`);
  console.log('Finding your secondary tokens...');

  const secondaryTokens = [];

  for (let tokenId = 1; tokenId <= Number(totalSupply); tokenId++) {
    const owner = await client.readContract({
      address: LESS_CONTRACT,
      abi: LESS_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    if (owner.toLowerCase() === YOUR_ADDRESS) {
      const minter = minters.get(tokenId);
      if (minter && minter !== YOUR_ADDRESS) {
        secondaryTokens.push(tokenId);
      }
    }
  }

  console.log(`\nFound ${secondaryTokens.length} secondary tokens: [${secondaryTokens.join(', ')}]`);

  writeFileSync('secondary-tokens.json', JSON.stringify({
    tokens: secondaryTokens,
    owner: YOUR_ADDRESS,
    fetchedAt: new Date().toISOString()
  }, null, 2));

  console.log('\nSaved to secondary-tokens.json');
}

main().catch(console.error);
