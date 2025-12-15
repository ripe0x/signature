#!/usr/bin/env node

/**
 * Twitter Bot for Mint Window Announcements
 *
 * Monitors the Less contract for FoldCreated events and tweets announcements
 * when new mint windows open.
 *
 * Usage:
 *   node scripts/twitter-bot.js [--network mainnet]
 */

import { createPublicClient, http, parseAbiItem, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const network = args.find((arg) => arg.startsWith('--network'))?.split('=')[1] || 'mainnet';

// Color logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${colors[color] || ''}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(message, 'cyan');
}

// Get RPC URL
function getRpcUrl() {
  if (network === 'mainnet') {
    return process.env.MAINNET_RPC_URL;
  }
  throw new Error(`Unsupported network: ${network}`);
}

// Get contract address
function getContractAddress() {
  // Allow env override
  if (process.env.LESS_CONTRACT_ADDRESS) {
    return process.env.LESS_CONTRACT_ADDRESS;
  }

  // Try to read from deployment file
  const deploymentFile = join(rootDir, `deployment-${network}.json`);
  if (existsSync(deploymentFile)) {
    const deployment = JSON.parse(readFileSync(deploymentFile, 'utf-8'));
    if (deployment.addresses?.less) {
      return deployment.addresses.less;
    }
  }

  throw new Error(`Contract address not found. Set LESS_CONTRACT_ADDRESS env var or deploy contracts.`);
}

// Load contract ABI
function loadContractABI() {
  const abiPath = join(rootDir, 'out/Less.sol/Less.json');
  if (!existsSync(abiPath)) {
    throw new Error(`Contract ABI not found at ${abiPath}. Run forge build first.`);
  }
  const contractJson = JSON.parse(readFileSync(abiPath, 'utf-8'));
  return contractJson.abi;
}

// Initialize Twitter client
function initTwitterClient() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (bearerToken) {
    // Use bearer token (OAuth 2.0 - may require user context for posting)
    return new TwitterApi(bearerToken);
  } else if (apiKey && apiSecret && accessToken && accessTokenSecret) {
    // Use OAuth 1.0a
    return new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
  }

  throw new Error('Twitter API credentials not found. Set TWITTER_BEARER_TOKEN or OAuth credentials.');
}

// Format duration as human-readable string
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (hours === 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
}

// Format tweet message
function formatTweet(foldId, startTime, endTime, mintPrice, contractAddress) {
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = Math.max(0, Number(endTime) - now);
  const duration = formatDuration(timeRemaining);
  const priceEth = formatEther(BigInt(mintPrice));
  const etherscanLink = `https://etherscan.io/address/${contractAddress}`;

  return `🪬 Fold #${foldId} mint window is now open!

⏰ Window closes in ${duration}
💰 Mint price: ${priceEth} ETH
🔗 ${etherscanLink}

Mint: ${contractAddress}`;
}

// Post tweet
async function postTweet(twitterClient, message) {
  try {
    const tweet = await twitterClient.v2.tweet(message);
    return tweet.data.id;
  } catch (error) {
    if (error.code === 187) {
      // Duplicate tweet
      logError('Tweet failed: duplicate content');
      return null;
    }
    throw error;
  }
}

// Main bot function
async function runBot() {
  logInfo('Starting Twitter bot for mint window announcements...');

  // Initialize configuration
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    logError('MAINNET_RPC_URL environment variable not set');
    process.exit(1);
  }

  const contractAddress = getContractAddress();
  logInfo(`Contract address: ${contractAddress}`);

  const abi = loadContractABI();
  logInfo('Contract ABI loaded');

  const twitterClient = initTwitterClient();
  logInfo('Twitter client initialized');

  // Create viem client
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  logSuccess('Connected to Ethereum mainnet');

  // Track processed fold IDs to avoid duplicate tweets
  const processedFolds = new Set();

  // Get current block number to start watching from
  let currentBlock = await client.getBlockNumber();
  logInfo(`Starting event watch from block ${currentBlock}`);

  // Fetch mint price once (assuming it doesn't change frequently)
  let mintPrice;
  try {
    mintPrice = await client.readContract({
      address: contractAddress,
      abi: abi,
      functionName: 'mintPrice',
    });
    logInfo(`Mint price: ${formatEther(BigInt(mintPrice))} ETH`);
  } catch (error) {
    logError(`Failed to fetch mint price: ${error.message}`);
    // Continue anyway, we'll fetch it per event if needed
  }

  // Watch for FoldCreated events
  const unwatch = client.watchEvent({
    address: contractAddress,
    event: parseAbiItem(
      'event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, uint64 strategyBlock)'
    ),
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const foldId = log.args.foldId;
          const startTime = log.args.startTime;
          const endTime = log.args.endTime;

          // Skip if already processed
          if (processedFolds.has(Number(foldId))) {
            logInfo(`Skipping already processed fold #${foldId}`);
            continue;
          }

          logInfo(`Detected FoldCreated event: foldId=${foldId}, startTime=${startTime}, endTime=${endTime}`);

          // Fetch mint price if not cached
          if (!mintPrice) {
            try {
              mintPrice = await client.readContract({
                address: contractAddress,
                abi: abi,
                functionName: 'mintPrice',
              });
            } catch (error) {
              logError(`Failed to fetch mint price: ${error.message}`);
              continue;
            }
          }

          // Format and post tweet
          const tweetMessage = formatTweet(
            Number(foldId),
            Number(startTime),
            Number(endTime),
            mintPrice,
            contractAddress
          );

          logInfo('Posting tweet...');
          const tweetId = await postTweet(twitterClient, tweetMessage);

          if (tweetId) {
            logSuccess(`Tweet posted successfully! Tweet ID: ${tweetId}`);
            processedFolds.add(Number(foldId));
          } else {
            logError('Failed to post tweet');
          }
        } catch (error) {
          logError(`Error processing event: ${error.message}`);
          if (error.stack) {
            console.error(error.stack);
          }
        }
      }
    },
  });

  logSuccess('Bot is running and monitoring for FoldCreated events...');
  logInfo('Press Ctrl+C to stop');

  // Graceful shutdown
  const shutdown = () => {
    logInfo('Shutting down...');
    unwatch();
    logSuccess('Bot stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

// Run the bot
runBot().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
