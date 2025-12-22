#!/usr/bin/env node

/**
 * Twitter Bot for Mint Window Announcements
 *
 * Monitors the Less contract for WindowCreated events and tweets announcements
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
const testReminderMode = args.includes("--test-reminder");
const testWindowReadyMode = args.includes("--test-window-ready");
const verifyMode = args.includes("--verify");
const postTestTweet = args.includes("--post-test");
const rescanMode = args.includes("--rescan"); // Force rescan from lookback, ignoring saved lastBlock
const skipCatchup = args.includes("--skip-catchup"); // Skip catching up on missed events, just watch for new ones
const postMintTokenId = args
  .find((arg) => arg.startsWith("--post-mint="))
  ?.split("=")[1]; // Post a tweet for a specific token ID
const postWindowId = args
  .find((arg) => arg.startsWith("--post-window="))
  ?.split("=")[1]; // Post a window opened tweet for a specific window ID
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

// State persistence - tracks processed windows, mints, and last block
// Clears state automatically if contract address changes
// Supports RESET_PROCESSED_MINTS and RESET_PROCESSED_WINDOWS env vars to initialize state
function loadState(contractAddress) {
  // Check for reset env vars - these allow resetting state on deploy
  const resetMints = process.env.RESET_PROCESSED_MINTS
    ? parseInt(process.env.RESET_PROCESSED_MINTS, 10)
    : null;
  const resetWindows = process.env.RESET_PROCESSED_WINDOWS
    ? parseInt(process.env.RESET_PROCESSED_WINDOWS, 10)
    : null;

  if (resetMints !== null || resetWindows !== null) {
    logInfo(
      `Resetting state from env vars: mints=${resetMints}, windows=${resetWindows}`
    );
    const processedMints = resetMints
      ? new Set(Array.from({ length: resetMints }, (_, i) => i + 1))
      : new Set();
    const processedWindows = resetWindows
      ? new Set(Array.from({ length: resetWindows }, (_, i) => i + 1))
      : new Set();
    return {
      processedWindows,
      processedMints,
      fifteenMinReminders: new Set(),
      windowReadyAlerted: false,
      lastBlock: 0n,
    };
  }

  try {
    if (existsSync(stateFile)) {
      const data = JSON.parse(readFileSync(stateFile, "utf-8"));

      // Check if contract address changed - if so, start fresh
      if (data.contractAddress && data.contractAddress !== contractAddress) {
        logWarn(
          `Contract address changed from ${data.contractAddress} to ${contractAddress}`
        );
        logInfo("Clearing state for new contract");
        return {
          processedWindows: new Set(),
          processedMints: new Set(),
          fifteenMinReminders: new Set(),
          windowReadyAlerted: false,
          lastBlock: 0n,
        };
      }

      return {
        processedWindows: new Set(
          data.processedWindows || data.processedFolds || []
        ),
        processedMints: new Set(data.processedMints || []),
        fifteenMinReminders: new Set(data.fifteenMinReminders || []),
        windowReadyAlerted: data.windowReadyAlerted || false,
        lastBlock: BigInt(data.lastBlock || 0),
      };
    }
  } catch (error) {
    logWarn(`Failed to load state file: ${error.message}`);
  }
  return {
    processedWindows: new Set(),
    processedMints: new Set(),
    fifteenMinReminders: new Set(),
    windowReadyAlerted: false,
    lastBlock: 0n,
  };
}

function saveState(
  processedWindows,
  processedMints,
  fifteenMinReminders,
  windowReadyAlerted,
  lastBlock,
  contractAddress
) {
  try {
    const data = {
      contractAddress,
      processedWindows: Array.from(processedWindows),
      processedMints: Array.from(processedMints),
      fifteenMinReminders: Array.from(fifteenMinReminders),
      windowReadyAlerted,
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

// Fetch image from image API using token ID
async function fetchImage(tokenId) {
  const imageApiUrl =
    process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";
  const url = `${imageApiUrl}/images/${tokenId}`;
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

const BASE_URL = "https://less.ripe.wtf";
const LESS_TOKEN_ADDRESS =
  process.env.LESS_TOKEN_ADDRESS ||
  "0x9C2CA573009F181EAc634C4d6e44A0977C24f335";
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

// Format tweet message for WindowCreated
function formatTweet(windowId, startTime, endTime, burnData = null) {
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = Math.max(0, Number(endTime) - now);
  const minutesLeft = formatMinutesRemaining(timeRemaining);

  // If we have full burn data (amount + supply), include both lines
  if (burnData && burnData.amountBurned && burnData.supplyRemaining) {
    return `new LESS window opened

${burnData.amountBurned} $LESS bought and burned
${burnData.supplyRemaining}% supply remaining

LESS is open to mint for the next ${minutesLeft} minutes for window ${windowId}

${BASE_URL}/mint`;
  }

  // If we have only supply data (no burn amount), show just supply
  if (burnData && burnData.supplyRemaining) {
    return `new LESS window opened


${burnData.supplyRemaining}% total supply remaining

LESS is open to mint for the next ${minutesLeft} minutes for window ${windowId}


${BASE_URL}/mint`;
  }

  // Simple format without any burn/supply data
  return `new LESS window opened


 LESS is open to mint for the next ${minutesLeft} minutes for window ${windowId}


${BASE_URL}/mint`;
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
  if (
    dryRun ||
    testMode ||
    testMintMode ||
    testReminderMode ||
    testWindowReadyMode
  ) {
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
    // Handle rate limit (429)
    if (error.code === 429 || error.message?.includes("429")) {
      const resetTime = error.rateLimit?.reset;
      const waitSeconds = resetTime
        ? Math.max(resetTime - Math.floor(Date.now() / 1000), 60)
        : 900; // Default 15 min
      logWarn(
        `Rate limited by Twitter. Waiting ${Math.ceil(
          waitSeconds / 60
        )} minutes before retry...`
      );
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      // Retry once after waiting (without image to simplify)
      const tweet = await twitterClient.v2.tweet(message);
      return tweet.data.id;
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

// Run test mode - simulate a WindowCreated event
async function runTestMode() {
  logInfo("Running in TEST MODE - simulating a WindowCreated event");
  console.log();

  // Simulate event data
  const now = Math.floor(Date.now() / 1000);
  const testWindowId = 42;
  const testStartTime = now;
  const testEndTime = now + 5400; // 90 minutes from now

  logInfo(`Simulated event: Window #${testWindowId}`);
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
    testWindowId,
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

  logInfo(`Simulated event: Minted token #${testTokenId}`);
  logInfo(`  Minter: ${testMinter}`);
  console.log();

  // Fetch image using token ID (uses /images/:tokenId which fetches windowId for correct foldCount)
  const imageBuffer = await fetchImage(testTokenId);

  // Resolve ENS or use truncated address
  const ensName = await resolveEns(testMinter);
  const minterDisplay = ensName || truncateAddress(testMinter);

  // Fetch remaining time in window (if contract is configured)
  let minutesRemaining = null;
  try {
    const rpcUrl = getRpcUrl();
    const contractAddress = getContractAddress();
    const client = createPublicClient({
      chain: getChain(),
      transport: http(rpcUrl),
    });
    const timeUntilClose = await client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "timeUntilWindowCloses",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "timeUntilWindowCloses",
    });
    minutesRemaining = Math.ceil(Number(timeUntilClose) / 60);
    logInfo(`Time remaining in window: ${minutesRemaining} minutes`);
  } catch (e) {
    logWarn(`Could not fetch time remaining: ${e.message}`);
  }

  // Format and display the tweet with image
  const tweetMessage = formatMintTweet(
    testTokenId,
    minterDisplay,
    minutesRemaining
  );

  await postTweet(null, tweetMessage, imageBuffer);
  logSuccess("Test mint completed!");
}

// Post a mint tweet for a specific token ID (fetches real on-chain data)
async function runPostMintMode(tokenId) {
  logInfo(`Posting mint tweet for token #${tokenId}...`);
  console.log();

  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const client = createPublicClient({
    chain: getChain(),
    transport: http(rpcUrl),
  });

  // Fetch token data from contract
  const abi = loadContractABI();

  // Get the owner of the token (minter)
  let minter;
  try {
    minter = await client.readContract({
      address: contractAddress,
      abi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    logInfo(`Token owner: ${minter}`);
  } catch (error) {
    logError(`Failed to get token owner: ${error.message}`);
    logError("Token may not exist or contract call failed");
    process.exit(1);
  }

  // Resolve ENS or use truncated address
  const ensName = await resolveEns(minter);
  const minterDisplay = ensName || truncateAddress(minter);
  logInfo(`Minter display: ${minterDisplay}`);

  // Fetch remaining time in window
  let minutesRemaining = null;
  try {
    const timeUntilClose = await client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "timeUntilWindowCloses",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "timeUntilWindowCloses",
    });
    minutesRemaining = Math.floor(Number(timeUntilClose) / 60);
    logInfo(`Time remaining in window: ${minutesRemaining} minutes`);
  } catch (e) {
    logWarn(`Could not fetch time remaining: ${e.message}`);
  }

  // Get current window ID (windowCount is the current/most recent window)
  let windowId = null;
  try {
    const windowCount = await client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "windowCount",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "windowCount",
    });
    windowId = Number(windowCount);
    logInfo(`Window ID: ${windowId}`);
  } catch (e) {
    logWarn(`Could not fetch window ID: ${e.message}`);
  }

  // Fetch image from image API
  const imageBuffer = await fetchImage(tokenId);

  if (!imageBuffer) {
    logError("Failed to fetch image - cannot post tweet without image");
    process.exit(1);
  }
  logSuccess(`Image fetched: ${imageBuffer.length} bytes`);

  // Format tweet
  const tweetMessage = formatMintTweet(
    Number(tokenId),
    minterDisplay,
    minutesRemaining,
    windowId
  );

  // Initialize Twitter client and post
  const twitterClient = initTwitterClient();
  if (!twitterClient) {
    logError("Failed to initialize Twitter client");
    process.exit(1);
  }

  logInfo("Posting tweet...");
  const tweetId = await postTweet(twitterClient, tweetMessage, imageBuffer);

  if (tweetId) {
    logSuccess(`Tweet posted! ID: ${tweetId}`);
    logInfo(`View at: https://x.com/i/status/${tweetId}`);
  } else {
    logError("Failed to post tweet");
    process.exit(1);
  }
}

// Run post window mode - post a window opened tweet for a specific window ID
async function runPostWindowMode(windowId) {
  logInfo(`Posting window opened tweet for window #${windowId}...`);
  console.log();

  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const client = createPublicClient({
    chain: getChain(),
    transport: http(rpcUrl),
  });

  // Fetch time until window closes
  let timeRemaining;
  try {
    const timeUntilClose = await client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "timeUntilWindowCloses",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "timeUntilWindowCloses",
    });
    timeRemaining = Number(timeUntilClose);
  } catch (error) {
    logError(`Failed to fetch window time: ${error.message}`);
    process.exit(1);
  }

  if (timeRemaining === 0) {
    logError("No window is currently open");
    process.exit(1);
  }

  // Calculate start/end times
  const now = Math.floor(Date.now() / 1000);
  const endTime = now + timeRemaining;
  const startTime = now; // Approximate - we don't have the exact start time
  const minutesLeft = Math.floor(timeRemaining / 60);
  logInfo(`Window ${windowId}: ${minutesLeft} minutes remaining`);

  // Fetch burn data
  let burnData = null;
  try {
    const abi = loadContractABI();
    burnData = await fetchBurnData(client, contractAddress, abi);
  } catch (error) {
    logWarn(`Could not fetch burn data: ${error.message}`);
  }

  // Format tweet
  const tweetMessage = formatTweet(
    Number(windowId),
    Number(startTime),
    Number(endTime),
    burnData
  );

  // Display preview
  displayTweetPreview(tweetMessage);

  // Initialize Twitter client and post
  const twitterClient = initTwitterClient();
  if (!twitterClient && !dryRun) {
    logError("Failed to initialize Twitter client");
    process.exit(1);
  }

  if (dryRun) {
    logInfo("[DRY-RUN] Would post tweet (not actually sent)");
    return;
  }

  logInfo("Posting tweet...");
  const tweetId = await postTweet(twitterClient, tweetMessage);

  if (tweetId) {
    logSuccess(`Tweet posted! ID: ${tweetId}`);
    logInfo(`View at: https://x.com/i/status/${tweetId}`);
  } else {
    logError("Failed to post tweet");
    process.exit(1);
  }
}

// Run test reminder mode - simulate a 15-minute reminder
async function runTestReminderMode() {
  logInfo("Running in TEST REMINDER MODE - simulating a 15-minute reminder");
  console.log();

  // Simulate event data
  const testWindowId = 42;
  const testMinutesRemaining = 15;

  logInfo(
    `Simulated: Window #${testWindowId} with ${testMinutesRemaining} minutes remaining`
  );
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
  const tweetMessage = formatReminderTweet(
    testWindowId,
    testMinutesRemaining,
    burnData
  );

  await postTweet(null, tweetMessage);
  logSuccess("Test reminder completed!");
}

// Run test window ready mode - simulate a window ready tweet
async function runTestWindowReadyMode() {
  logInfo(
    "Running in TEST WINDOW READY MODE - simulating a window ready tweet"
  );
  console.log();

  // Format and display the tweet
  const tweetMessage = formatWindowReadyTweet();

  await postTweet(null, tweetMessage);
  logSuccess("Test window ready completed!");
}

// Generate a preview seed for a window (deterministic based on window parameters)
function generatePreviewSeed(windowId, strategyBlock, startTime) {
  // Create a deterministic seed from window parameters
  // This mimics how the contract generates seeds but uses window-level data
  const data = `window-${windowId}-${strategyBlock}-${startTime}`;
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

// Process a single WindowCreated event
async function processEvent(
  log,
  processedWindows,
  twitterClient,
  contractAddress,
  client,
  abi
) {
  try {
    const windowId = log.args.windowId;
    const startTime = log.args.startTime;
    const endTime = log.args.endTime;
    const strategyBlock = log.args.strategyBlock;

    // Skip if already processed
    if (processedWindows.has(Number(windowId))) {
      logInfo(`Skipping already processed window #${windowId}`);
      return;
    }

    logInfo(
      `Detected WindowCreated event: windowId=${windowId}, startTime=${startTime}, endTime=${endTime}`
    );

    // Fetch burn data (if available)
    const burnData = await fetchBurnData(client, contractAddress, abi);

    // Format and post tweet (no image for window open)
    const tweetMessage = formatTweet(
      Number(windowId),
      Number(startTime),
      Number(endTime),
      burnData
    );

    logInfo("Posting tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Tweet posted successfully! Tweet ID: ${tweetId}`);
      processedWindows.add(Number(windowId));
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
function formatMintTweet(
  tokenId,
  minterDisplay,
  minutesRemaining = null,
  windowId = null
) {
  const timeText =
    minutesRemaining !== null && minutesRemaining > 0
      ? `\n${minutesRemaining} minute${
          minutesRemaining !== 1 ? "s" : ""
        } remain in mint window ${windowId}`
      : "";
  return `LESS ${tokenId} minted by ${minterDisplay}${timeText}

${BASE_URL}/${tokenId}`;
}

// Format 15-minute reminder tweet
function formatReminderTweet(windowId, minutesRemaining, burnData = null) {
  // If we have full burn data (amount + supply), include both lines
  if (burnData && burnData.amountBurned && burnData.supplyRemaining) {
    return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}
${burnData.amountBurned} $LESS burned
${burnData.supplyRemaining}% supply remaining

${BASE_URL}/mint`;
  }

  // If we have only supply data (no burn amount), show just supply
  if (burnData && burnData.supplyRemaining) {
    return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}
${burnData.supplyRemaining}% supply remaining

${BASE_URL}/mint`;
  }

  // Simple format without any burn/supply data
  return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}

${BASE_URL}/mint`;
}

// Format tweet for when a new window is ready to be opened
function formatWindowReadyTweet() {
  return `a new LESS window is ready to open

minting will trigger a 0.25 ETH buy + burn of $LESS

${BASE_URL}/mint`;
}

// Resolve ENS name for an address (always uses mainnet since ENS lives there)
async function resolveEns(address) {
  try {
    const mainnetRpc = process.env.MAINNET_RPC_URL;
    if (!mainnetRpc) {
      return null;
    }
    const mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(mainnetRpc),
    });
    const ensName = await mainnetClient.getEnsName({ address });
    if (ensName) {
      logInfo(`Resolved ENS: ${address} -> ${ensName}`);
    }
    return ensName;
  } catch (error) {
    logWarn(`ENS lookup failed: ${error.message}`);
    return null;
  }
}

// Process a Minted event
async function processMintEvent(
  log,
  processedMints,
  twitterClient,
  client,
  contractAddress
) {
  try {
    const tokenId = log.args.tokenId;
    const windowId = log.args.windowId;
    const minter = log.args.minter;
    const seed = log.args.seed;

    // Skip if already processed
    if (processedMints.has(Number(tokenId))) {
      logInfo(`Skipping already processed mint #${tokenId}`);
      return;
    }

    logInfo(
      `Detected Minted event: tokenId=${tokenId}, windowId=${windowId}, minter=${minter}, seed=${seed}`
    );

    // Resolve ENS or use truncated address
    const ensName = await resolveEns(minter);
    const minterDisplay = ensName || truncateAddress(minter);

    // Fetch remaining time in window
    let minutesRemaining = null;
    try {
      const timeUntilClose = await client.readContract({
        address: contractAddress,
        abi: [
          {
            inputs: [],
            name: "timeUntilWindowCloses",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "timeUntilWindowCloses",
      });
      minutesRemaining = Math.ceil(Number(timeUntilClose) / 60);
      logInfo(`Time remaining in window: ${minutesRemaining} minutes`);
    } catch (e) {
      logWarn(`Could not fetch time remaining: ${e.message}`);
    }

    // Fetch image using the token ID (uses /images/:tokenId which fetches windowId for correct foldCount)
    const imageBuffer = await fetchImage(tokenId);

    // Skip posting if image failed - will retry on next poll
    if (!imageBuffer) {
      logWarn(
        `Skipping mint tweet for #${tokenId} - image not available, will retry later`
      );
      return;
    }

    // Format and post tweet with image
    const tweetMessage = formatMintTweet(
      Number(tokenId),
      minterDisplay,
      minutesRemaining,
      windowId
    );

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

// Process 15-minute reminder check
async function processReminderCheck(
  fifteenMinReminders,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    // Get current window info
    const currentWindowAbi = [
      {
        inputs: [],
        name: "getCurrentWindow",
        outputs: [
          { name: "windowId", type: "uint256" },
          { name: "startTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "strategyBlock", type: "uint64" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ];

    const [windowId, startTime, endTime, strategyBlock] =
      await client.readContract({
        address: contractAddress,
        abi: currentWindowAbi,
        functionName: "getCurrentWindow",
      });

    // Check if window is active (endTime > now)
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Number(endTime) - now;

    // Skip if window is not active
    if (timeRemaining <= 0) {
      return null;
    }

    // Check if we're in the 15-minute reminder window (10-16 minutes remaining)
    const minutesRemaining = Math.ceil(timeRemaining / 60);
    const inReminderWindow = timeRemaining >= 600 && timeRemaining <= 960; // 10-16 minutes

    if (!inReminderWindow) {
      return null;
    }

    // Skip if already reminded for this window
    if (fifteenMinReminders.has(Number(windowId))) {
      return null;
    }

    logInfo(
      `15-minute reminder triggered for window #${windowId} (${minutesRemaining} minutes remaining)`
    );

    // Fetch burn data
    const burnData = await fetchBurnData(client, contractAddress, abi);

    // Format and post tweet
    const tweetMessage = formatReminderTweet(
      Number(windowId),
      minutesRemaining,
      burnData
    );

    logInfo("Posting 15-minute reminder tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Reminder tweet posted! Tweet ID: ${tweetId}`);
      fifteenMinReminders.add(Number(windowId));
      return Number(windowId);
    } else {
      logError("Failed to post reminder tweet");
      return null;
    }
  } catch (error) {
    // Silently handle "no active window" errors
    if (
      error.message?.includes("revert") ||
      error.message?.includes("Window")
    ) {
      return null;
    }
    logError(`Error checking reminder: ${error.message}`);
    return null;
  }
}

// Process window ready check - posts when canCreateWindow() is true
async function processWindowReadyCheck(
  windowReadyAlerted,
  twitterClient,
  client,
  contractAddress
) {
  try {
    // Check if canCreateWindow returns true
    const canCreateWindowAbi = [
      {
        inputs: [],
        name: "canCreateWindow",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const canCreate = await client.readContract({
      address: contractAddress,
      abi: canCreateWindowAbi,
      functionName: "canCreateWindow",
    });

    // If window can't be created, reset the alert state
    if (!canCreate) {
      return { alerted: false, shouldReset: true };
    }

    // If we've already alerted for this ready state, skip
    if (windowReadyAlerted) {
      return { alerted: true, shouldReset: false };
    }

    logInfo("Window ready to open! Conditions met for new mint window.");

    // Format and post tweet
    const tweetMessage = formatWindowReadyTweet();

    logInfo("Posting window ready tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Window ready tweet posted! Tweet ID: ${tweetId}`);
      return { alerted: true, shouldReset: false };
    } else {
      logError("Failed to post window ready tweet");
      return { alerted: false, shouldReset: false };
    }
  } catch (error) {
    // Silently handle contract errors
    if (
      error.message?.includes("revert") ||
      error.message?.includes("execution reverted")
    ) {
      return { alerted: windowReadyAlerted, shouldReset: false };
    }
    logError(`Error checking window ready: ${error.message}`);
    return { alerted: windowReadyAlerted, shouldReset: false };
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

  // Handle post mint mode (post tweet for specific token ID)
  if (postMintTokenId) {
    await runPostMintMode(postMintTokenId);
    return;
  }

  // Handle post window mode (post window opened tweet for specific window ID)
  if (postWindowId) {
    await runPostWindowMode(postWindowId);
    return;
  }

  // Handle test reminder mode
  if (testReminderMode) {
    await runTestReminderMode();
    return;
  }

  // Handle test window ready mode
  if (testWindowReadyMode) {
    await runTestWindowReadyMode();
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

  // Load persisted state (auto-clears if contract address changed)
  const state = loadState(contractAddress);
  const processedWindows = state.processedWindows;
  const processedMints = state.processedMints;
  const fifteenMinReminders = state.fifteenMinReminders;
  let windowReadyAlerted = state.windowReadyAlerted;
  let lastProcessedBlock = rescanMode ? 0n : state.lastBlock; // Reset if --rescan flag

  if (rescanMode) {
    logInfo("Rescan mode: ignoring saved lastBlock, will scan from lookback");
  }
  if (processedWindows.size > 0) {
    logInfo(
      `Loaded ${processedWindows.size} previously processed windows from state`
    );
  }
  if (processedMints.size > 0) {
    logInfo(
      `Loaded ${processedMints.size} previously processed mints from state`
    );
  }
  if (fifteenMinReminders.size > 0) {
    logInfo(
      `Loaded ${fifteenMinReminders.size} previously sent 15-min reminders from state`
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

      if (skipCatchup) {
        logInfo(
          "Skipping catchup (--skip-catchup flag set), watching for new events only..."
        );
      } else if (fromBlock < currentBlock) {
        logInfo(
          `Scanning for missed events from block ${fromBlock} to ${currentBlock}...`
        );

        // Scan for missed WindowCreated events
        const missedWindowLogs = await client.getLogs({
          address: contractAddress,
          event: parseAbiItem(
            "event WindowCreated(uint256 indexed windowId, uint64 startTime, uint64 endTime)"
          ),
          fromBlock,
          toBlock: currentBlock,
        });

        if (missedWindowLogs.length > 0) {
          logInfo(`Found ${missedWindowLogs.length} WindowCreated events`);
          for (const log of missedWindowLogs) {
            await processEvent(
              log,
              processedWindows,
              twitterClient,
              contractAddress,
              client,
              abi
            );
            // Delay between tweets to avoid rate limiting
            if (missedWindowLogs.length > 1) {
              await new Promise((r) => setTimeout(r, 5000));
            }
          }
        }

        // Scan for missed Minted events
        const missedMintLogs = await client.getLogs({
          address: contractAddress,
          event: parseAbiItem(
            "event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)"
          ),
          fromBlock,
          toBlock: currentBlock,
        });

        if (missedMintLogs.length > 0) {
          logInfo(`Found ${missedMintLogs.length} Minted events`);
          for (const log of missedMintLogs) {
            await processMintEvent(
              log,
              processedMints,
              twitterClient,
              client,
              contractAddress
            );
            // Delay between tweets to avoid rate limiting
            if (missedMintLogs.length > 1) {
              await new Promise((r) => setTimeout(r, 5000));
            }
          }
        }

        if (missedWindowLogs.length === 0 && missedMintLogs.length === 0) {
          logInfo("No missed events found");
        }
      }

      // Update last processed block
      lastProcessedBlock = currentBlock;
      saveState(
        processedWindows,
        processedMints,
        fifteenMinReminders,
        windowReadyAlerted,
        lastProcessedBlock,
        contractAddress
      );

      // Reset retry count on successful connection
      retryCount = 0;

      // Watch for new WindowCreated events
      const unwatchWindows = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event WindowCreated(uint256 indexed windowId, uint64 startTime, uint64 endTime)"
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            await processEvent(
              log,
              processedWindows,
              twitterClient,
              contractAddress,
              client,
              abi
            );
            // Reset windowReadyAlerted since a new window was created
            windowReadyAlerted = false;
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              saveState(
                processedWindows,
                processedMints,
                fifteenMinReminders,
                windowReadyAlerted,
                lastProcessedBlock,
                contractAddress
              );
            }
          }
        },
        onError: (error) => {
          logError(`WindowCreated watcher error: ${error.message}`);
        },
      });

      // Watch for new Minted events
      const unwatchMints = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)"
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            await processMintEvent(
              log,
              processedMints,
              twitterClient,
              client,
              contractAddress
            );
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              saveState(
                processedWindows,
                processedMints,
                fifteenMinReminders,
                windowReadyAlerted,
                lastProcessedBlock,
                contractAddress
              );
            }
          }
        },
        onError: (error) => {
          logError(`Minted watcher error: ${error.message}`);
        },
      });

      // Combined unwatch function
      unwatch = () => {
        unwatchWindows();
        unwatchMints();
      };

      logSuccess(
        "Bot is running and monitoring for WindowCreated and Minted events..."
      );
      logInfo("Press Ctrl+C to stop");

      // 15-minute reminder checker (every 30 seconds)
      const reminderInterval = setInterval(async () => {
        try {
          const reminded = await processReminderCheck(
            fifteenMinReminders,
            twitterClient,
            client,
            contractAddress,
            abi
          );
          if (reminded) {
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              windowReadyAlerted,
              lastProcessedBlock,
              contractAddress
            );
          }
        } catch (error) {
          logError(`Reminder check error: ${error.message}`);
        }
      }, 30000);

      // Window ready checker (every 60 seconds) - posts when canCreateWindow() is true
      const windowReadyInterval = setInterval(async () => {
        try {
          const result = await processWindowReadyCheck(
            windowReadyAlerted,
            twitterClient,
            client,
            contractAddress
          );
          // Update state if changed
          if (result.alerted !== windowReadyAlerted || result.shouldReset) {
            windowReadyAlerted = result.alerted;
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              windowReadyAlerted,
              lastProcessedBlock,
              contractAddress
            );
          }
        } catch (error) {
          logError(`Window ready check error: ${error.message}`);
        }
      }, 60000);

      // Graceful shutdown handler
      const shutdown = () => {
        logInfo("Shutting down...");
        if (unwatch) unwatch();
        clearInterval(reminderInterval);
        clearInterval(windowReadyInterval);
        saveState(
          processedWindows,
          processedMints,
          fifteenMinReminders,
          windowReadyAlerted,
          lastProcessedBlock,
          contractAddress
        );
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
              `Heartbeat: block ${block}, processed ${processedWindows.size} windows, ${processedMints.size} mints, ${fifteenMinReminders.size} reminders`
            );
          } catch (error) {
            clearInterval(healthCheck);
            clearInterval(reminderInterval);
            clearInterval(windowReadyInterval);
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
