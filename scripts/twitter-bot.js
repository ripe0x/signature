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

import { createPublicClient, http, parseAbiItem, formatEther } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { TwitterApi } from "twitter-api-v2";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Use /data for persistent storage on Fly.io, fallback to project root locally
const dataDir = existsSync("/data") ? "/data" : rootDir;
const stateFile = join(dataDir, ".twitter-bot-state.json");

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "mainnet";
const dryRun = args.includes("--dry-run");
const testMode = args.includes("--test");
const testMintMode = args.includes("--test-mint");
const verifyMode = args.includes("--verify");
const postTestTweet = args.includes("--post-test");
const rescanMode = args.includes("--rescan"); // Force rescan from lookback, ignoring saved lastBlock
const pollingInterval =
  parseInt(
    args.find((arg) => arg.startsWith("--interval="))?.split("=")[1] || "60",
    10
  ) * 1000;

// Color logging
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(message, color = "reset") {
  const timestamp = new Date().toISOString();
  console.log(
    `${colors.gray}[${timestamp}]${colors.reset} ${
      colors[color] || ""
    }${message}${colors.reset}`
  );
}

function logSuccess(message) {
  log(`✓ ${message}`, "green");
}

function logError(message) {
  log(`✗ ${message}`, "red");
}

function logInfo(message) {
  log(message, "cyan");
}

function logWarn(message) {
  log(`⚠ ${message}`, "yellow");
}

// State persistence - tracks processed folds, mints, and last block
function loadState() {
  try {
    if (existsSync(stateFile)) {
      const data = JSON.parse(readFileSync(stateFile, "utf-8"));
      return {
        processedFolds: new Set(data.processedFolds || []),
        processedMints: new Set(data.processedMints || []),
        lastBlock: BigInt(data.lastBlock || 0),
      };
    }
  } catch (error) {
    logWarn(`Failed to load state file: ${error.message}`);
  }
  return {
    processedFolds: new Set(),
    processedMints: new Set(),
    lastBlock: 0n,
  };
}

function saveState(processedFolds, processedMints, lastBlock) {
  try {
    const data = {
      processedFolds: Array.from(processedFolds),
      processedMints: Array.from(processedMints),
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
    logWarn("IMAGE_API_URL not set, skipping image");
    return null;
  }

  const url = `${imageApiUrl}/api/render?seed=${seed}`;
  logInfo(`Fetching image from ${url}`);

  return new Promise((resolve) => {
    const get = url.startsWith("https") ? httpsGet : httpGet;
    get(url, (res) => {
      if (res.statusCode !== 200) {
        logError(`Image API returned status ${res.statusCode}`);
        resolve(null);
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        logSuccess(`Image fetched: ${buffer.length} bytes`);
        resolve(buffer);
      });
      res.on("error", (err) => {
        logError(`Image fetch error: ${err.message}`);
        resolve(null);
      });
    }).on("error", (err) => {
      logError(`Image fetch error: ${err.message}`);
      resolve(null);
    });
  });
}

// Get RPC URL
function getRpcUrl() {
  if (network === "mainnet") {
    return process.env.MAINNET_RPC_URL;
  }
  if (network === "sepolia") {
    return process.env.SEPOLIA_RPC_URL;
  }
  throw new Error(`Unsupported network: ${network}`);
}

// Get chain config
function getChain() {
  if (network === "mainnet") return mainnet;
  if (network === "sepolia") return sepolia;
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
    const deployment = JSON.parse(readFileSync(deploymentFile, "utf-8"));
    if (deployment.contracts?.less) {
      return deployment.contracts.less;
    }
  }

  throw new Error(
    `Contract address not found. Set LESS_CONTRACT_ADDRESS env var or deploy contracts.`
  );
}

// Load contract ABI
function loadContractABI() {
  const abiPath = join(rootDir, "out/Less.sol/Less.json");
  if (!existsSync(abiPath)) {
    throw new Error(
      `Contract ABI not found at ${abiPath}. Run forge build first.`
    );
  }
  const contractJson = JSON.parse(readFileSync(abiPath, "utf-8"));
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

  throw new Error(
    "Twitter API credentials not found. Set TWITTER_BEARER_TOKEN or OAuth credentials."
  );
}

// Format duration as human-readable string
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${
      minutes !== 1 ? "s" : ""
    }`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (hours === 0) {
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  return `${days} day${days !== 1 ? "s" : ""} ${hours} hour${
    hours !== 1 ? "s" : ""
  }`;
}

const MINT_URL = "https://less.ripe.wtf";
const LESS_TOKEN_ADDRESS = process.env.LESS_TOKEN_ADDRESS;
const INITIAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals

// Fetch burn data from strategy and token contracts
async function fetchBurnData(client, contractAddress, abi) {
  try {
    if (!LESS_TOKEN_ADDRESS) {
      logInfo("LESS_TOKEN_ADDRESS not set, skipping burn data");
      return null;
    }

    // Create mainnet client for token reads (token is always on mainnet)
    const mainnetRpc = process.env.MAINNET_RPC_URL;
    if (!mainnetRpc) {
      logInfo("MAINNET_RPC_URL not set, skipping burn data");
      return null;
    }

    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(mainnetRpc),
    });

    // Get current total supply and burned amount from token (on mainnet)
    const tokenAbi = [
      {
        inputs: [],
        name: "totalSupply",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

    const [totalSupply, burnedBalance] = await Promise.all([
      mainnetClient.readContract({
        address: LESS_TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "totalSupply",
      }),
      mainnetClient.readContract({
        address: LESS_TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [DEAD_ADDRESS],
      }),
    ]);

    // Circulating supply = totalSupply - burned (sent to dead address)
    const circulatingSupply = totalSupply - burnedBalance;

    logInfo(`Token totalSupply: ${formatEther(totalSupply)} LESS`);
    logInfo(`Burned (dead address): ${formatEther(burnedBalance)} LESS`);
    logInfo(`Circulating supply: ${formatEther(circulatingSupply)} LESS`);

    // Calculate remaining supply percentage (2 decimal places)
    const supplyRemainingBps = (circulatingSupply * 10000n) / INITIAL_SUPPLY;
    const supplyRemaining = (Number(supplyRemainingBps) / 100).toFixed(2);

    // Try to get lastBurn from strategy (on same network as LESS NFT contract)
    let lastBurnFormatted = null;

    // Allow mock lastBurn for testing
    if (process.env.MOCK_LAST_BURN) {
      lastBurnFormatted = Number(process.env.MOCK_LAST_BURN).toLocaleString();
      logInfo(`Using mock lastBurn: ${lastBurnFormatted} LESS`);
    } else {
      try {
        const strategyAddress = await client.readContract({
          address: contractAddress,
          abi: abi,
          functionName: "strategy",
        });

        if (
          strategyAddress &&
          strategyAddress !== "0x0000000000000000000000000000000000000000"
        ) {
          const strategyAbi = [
            {
              inputs: [],
              name: "getState",
              outputs: [
                { name: "supply", type: "uint256" },
                { name: "eth", type: "uint256" },
                { name: "lastBurn", type: "uint256" },
                { name: "burns", type: "uint256" },
              ],
              stateMutability: "view",
              type: "function",
            },
          ];

          const [supply, eth, lastBurn, burns] = await client.readContract({
            address: strategyAddress,
            abi: strategyAbi,
            functionName: "getState",
          });

          // Format burn amount (in whole tokens, no decimals)
          lastBurnFormatted = Number(lastBurn / 10n ** 18n).toLocaleString();
          logInfo(`Strategy lastBurn: ${lastBurnFormatted} LESS`);
        }
      } catch (e) {
        logInfo("No strategy available for lastBurn data");
      }
    }

    // If we have lastBurn, return full data; otherwise just supply
    if (lastBurnFormatted && lastBurnFormatted !== "0") {
      return {
        amountBurned: lastBurnFormatted,
        supplyRemaining: supplyRemaining,
      };
    }

    // Return just supply data (will use simple format without burn line)
    logInfo(`Supply remaining: ${supplyRemaining}%`);
    return {
      amountBurned: null,
      supplyRemaining: supplyRemaining,
    };
  } catch (error) {
    logWarn(`Failed to fetch burn data: ${error.message}`);
    return null;
  }
}

// Truncate address to 0x1234...5678 format
function truncateAddress(address) {
  if (!address) return "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format minutes remaining
function formatMinutesRemaining(seconds) {
  const minutes = Math.ceil(seconds / 60);
  return minutes;
}

// Format tweet message for FoldCreated
function formatTweet(foldId, startTime, endTime, burnData = null) {
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = Math.max(0, Number(endTime) - now);
  const minutesLeft = formatMinutesRemaining(timeRemaining);

  // If we have full burn data (amount + supply), include both lines
  if (burnData && burnData.amountBurned && burnData.supplyRemaining) {
    return `new LESS window opened

${burnData.amountBurned} $LESS bought and burned
${burnData.supplyRemaining}% supply remaining

LESS is open to mint for the next ${minutesLeft} minutes for fold #${foldId}

${MINT_URL}`;
  }

  // If we have only supply data (no burn amount), show just supply
  if (burnData && burnData.supplyRemaining) {
    return `new LESS window opened


${burnData.supplyRemaining}% total supply remaining

LESS is open to mint for the next ${minutesLeft} minutes for fold #${foldId}


${MINT_URL}`;
  }

  // Simple format without any burn/supply data
  return `new LESS window opened


 LESS is open to mint for the next ${minutesLeft} minutes for fold #${foldId}


${MINT_URL}`;
}

// Display tweet preview in console
function displayTweetPreview(message) {
  console.log();
  console.log(
    `${colors.cyan}╭────────────────────────────────────────────╮${colors.reset}`
  );
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}📱 Tweet Preview${colors.reset}                          ${colors.cyan}│${colors.reset}`
  );
  console.log(
    `${colors.cyan}╰────────────────────────────────────────────╯${colors.reset}`
  );
  console.log();
  console.log(message);
  console.log();
  console.log(`${colors.gray}${"─".repeat(44)}${colors.reset}`);
  console.log(
    `${colors.gray}Character count: ${message.length}/280${colors.reset}`
  );
  console.log();
}

// Post tweet with optional image
async function postTweet(twitterClient, message, imageBuffer = null) {
  // In dry-run or test mode, just display the preview
  if (dryRun || testMode || testMintMode) {
    displayTweetPreview(message);
    if (imageBuffer) {
      logInfo(`[DRY-RUN] Would attach image (${imageBuffer.length} bytes)`);
    }
    logInfo("[DRY-RUN] Tweet would be posted (not actually sent)");
    return "dry-run-id";
  }

  try {
    let mediaId = null;

    // Upload image if provided
    if (imageBuffer && twitterClient) {
      try {
        logInfo("Uploading image to Twitter...");
        mediaId = await twitterClient.v1.uploadMedia(imageBuffer, {
          mimeType: "image/png",
        });
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
      logError("Tweet failed: duplicate content");
      return null;
    }
    throw error;
  }
}

// Verify Twitter credentials
async function verifyCredentials() {
  logInfo("Verifying Twitter credentials...");

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
  logInfo("Posting test tweet...");

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
  logInfo("Running in TEST MODE - simulating a FoldCreated event");
  console.log();

  // Simulate event data
  const now = Math.floor(Date.now() / 1000);
  const testFoldId = 42;
  const testStartTime = now;
  const testEndTime = now + 3600; // 1 hour from now

  logInfo(`Simulated event: Fold #${testFoldId}`);
  logInfo(`  Start time: ${new Date(testStartTime * 1000).toISOString()}`);
  logInfo(`  End time: ${new Date(testEndTime * 1000).toISOString()}`);
  console.log();

  // Fetch burn data (if configured)
  let burnData = null;
  try {
    const rpcUrl = getRpcUrl();
    const contractAddress = getContractAddress();
    const abi = loadContractABI();
    const client = createPublicClient({
      chain: getChain(),
      transport: http(rpcUrl),
    });
    burnData = await fetchBurnData(client, contractAddress, abi);
  } catch (error) {
    logWarn(`Could not fetch burn data: ${error.message}`);
  }

  // Format and display the tweet
  const tweetMessage = formatTweet(
    testFoldId,
    testStartTime,
    testEndTime,
    burnData
  );

  await postTweet(null, tweetMessage);
  logSuccess("Test completed!");
}

// Run test mint mode - simulate a Minted event
async function runTestMintMode() {
  logInfo("Running in TEST MINT MODE - simulating a Minted event");
  console.log();

  // Simulate event data
  const testTokenId = 7;
  const testMinter = "0x4fa58fFc00D973fD222d573C256Eb3Cc81A8569c";
  // Use a test seed
  const testSeed =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  logInfo(`Simulated event: Minted token #${testTokenId}`);
  logInfo(`  Minter: ${testMinter}`);
  logInfo(`  Seed: ${testSeed}`);
  console.log();

  // Fetch image using the seed
  const imageBuffer = await fetchImage(testSeed);

  // Format and display the tweet with image
  const minterDisplay = truncateAddress(testMinter);
  const tweetMessage = formatMintTweet(testTokenId, minterDisplay);

  await postTweet(null, tweetMessage, imageBuffer);
  logSuccess("Test mint completed!");
}

// Generate a preview seed for a fold (deterministic based on fold parameters)
function generatePreviewSeed(foldId, strategyBlock, startTime) {
  // Create a deterministic seed from fold parameters
  // This mimics how the contract generates seeds but uses fold-level data
  const data = `fold-${foldId}-${strategyBlock}-${startTime}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  // Convert to hex string
  const hex = Math.abs(hash).toString(16).padStart(16, "0");
  return `0x${hex}${hex}${hex}${hex}`;
}

// Process a single FoldCreated event
async function processEvent(
  log,
  processedFolds,
  twitterClient,
  contractAddress,
  client,
  abi
) {
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

    logInfo(
      `Detected FoldCreated event: foldId=${foldId}, startTime=${startTime}, endTime=${endTime}`
    );

    // Fetch burn data (if available)
    const burnData = await fetchBurnData(client, contractAddress, abi);

    // Format and post tweet (no image for window open)
    const tweetMessage = formatTweet(
      Number(foldId),
      Number(startTime),
      Number(endTime),
      burnData
    );

    logInfo("Posting tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Tweet posted successfully! Tweet ID: ${tweetId}`);
      processedFolds.add(Number(foldId));
    } else {
      logError("Failed to post tweet");
    }
  } catch (error) {
    logError(`Error processing event: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Format mint tweet message
function formatMintTweet(tokenId, minterDisplay) {
  return `LESS #${tokenId} minted by ${minterDisplay}


${MINT_URL}/${tokenId}`;
}

// Resolve ENS name for an address (mainnet only)
async function resolveEns(address) {
  try {
    // Only try ENS on mainnet
    if (network !== "mainnet") {
      return null;
    }
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.MAINNET_RPC_URL),
    });
    const ensName = await mainnetClient.getEnsName({ address });
    return ensName;
  } catch (error) {
    logWarn(`ENS lookup failed: ${error.message}`);
    return null;
  }
}

// Process a Minted event
async function processMintEvent(log, processedMints, twitterClient) {
  try {
    const tokenId = log.args.tokenId;
    const foldId = log.args.foldId;
    const minter = log.args.minter;
    const seed = log.args.seed;

    // Skip if already processed
    if (processedMints.has(Number(tokenId))) {
      logInfo(`Skipping already processed mint #${tokenId}`);
      return;
    }

    logInfo(
      `Detected Minted event: tokenId=${tokenId}, foldId=${foldId}, minter=${minter}, seed=${seed}`
    );

    // Resolve ENS or use truncated address
    const ensName = await resolveEns(minter);
    const minterDisplay = ensName || truncateAddress(minter);

    // Fetch image using the actual seed from the event
    const imageBuffer = await fetchImage(seed);

    // Format and post tweet with image
    const tweetMessage = formatMintTweet(Number(tokenId), minterDisplay);

    logInfo("Posting mint tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage, imageBuffer);

    if (tweetId) {
      logSuccess(`Mint tweet posted! Tweet ID: ${tweetId}`);
      processedMints.add(Number(tokenId));
    } else {
      logError("Failed to post mint tweet");
    }
  } catch (error) {
    logError(`Error processing mint event: ${error.message}`);
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

  // Handle test mint mode
  if (testMintMode) {
    await runTestMintMode();
    return;
  }

  logInfo("Starting Twitter bot for mint window announcements...");
  if (dryRun) {
    logInfo(
      "Running in DRY-RUN mode - tweets will be previewed but not posted"
    );
  }

  // Initialize configuration
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    logError("MAINNET_RPC_URL environment variable not set");
    process.exit(1);
  }

  const contractAddress = getContractAddress();
  logInfo(`Contract address: ${contractAddress}`);

  const abi = loadContractABI();
  logInfo("Contract ABI loaded");

  const twitterClient = initTwitterClient();
  if (twitterClient) {
    logInfo("Twitter client initialized");
  } else {
    logInfo("Twitter client skipped (dry-run mode)");
  }

  // Load persisted state
  const state = loadState();
  const processedFolds = state.processedFolds;
  const processedMints = state.processedMints;
  let lastProcessedBlock = rescanMode ? 0n : state.lastBlock; // Reset if --rescan flag

  if (rescanMode) {
    logInfo("Rescan mode: ignoring saved lastBlock, will scan from lookback");
  }
  if (processedFolds.size > 0) {
    logInfo(
      `Loaded ${processedFolds.size} previously processed folds from state`
    );
  }
  if (processedMints.size > 0) {
    logInfo(
      `Loaded ${processedMints.size} previously processed mints from state`
    );
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
        chain: getChain(),
        transport: http(rpcUrl),
        pollingInterval,
      });

      logInfo(`Polling interval: ${pollingInterval / 1000} seconds`);
      logSuccess(`Connected to Ethereum ${network}`);

      // Get current block
      const currentBlock = await client.getBlockNumber();
      logInfo(`Current block: ${currentBlock}`);

      // Scan for missed events since last processed block
      const lookbackBlocks = 1000n; // ~3.5 hours of blocks
      const fromBlock =
        lastProcessedBlock > 0n
          ? lastProcessedBlock + 1n
          : currentBlock - lookbackBlocks;

      if (fromBlock < currentBlock) {
        logInfo(
          `Scanning for missed events from block ${fromBlock} to ${currentBlock}...`
        );

        // Scan for missed FoldCreated events
        const missedFoldLogs = await client.getLogs({
          address: contractAddress,
          event: parseAbiItem(
            "event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, bytes32 blockHash)"
          ),
          fromBlock,
          toBlock: currentBlock,
        });

        if (missedFoldLogs.length > 0) {
          logInfo(`Found ${missedFoldLogs.length} FoldCreated events`);
          for (const log of missedFoldLogs) {
            await processEvent(
              log,
              processedFolds,
              twitterClient,
              contractAddress,
              client,
              abi
            );
          }
        }

        // Scan for missed Minted events
        const missedMintLogs = await client.getLogs({
          address: contractAddress,
          event: parseAbiItem(
            "event Minted(uint256 indexed tokenId, uint256 indexed foldId, address indexed minter, bytes32 seed)"
          ),
          fromBlock,
          toBlock: currentBlock,
        });

        if (missedMintLogs.length > 0) {
          logInfo(`Found ${missedMintLogs.length} Minted events`);
          for (const log of missedMintLogs) {
            await processMintEvent(log, processedMints, twitterClient);
          }
        }

        if (missedFoldLogs.length === 0 && missedMintLogs.length === 0) {
          logInfo("No missed events found");
        }
      }

      // Update last processed block
      lastProcessedBlock = currentBlock;
      saveState(processedFolds, processedMints, lastProcessedBlock);

      // Reset retry count on successful connection
      retryCount = 0;

      // Watch for new FoldCreated events
      const unwatchFolds = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, bytes32 blockHash)"
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            await processEvent(
              log,
              processedFolds,
              twitterClient,
              contractAddress,
              client,
              abi
            );
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              saveState(processedFolds, processedMints, lastProcessedBlock);
            }
          }
        },
        onError: (error) => {
          logError(`FoldCreated watcher error: ${error.message}`);
        },
      });

      // Watch for new Minted events
      const unwatchMints = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event Minted(uint256 indexed tokenId, uint256 indexed foldId, address indexed minter, bytes32 seed)"
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            await processMintEvent(log, processedMints, twitterClient);
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              saveState(processedFolds, processedMints, lastProcessedBlock);
            }
          }
        },
        onError: (error) => {
          logError(`Minted watcher error: ${error.message}`);
        },
      });

      // Combined unwatch function
      unwatch = () => {
        unwatchFolds();
        unwatchMints();
      };

      logSuccess(
        "Bot is running and monitoring for FoldCreated and Minted events..."
      );
      logInfo("Press Ctrl+C to stop");

      // Graceful shutdown handler
      const shutdown = () => {
        logInfo("Shutting down...");
        if (unwatch) unwatch();
        saveState(processedFolds, processedMints, lastProcessedBlock);
        logSuccess("State saved. Bot stopped.");
        process.exit(0);
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);

      // Keep alive - this will block until an error occurs
      await new Promise((_, reject) => {
        // Periodic health check every 5 minutes
        const healthCheck = setInterval(async () => {
          try {
            const block = await client.getBlockNumber();
            logInfo(
              `Heartbeat: block ${block}, processed ${processedFolds.size} folds, ${processedMints.size} mints`
            );
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
      logWarn(
        `Reconnecting in ${
          delay / 1000
        } seconds (attempt ${retryCount}/${maxRetries})...`
      );

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
