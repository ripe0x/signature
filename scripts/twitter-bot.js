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
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Use /data for persistent storage on Fly.io, fallback to project root locally
const dataDir = existsSync('/data') ? '/data' : rootDir;
const stateFile = join(dataDir, '.twitter-bot-state.json');

// Parse command line arguments
const args = process.argv.slice(2);
const network = args.find((arg) => arg.startsWith('--network'))?.split('=')[1] || 'mainnet';
const dryRun = args.includes('--dry-run');
const testMode = args.includes('--test');
const verifyMode = args.includes('--verify');
const postTestTweet = args.includes('--post-test');
const pollingInterval = parseInt(args.find((arg) => arg.startsWith('--interval='))?.split('=')[1] || '60', 10) * 1000;

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

function logWarn(message) {
  log(`⚠ ${message}`, 'yellow');
}

// State persistence - tracks processed folds and last block
function loadState() {
  try {
    if (existsSync(stateFile)) {
      const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
      return {
        processedFolds: new Set(data.processedFolds || []),
        lastBlock: BigInt(data.lastBlock || 0),
      };
    }
  } catch (error) {
    logWarn(`Failed to load state file: ${error.message}`);
  }
  return { processedFolds: new Set(), lastBlock: 0n };
}

function saveState(processedFolds, lastBlock) {
  try {
    const data = {
      processedFolds: Array.from(processedFolds),
      lastBlock: lastBlock.toString(),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(stateFile, JSON.stringify(data, null, 2));
  } catch (error) {
    logWarn(`Failed to save state file: ${error.message}`);
  }
}

// Sleep helper for retry delays
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch image from image API
async function fetchImage(seed) {
  const imageApiUrl = process.env.IMAGE_API_URL;
  if (!imageApiUrl) {
    logWarn('IMAGE_API_URL not set, skipping image');
    return null;
  }

  const url = `${imageApiUrl}/api/render?seed=${seed}`;
  logInfo(`Fetching image from ${url}`);

  return new Promise((resolve) => {
    const get = url.startsWith('https') ? httpsGet : httpGet;
    get(url, (res) => {
      if (res.statusCode !== 200) {
        logError(`Image API returned status ${res.statusCode}`);
        resolve(null);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logSuccess(`Image fetched: ${buffer.length} bytes`);
        resolve(buffer);
      });
      res.on('error', (err) => {
        logError(`Image fetch error: ${err.message}`);
        resolve(null);
      });
    }).on('error', (err) => {
      logError(`Image fetch error: ${err.message}`);
      resolve(null);
    });
  });
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
  // Skip Twitter initialization in dry-run or test mode
  if (dryRun || testMode) {
    return null;
  }

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

  return `Fold #${foldId} mint window is now open.

Window closes in ${duration}.`;
}

// Display tweet preview in console
function displayTweetPreview(message) {
  console.log();
  console.log(`${colors.cyan}╭────────────────────────────────────────────╮${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}📱 Tweet Preview${colors.reset}                          ${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}╰────────────────────────────────────────────╯${colors.reset}`);
  console.log();
  console.log(message);
  console.log();
  console.log(`${colors.gray}${'─'.repeat(44)}${colors.reset}`);
  console.log(`${colors.gray}Character count: ${message.length}/280${colors.reset}`);
  console.log();
}

// Post tweet with optional image
async function postTweet(twitterClient, message, imageBuffer = null) {
  // In dry-run or test mode, just display the preview
  if (dryRun || testMode) {
    displayTweetPreview(message);
    if (imageBuffer) {
      logInfo(`[DRY-RUN] Would attach image (${imageBuffer.length} bytes)`);
    }
    logInfo('[DRY-RUN] Tweet would be posted (not actually sent)');
    return 'dry-run-id';
  }

  try {
    let mediaId = null;

    // Upload image if provided
    if (imageBuffer && twitterClient) {
      try {
        logInfo('Uploading image to Twitter...');
        mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' });
        logSuccess(`Image uploaded, media_id: ${mediaId}`);
      } catch (uploadError) {
        logError(`Image upload failed: ${uploadError.message}`);
        // Continue without image
      }
    }

    // Post tweet with or without media
    const tweetOptions = mediaId ? { media: { media_ids: [mediaId] } } : {};
    const tweet = await twitterClient.v2.tweet(message, tweetOptions);
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

// Verify Twitter credentials
async function verifyCredentials() {
  logInfo('Verifying Twitter credentials...');

  try {
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    const me = await twitterClient.v2.me();
    logSuccess(`Credentials valid! Authenticated as @${me.data.username}`);
    return true;
  } catch (error) {
    logError(`Credential verification failed: ${error.message}`);
    return false;
  }
}

// Post an actual test tweet
async function postTestTweetNow() {
  logInfo('Posting test tweet...');

  try {
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    const message = `Test post from Fold bot. ${new Date().toISOString()}`;
    const tweet = await twitterClient.v2.tweet(message);
    logSuccess(`Tweet posted! ID: ${tweet.data.id}`);
    logInfo(`View at: https://x.com/i/status/${tweet.data.id}`);
    return true;
  } catch (error) {
    logError(`Failed to post tweet: ${error.message}`);
    return false;
  }
}

// Run test mode - simulate a FoldCreated event
async function runTestMode() {
  logInfo('Running in TEST MODE - simulating a FoldCreated event');
  console.log();

  // Use sample data or try to get real contract address
  let contractAddress = '0x1234567890123456789012345678901234567890';
  try {
    contractAddress = getContractAddress();
    logInfo(`Using real contract address: ${contractAddress}`);
  } catch (e) {
    logInfo(`Using sample contract address: ${contractAddress}`);
  }

  // Simulate event data
  const now = Math.floor(Date.now() / 1000);
  const testFoldId = 42;
  const testStartTime = now;
  const testEndTime = now + 3600; // 1 hour from now
  const testMintPrice = 100000000000000000n; // 0.1 ETH
  const testStrategyBlock = 18000000;

  logInfo(`Simulated event: Fold #${testFoldId}`);
  logInfo(`  Start time: ${new Date(testStartTime * 1000).toISOString()}`);
  logInfo(`  End time: ${new Date(testEndTime * 1000).toISOString()}`);
  logInfo(`  Mint price: ${formatEther(testMintPrice)} ETH`);
  console.log();

  // Generate preview seed and fetch image
  const previewSeed = generatePreviewSeed(testFoldId, testStrategyBlock, testStartTime);
  logInfo(`Preview seed: ${previewSeed}`);
  const imageBuffer = await fetchImage(previewSeed);

  // Format and display the tweet
  const tweetMessage = formatTweet(
    testFoldId,
    testStartTime,
    testEndTime,
    testMintPrice,
    contractAddress
  );

  await postTweet(null, tweetMessage, imageBuffer);
  logSuccess('Test completed!');
}

// Generate a preview seed for a fold (deterministic based on fold parameters)
function generatePreviewSeed(foldId, strategyBlock, startTime) {
  // Create a deterministic seed from fold parameters
  // This mimics how the contract generates seeds but uses fold-level data
  const data = `fold-${foldId}-${strategyBlock}-${startTime}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Convert to hex string
  const hex = Math.abs(hash).toString(16).padStart(16, '0');
  return `0x${hex}${hex}${hex}${hex}`;
}

// Process a single FoldCreated event
async function processEvent(log, processedFolds, twitterClient, contractAddress, client, abi) {
  try {
    const foldId = log.args.foldId;
    const startTime = log.args.startTime;
    const endTime = log.args.endTime;
    const strategyBlock = log.args.strategyBlock;

    // Skip if already processed
    if (processedFolds.has(Number(foldId))) {
      logInfo(`Skipping already processed fold #${foldId}`);
      return;
    }

    logInfo(`Detected FoldCreated event: foldId=${foldId}, startTime=${startTime}, endTime=${endTime}`);

    // Fetch mint price
    let mintPrice;
    try {
      mintPrice = await client.readContract({
        address: contractAddress,
        abi: abi,
        functionName: 'mintPrice',
      });
    } catch (error) {
      logError(`Failed to fetch mint price: ${error.message}`);
      return;
    }

    // Generate preview seed and fetch image
    const previewSeed = generatePreviewSeed(Number(foldId), Number(strategyBlock), Number(startTime));
    logInfo(`Preview seed: ${previewSeed}`);
    const imageBuffer = await fetchImage(previewSeed);

    // Format and post tweet
    const tweetMessage = formatTweet(
      Number(foldId),
      Number(startTime),
      Number(endTime),
      mintPrice,
      contractAddress
    );

    logInfo('Posting tweet...');
    const tweetId = await postTweet(twitterClient, tweetMessage, imageBuffer);

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

// Main bot function
async function runBot() {
  // Handle verify mode
  if (verifyMode) {
    await verifyCredentials();
    return;
  }

  // Handle post-test mode
  if (postTestTweet) {
    await postTestTweetNow();
    return;
  }

  // Handle test mode
  if (testMode) {
    await runTestMode();
    return;
  }

  logInfo('Starting Twitter bot for mint window announcements...');
  if (dryRun) {
    logInfo('Running in DRY-RUN mode - tweets will be previewed but not posted');
  }

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
  if (twitterClient) {
    logInfo('Twitter client initialized');
  } else {
    logInfo('Twitter client skipped (dry-run mode)');
  }

  // Load persisted state
  const state = loadState();
  const processedFolds = state.processedFolds;
  let lastProcessedBlock = state.lastBlock;

  if (processedFolds.size > 0) {
    logInfo(`Loaded ${processedFolds.size} previously processed folds from state`);
  }
  if (lastProcessedBlock > 0n) {
    logInfo(`Last processed block: ${lastProcessedBlock}`);
  }

  // Retry loop with exponential backoff
  let retryCount = 0;
  const maxRetries = 10;
  const baseDelay = 5000; // 5 seconds

  while (true) {
    let unwatch = null;

    try {
      // Create viem client
      const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
        pollingInterval,
      });

      logInfo(`Polling interval: ${pollingInterval / 1000} seconds`);
      logSuccess('Connected to Ethereum mainnet');

      // Get current block
      const currentBlock = await client.getBlockNumber();
      logInfo(`Current block: ${currentBlock}`);

      // Scan for missed events since last processed block
      const lookbackBlocks = 1000n; // ~3.5 hours of blocks
      const fromBlock = lastProcessedBlock > 0n
        ? lastProcessedBlock + 1n
        : currentBlock - lookbackBlocks;

      if (fromBlock < currentBlock) {
        logInfo(`Scanning for missed events from block ${fromBlock} to ${currentBlock}...`);

        const missedLogs = await client.getLogs({
          address: contractAddress,
          event: parseAbiItem(
            'event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, uint64 strategyBlock)'
          ),
          fromBlock,
          toBlock: currentBlock,
        });

        if (missedLogs.length > 0) {
          logInfo(`Found ${missedLogs.length} events in block range`);
          for (const log of missedLogs) {
            await processEvent(log, processedFolds, twitterClient, contractAddress, client, abi);
          }
        } else {
          logInfo('No missed events found');
        }
      }

      // Update last processed block
      lastProcessedBlock = currentBlock;
      saveState(processedFolds, lastProcessedBlock);

      // Reset retry count on successful connection
      retryCount = 0;

      // Watch for new FoldCreated events
      unwatch = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          'event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, uint64 strategyBlock)'
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            await processEvent(log, processedFolds, twitterClient, contractAddress, client, abi);
            // Update last processed block and save state
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              saveState(processedFolds, lastProcessedBlock);
            }
          }
        },
        onError: (error) => {
          logError(`Watcher error: ${error.message}`);
          // The error will cause the watcher to stop, triggering reconnection
        },
      });

      logSuccess('Bot is running and monitoring for FoldCreated events...');
      logInfo('Press Ctrl+C to stop');

      // Graceful shutdown handler
      const shutdown = () => {
        logInfo('Shutting down...');
        if (unwatch) unwatch();
        saveState(processedFolds, lastProcessedBlock);
        logSuccess('State saved. Bot stopped.');
        process.exit(0);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);

      // Keep alive - this will block until an error occurs
      await new Promise((_, reject) => {
        // Periodic health check every 5 minutes
        const healthCheck = setInterval(async () => {
          try {
            await client.getBlockNumber();
          } catch (error) {
            clearInterval(healthCheck);
            reject(error);
          }
        }, 300000);
      });

    } catch (error) {
      if (unwatch) unwatch();

      retryCount++;
      if (retryCount > maxRetries) {
        logError(`Max retries (${maxRetries}) exceeded. Exiting.`);
        process.exit(1);
      }

      const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), 300000); // Max 5 min
      logError(`Connection error: ${error.message}`);
      logWarn(`Reconnecting in ${delay / 1000} seconds (attempt ${retryCount}/${maxRetries})...`);

      await sleep(delay);
    }
  }
}

// Run the bot
runBot().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
