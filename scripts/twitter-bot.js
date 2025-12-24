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
import sharp from "sharp";

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
const testBalanceProgressMode = args.includes("--test-balance-progress");
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
const postBalanceMode = args.includes("--post-balance"); // Post a balance status tweet immediately
const mockBalance = args
  .find((arg) => arg.startsWith("--mock-balance="))
  ?.split("=")[1]; // Mock balance in ETH for testing (e.g., --mock-balance=0.15)
const mockThreshold = args
  .find((arg) => arg.startsWith("--mock-threshold="))
  ?.split("=")[1]; // Mock threshold in ETH for testing (e.g., --mock-threshold=0.25)
const mockWindowId = args
  .find((arg) => arg.startsWith("--mock-window-id="))
  ?.split("=")[1]; // Mock window ID for testing (e.g., --mock-window-id=5)
const mockEthPrice = args
  .find((arg) => arg.startsWith("--mock-eth-price="))
  ?.split("=")[1]; // Mock ETH price in USD for testing
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
      processedEndedWindows: new Set(),
      windowReadyAlerted: false,
      lastBalanceProgressPost: null,
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
          processedEndedWindows: new Set(),
          windowReadyAlerted: false,
          lastBalanceProgressPost: null,
          lastBlock: 0n,
        };
      }

      return {
        processedWindows: new Set(
          data.processedWindows || data.processedFolds || []
        ),
        processedMints: new Set(data.processedMints || []),
        fifteenMinReminders: new Set(data.fifteenMinReminders || []),
        processedEndedWindows: new Set(data.processedEndedWindows || []),
        windowReadyAlerted: data.windowReadyAlerted || false,
        lastBalanceProgressPost: data.lastBalanceProgressPost || null,
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
    processedEndedWindows: new Set(),
    windowReadyAlerted: false,
    lastBalanceProgressPost: null,
    lastBlock: 0n,
  };
}

function saveState(
  processedWindows,
  processedMints,
  fifteenMinReminders,
  processedEndedWindows,
  windowReadyAlerted,
  lastBalanceProgressPost,
  lastBlock,
  contractAddress
) {
  try {
    const data = {
      contractAddress,
      processedWindows: Array.from(processedWindows),
      processedMints: Array.from(processedMints),
      fifteenMinReminders: Array.from(fifteenMinReminders),
      processedEndedWindows: Array.from(processedEndedWindows),
      windowReadyAlerted,
      lastBalanceProgressPost,
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

// Fetch ETH price from CoinGecko
async function fetchEthPrice() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.ethereum?.usd || null;
  } catch (error) {
    logWarn(`Failed to fetch ETH price: ${error.message}`);
    return null;
  }
}

// Format URL to prevent Twitter from showing preview card
// Removes the protocol so Twitter doesn't auto-link and show a preview card
// Users can still copy/paste the URL and it will work
function formatUrlForTweet(url) {
  // Remove protocol (https:// or http://) - Twitter won't create a card for URLs without protocol
  return url.replace(/^https?:\/\//, "");
}

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

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
  }

  // If we have only supply data (no burn amount), show just supply
  if (burnData && burnData.supplyRemaining) {
    return `new LESS window opened


${burnData.supplyRemaining}% total supply remaining

LESS is open to mint for the next ${minutesLeft} minutes for window ${windowId}


${formatUrlForTweet(`${BASE_URL}/mint`)}`;
  }

  // Simple format without any burn/supply data
  return `new LESS window opened


 LESS is open to mint for the next ${minutesLeft} minutes for window ${windowId}


${formatUrlForTweet(`${BASE_URL}/mint`)}`;
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
    testWindowReadyMode ||
    testBalanceProgressMode
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

// Run test balance progress mode - test balance progress tweet with real or mock data
async function runTestBalanceProgressMode() {
  const usingMockData = mockBalance || mockThreshold || mockWindowId;

  if (usingMockData) {
    logInfo("Running in TEST BALANCE PROGRESS MODE - using mock values");
  } else {
    logInfo(
      "Running in TEST BALANCE PROGRESS MODE - fetching real balance data"
    );
  }
  console.log();

  try {
    let currentBalance, minEthForWindow, nextWindowId;

    if (usingMockData) {
      // Use mock values if provided
      const mockBalanceEth = parseFloat(mockBalance || "0.15");
      const mockThresholdEth = parseFloat(mockThreshold || "0.25");
      const mockWindowIdNum = parseInt(mockWindowId || "5", 10);

      currentBalance = BigInt(Math.floor(mockBalanceEth * 1e18));
      minEthForWindow = BigInt(Math.floor(mockThresholdEth * 1e18));
      nextWindowId = mockWindowIdNum;

      logInfo(`Using mock values:`);
      logInfo(`  Balance: ${mockBalanceEth} ETH`);
      logInfo(`  Threshold: ${mockThresholdEth} ETH`);
      logInfo(`  Window ID: ${nextWindowId}`);
    } else {
      // Fetch real data from contract
      const rpcUrl = getRpcUrl();
      const contractAddress = getContractAddress();
      const abi = loadContractABI();
      const client = createPublicClient({
        chain: getChain(),
        transport: http(rpcUrl),
      });

      // Get strategy address, minEthForWindow, and windowCount
      const [strategyAddress, fetchedMinEthForWindow, windowCount] =
        await Promise.all([
          client.readContract({
            address: contractAddress,
            abi: abi,
            functionName: "strategy",
          }),
          client.readContract({
            address: contractAddress,
            abi: [
              {
                inputs: [],
                name: "minEthForWindow",
                outputs: [{ name: "", type: "uint256" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "minEthForWindow",
          }),
          client.readContract({
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
          }),
        ]);

      if (
        !strategyAddress ||
        strategyAddress === "0x0000000000000000000000000000000000000000"
      ) {
        logError("No strategy address set");
        process.exit(1);
      }

      // Next window ID is current windowCount + 1
      nextWindowId = Number(windowCount) + 1;
      minEthForWindow = fetchedMinEthForWindow;

      logInfo(`Strategy address: ${strategyAddress}`);
      logInfo(`Threshold: ${formatEther(minEthForWindow)} ETH`);
      logInfo(`Next window ID: ${nextWindowId}`);

      // Get current balance of strategy contract
      currentBalance = await client.getBalance({
        address: strategyAddress,
      });

      logInfo(`Current balance: ${formatEther(currentBalance)} ETH`);
    }

    // Calculate progress percentage (capped at 100%)
    const progressPercent = Math.min(
      100,
      Number((currentBalance * 100n) / minEthForWindow)
    );

    logInfo(`Progress: ${progressPercent.toFixed(1)}%`);

    // Get ETH price (mock or real)
    let ethPrice = null;
    if (mockEthPrice) {
      ethPrice = parseFloat(mockEthPrice);
      logInfo(`Using mock ETH price: $${ethPrice}`);
    } else {
      // Fetch real ETH price
      ethPrice = await fetchEthPrice();
      if (ethPrice) {
        logInfo(`ETH price: $${ethPrice}`);
      }
    }
    console.log();

    // Format and display the tweet (test mode doesn't fetch timeUntilFundsMoved)
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      0 // timeUntilOpen - not fetched in test mode
    );

    await postTweet(null, tweetMessage);
    logSuccess("Test balance progress completed!");
  } catch (error) {
    logError(`Test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run post balance mode - post a balance progress tweet immediately
async function runPostBalanceMode() {
  if (dryRun) {
    logInfo("DRY-RUN: Previewing balance status tweet...");
  } else {
    logInfo("Posting balance status tweet...");
  }
  console.log();

  try {
    // Fetch real data from contract
    const rpcUrl = getRpcUrl();
    const contractAddress = getContractAddress();
    const abi = loadContractABI();
    const client = createPublicClient({
      chain: getChain(),
      transport: http(rpcUrl),
    });

    // Get strategy address, minEthForWindow, and windowCount
    const [strategyAddress, minEthForWindow, windowCount] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: abi,
        functionName: "strategy",
      }),
      client.readContract({
        address: contractAddress,
        abi: [
          {
            inputs: [],
            name: "minEthForWindow",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "minEthForWindow",
      }),
      client.readContract({
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
      }),
    ]);

    if (
      !strategyAddress ||
      strategyAddress === "0x0000000000000000000000000000000000000000"
    ) {
      logError("No strategy address set");
      process.exit(1);
    }

    // Next window ID is current windowCount + 1
    const nextWindowId = Number(windowCount) + 1;

    logInfo(`Strategy address: ${strategyAddress}`);
    logInfo(`Threshold: ${formatEther(minEthForWindow)} ETH`);
    logInfo(`Next window ID: ${nextWindowId}`);

    // Get current balance of strategy contract and timeUntilFundsMoved
    const [currentBalance, timeUntilFundsMoved] = await Promise.all([
      client.getBalance({
        address: strategyAddress,
      }),
      client.readContract({
        address: strategyAddress,
        abi: [
          {
            inputs: [],
            name: "timeUntilFundsMoved",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "timeUntilFundsMoved",
      }),
    ]);

    logInfo(`Current balance: ${formatEther(currentBalance)} ETH`);
    if (timeUntilFundsMoved > 0n) {
      logInfo(`Time until window can open: ${Number(timeUntilFundsMoved)} seconds`);
    }

    // Calculate progress percentage (capped at 100%)
    const progressPercent = Math.min(
      100,
      Number((currentBalance * 100n) / minEthForWindow)
    );

    logInfo(`Progress: ${progressPercent.toFixed(1)}%`);

    // Fetch real ETH price
    const ethPrice = await fetchEthPrice();
    if (ethPrice) {
      logInfo(`ETH price: $${ethPrice}`);
    }

    console.log();

    // Format the tweet
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      Number(timeUntilFundsMoved)
    );

    if (dryRun) {
      // Just display the tweet preview
      displayTweetPreview(tweetMessage);
      logSuccess("Dry-run completed!");
      return;
    }

    // Initialize Twitter client and post
    const twitterClient = initTwitterClient();
    if (!twitterClient) {
      logError("Failed to initialize Twitter client");
      process.exit(1);
    }

    const tweetId = await postTweet(twitterClient, tweetMessage);
    if (tweetId) {
      logSuccess(`Balance status tweet posted! Tweet ID: ${tweetId}`);

      // Update state with new lastBalanceProgressPost
      const state = loadState(contractAddress);
      const now = Math.floor(Date.now() / 1000);
      saveState(
        state.processedWindows,
        state.processedMints,
        state.fifteenMinReminders,
        state.processedEndedWindows,
        state.windowReadyAlerted,
        now,
        state.lastBlock,
        contractAddress
      );
      logInfo("State updated with new lastBalanceProgressPost timestamp");
    } else {
      logError("Failed to post tweet");
      process.exit(1);
    }
  } catch (error) {
    logError(`Failed to post balance tweet: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
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

${formatUrlForTweet(`${BASE_URL}/${tokenId}`)}`;
}

// Format 15-minute reminder tweet
function formatReminderTweet(windowId, minutesRemaining, burnData = null) {
  // If we have full burn data (amount + supply), include both lines
  if (burnData && burnData.amountBurned && burnData.supplyRemaining) {
    return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}
${burnData.amountBurned} $LESS burned
${burnData.supplyRemaining}% supply remaining

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
  }

  // If we have only supply data (no burn amount), show just supply
  if (burnData && burnData.supplyRemaining) {
    return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}
${burnData.supplyRemaining}% supply remaining

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
  }

  // Simple format without any burn/supply data
  return `only ~${minutesRemaining} minutes left to mint!

window ${windowId}

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// Format tweet for when a new window is ready to be opened
function formatWindowReadyTweet() {
  return `a new LESS window is ready to open

minting will trigger a 0.25 ETH buy + burn of $LESS

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// Format balance progress tweet with unicode progress bar
function formatBalanceProgressTweet(
  currentBalance,
  threshold,
  progressPercent,
  windowId,
  ethPrice = null,
  timeUntilOpen = 0
) {
  // Create progress bar using unicode shade characters
  // Dark shades (█, ▓, ▒) for filled, light (░) for empty
  const barLength = 20;
  const filledBlocks = Math.floor((progressPercent / 100) * barLength);
  const partialBlock = (progressPercent / 100) * barLength - filledBlocks;

  let progressBar = "";

  // Add filled blocks (dark)
  for (let i = 0; i < filledBlocks; i++) {
    progressBar += "▓";
  }

  // Add partial block based on remainder (if needed) - use dark shades
  if (filledBlocks < barLength && partialBlock > 0) {
    if (partialBlock < 0.25) {
      progressBar += "▒"; // Medium-dark shade for small partial
    } else if (partialBlock < 0.5) {
      progressBar += "▒"; // Dark shade
    } else if (partialBlock < 0.75) {
      progressBar += "▓"; // Full block
    } else {
      progressBar += "▓"; // Full block
    }
  }

  // Fill rest with light shade (empty portion)
  while (progressBar.length < barLength) {
    progressBar += "░";
  }

  // Format ETH amounts
  const currentEth = Number(formatEther(currentBalance));
  const thresholdEth = Number(formatEther(threshold));
  const remainingEth = Math.max(0, thresholdEth - currentEth);

  // Calculate trading volume estimate (8% of fees go to buyback)
  let volumeText = "";
  if (remainingEth > 0 && ethPrice) {
    const volumeNeededEth = remainingEth / 0.08;
    const volumeNeededUsd = volumeNeededEth * ethPrice;
    volumeText = `\n~$${volumeNeededUsd.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} worth of $LESS trading volume`;
  }

  // Format percentages
  const percentStr = progressPercent.toFixed(1);

  return `$LESS buy + burn balance progress toward window ${windowId}

${progressBar} ${percentStr}%

${currentEth.toFixed(4)} ETH / ${thresholdEth.toFixed(4)} ETH
${
  remainingEth > 0
    ? `${remainingEth.toFixed(4)} ETH remaining${volumeText}`
    : ""
}${
  remainingEth <= 0 && timeUntilOpen > 0
    ? `\nthreshold reached! opens in ${Math.floor(timeUntilOpen / 60)}:${String(timeUntilOpen % 60).padStart(2, '0')}`
    : remainingEth <= 0
    ? `\nready to open!`
    : ""
}

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
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
    // Get current window ID
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

    const windowId = Number(windowCount);
    if (windowId === 0) {
      return null; // No windows yet
    }

    // Get time until window closes
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

    const timeRemaining = Number(timeUntilClose);

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
    if (fifteenMinReminders.has(windowId)) {
      return null;
    }

    logInfo(
      `15-minute reminder triggered for window #${windowId} (${minutesRemaining} minutes remaining)`
    );

    // Fetch burn data
    const burnData = await fetchBurnData(client, contractAddress, abi);

    // Format and post tweet
    const tweetMessage = formatReminderTweet(
      windowId,
      minutesRemaining,
      burnData
    );

    logInfo("Posting 15-minute reminder tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Reminder tweet posted! Tweet ID: ${tweetId}`);
      fifteenMinReminders.add(windowId);
      return windowId;
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

// Get all token IDs minted in a specific window
async function getMintsForWindow(
  client,
  contractAddress,
  windowId,
  fromBlock = null
) {
  try {
    // Get all Minted events for this window
    // If fromBlock is provided, use it for efficiency; otherwise query all blocks
    const logOptions = {
      address: contractAddress,
      event: parseAbiItem(
        "event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)"
      ),
      args: {
        windowId: BigInt(windowId),
      },
    };

    // Add block range if provided (helps with performance)
    if (fromBlock !== null) {
      logOptions.fromBlock = fromBlock;
    }

    const mintLogs = await client.getLogs(logOptions);

    // Extract token IDs and sort them
    const tokenIds = mintLogs
      .map((log) => Number(log.args.tokenId))
      .sort((a, b) => a - b);

    return tokenIds;
  } catch (error) {
    logError(`Failed to get mints for window ${windowId}: ${error.message}`);
    return [];
  }
}

// Calculate optimal grid dimensions for social media
function calculateGridDimensions(count) {
  if (count === 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  if (count <= 16) return { cols: 4, rows: 4 };
  if (count <= 20) return { cols: 5, rows: 4 };
  if (count <= 25) return { cols: 5, rows: 5 };
  if (count <= 30) return { cols: 6, rows: 5 };
  if (count <= 36) return { cols: 6, rows: 6 };
  // For larger counts, use a reasonable max
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

// Create a grid image from multiple token images using image-api
async function createGridImage(tokenIds) {
  if (tokenIds.length === 0) {
    throw new Error("No token IDs provided for grid");
  }

  const imageApiUrl =
    process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";

  // Use image-api grid endpoint for fast server-side generation
  // This uses black background, no padding, no gaps, and A4 ratio (300x424)
  const tokenIdsParam = tokenIds.join(",");
  const gridUrl = `${imageApiUrl}/api/grid?tokenIds=${tokenIdsParam}&cellWidth=300&cellHeight=424`;

  logInfo(
    `Fetching grid image from image-api for ${tokenIds.length} tokens...`
  );

  return new Promise((resolve, reject) => {
    const get = gridUrl.startsWith("https") ? httpsGet : httpGet;
    get(gridUrl, (res) => {
      if (res.statusCode !== 200) {
        const errorMsg = `Image API returned status ${res.statusCode}`;
        logError(errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        logSuccess(
          `Grid image fetched: ${buffer.length} bytes for ${tokenIds.length} tokens`
        );
        resolve(buffer);
      });
      res.on("error", (err) => {
        logError(`Grid image fetch error: ${err.message}`);
        reject(err);
      });
    }).on("error", (err) => {
      logError(`Grid image fetch error: ${err.message}`);
      reject(err);
    });
  });
}

// Format window end summary tweet
function formatWindowEndTweet(windowId, mintCount, tokenIds) {
  const tokenRange =
    tokenIds.length > 0
      ? tokenIds.length === 1
        ? `token ${tokenIds[0]}`
        : `tokens ${tokenIds[0]}-${tokenIds[tokenIds.length - 1]}`
      : "no tokens";

  return `LESS mint window ${windowId} closed

${mintCount} pieces minted
${tokenRange}

${formatUrlForTweet(`${BASE_URL}/window/${windowId}`)}`;
}

// Process balance progress check - posts every 6 hours if no active window
async function processBalanceProgressCheck(
  lastBalanceProgressPost,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    // Check if there's an active window - if so, skip
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
      {
        inputs: [],
        name: "isWindowActive",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const isActive = await client.readContract({
      address: contractAddress,
      abi: currentWindowAbi,
      functionName: "isWindowActive",
    });

    if (isActive) {
      return { posted: false, lastPost: lastBalanceProgressPost };
    }

    // Check if 6 hours have passed since last post
    const now = Math.floor(Date.now() / 1000);
    const sixHoursInSeconds = 6 * 60 * 60; // 21600 seconds
    if (
      lastBalanceProgressPost &&
      now - lastBalanceProgressPost < sixHoursInSeconds
    ) {
      return { posted: false, lastPost: lastBalanceProgressPost };
    }

    // Get strategy address and minEthForWindow
    const [strategyAddress, minEthForWindow] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: abi,
        functionName: "strategy",
      }),
      client.readContract({
        address: contractAddress,
        abi: [
          {
            inputs: [],
            name: "minEthForWindow",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "minEthForWindow",
      }),
    ]);

    if (
      !strategyAddress ||
      strategyAddress === "0x0000000000000000000000000000000000000000"
    ) {
      logInfo("No strategy address set, skipping balance progress check");
      return { posted: false, lastPost: lastBalanceProgressPost };
    }

    // Get current balance of strategy contract, window count, and timeUntilFundsMoved
    const [currentBalance, windowCount, timeUntilFundsMoved] = await Promise.all([
      client.getBalance({
        address: strategyAddress,
      }),
      client.readContract({
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
      }),
      client.readContract({
        address: strategyAddress,
        abi: [
          {
            inputs: [],
            name: "timeUntilFundsMoved",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "timeUntilFundsMoved",
      }),
    ]);

    // Next window ID is current windowCount + 1
    const nextWindowId = Number(windowCount) + 1;

    // Calculate progress percentage (capped at 100%)
    const progressPercent = Math.min(
      100,
      Number((currentBalance * 100n) / minEthForWindow)
    );

    // Fetch ETH price for trading volume estimate
    const ethPrice = await fetchEthPrice();

    logInfo(
      `Balance progress: ${formatEther(currentBalance)} ETH / ${formatEther(
        minEthForWindow
      )} ETH (${progressPercent.toFixed(1)}%)`
    );
    if (ethPrice) {
      const remainingEth = Math.max(
        0,
        Number(formatEther(minEthForWindow)) -
          Number(formatEther(currentBalance))
      );
      if (remainingEth > 0) {
        const volumeNeededEth = remainingEth / 0.08;
        const volumeNeededUsd = volumeNeededEth * ethPrice;
        logInfo(
          `Trading volume needed: ~$${volumeNeededUsd.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 }
          )}`
        );
      }
    }

    // Format and post tweet
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      Number(timeUntilFundsMoved)
    );

    logInfo("Posting balance progress tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Balance progress tweet posted! Tweet ID: ${tweetId}`);
      return { posted: true, lastPost: now };
    } else {
      logError("Failed to post balance progress tweet");
      return { posted: false, lastPost: lastBalanceProgressPost };
    }
  } catch (error) {
    // Silently handle contract errors
    if (
      error.message?.includes("revert") ||
      error.message?.includes("execution reverted") ||
      error.message?.includes("Window")
    ) {
      return { posted: false, lastPost: lastBalanceProgressPost };
    }
    logError(`Error checking balance progress: ${error.message}`);
    return { posted: false, lastPost: lastBalanceProgressPost };
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

// Process ended windows check - posts summary when windows end
async function processEndedWindowsCheck(
  processedEndedWindows,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    // Get current window count
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

    const currentWindowId = Number(windowCount);
    if (currentWindowId === 0) {
      return null; // No windows yet
    }

    // Check if window is currently active
    const isActive = await client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "isWindowActive",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "isWindowActive",
    });

    // If window is still active, nothing to do
    if (isActive) {
      return null;
    }

    // Window is not active - check if we've already processed this window's end
    if (processedEndedWindows.has(currentWindowId)) {
      return null;
    }

    // Window has ended and we haven't processed it
    logInfo(
      `Window ${currentWindowId} has ended, creating summary tweet...`
    );

    // Get all mints for this window
    // Use a lookback block for efficiency (last 1000 blocks ~3.5 hours)
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;
    const tokenIds = await getMintsForWindow(
      client,
      contractAddress,
      currentWindowId,
      fromBlock
    );

    if (tokenIds.length === 0) {
      logInfo(
        `Window ${currentWindowId} ended with no mints, skipping summary`
      );
      processedEndedWindows.add(currentWindowId);
      return currentWindowId;
    }

    // Create grid image
    let gridImage = null;
    try {
      gridImage = await createGridImage(tokenIds);
    } catch (error) {
      logError(`Failed to create grid image: ${error.message}`);
      // Continue without image
    }

    // Format and post tweet
    const tweetMessage = formatWindowEndTweet(
      currentWindowId,
      tokenIds.length,
      tokenIds
    );

    logInfo("Posting window end summary tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage, gridImage);

    if (tweetId) {
      logSuccess(`Window end summary tweet posted! Tweet ID: ${tweetId}`);
      processedEndedWindows.add(currentWindowId);
      return currentWindowId;
    } else {
      logError("Failed to post window end summary tweet");
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
    logError(`Error checking ended windows: ${error.message}`);
    return null;
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

  // Handle test balance progress mode
  if (testBalanceProgressMode) {
    await runTestBalanceProgressMode();
    return;
  }

  // Handle post balance mode (post balance status tweet immediately)
  if (postBalanceMode) {
    await runPostBalanceMode();
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
  const processedEndedWindows = state.processedEndedWindows;
  let windowReadyAlerted = state.windowReadyAlerted;
  let lastBalanceProgressPost = state.lastBalanceProgressPost;
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
  if (processedEndedWindows.size > 0) {
    logInfo(
      `Loaded ${processedEndedWindows.size} previously processed ended windows from state`
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
        processedEndedWindows,
        windowReadyAlerted,
        lastBalanceProgressPost,
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
                processedEndedWindows,
                windowReadyAlerted,
                lastBalanceProgressPost,
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
                processedEndedWindows,
                windowReadyAlerted,
                lastBalanceProgressPost,
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
              processedEndedWindows,
              windowReadyAlerted,
              lastBalanceProgressPost,
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
              processedEndedWindows,
              windowReadyAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress
            );
          }
        } catch (error) {
          logError(`Window ready check error: ${error.message}`);
        }
      }, 60000);

      // Ended windows checker (every 60 seconds) - posts summary when windows end
      const endedWindowsInterval = setInterval(async () => {
        try {
          const processedWindowId = await processEndedWindowsCheck(
            processedEndedWindows,
            twitterClient,
            client,
            contractAddress,
            abi
          );
          if (processedWindowId) {
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress
            );
          }
        } catch (error) {
          logError(`Ended windows check error: ${error.message}`);
        }
      }, 60000);

      // Balance progress checker (every 6 hours) - posts progress when no active window
      const balanceProgressInterval = setInterval(async () => {
        try {
          const result = await processBalanceProgressCheck(
            lastBalanceProgressPost,
            twitterClient,
            client,
            contractAddress,
            abi
          );
          // Update state if posted
          if (result.posted || result.lastPost !== lastBalanceProgressPost) {
            lastBalanceProgressPost = result.lastPost;
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress
            );
          }
        } catch (error) {
          logError(`Balance progress check error: ${error.message}`);
        }
      }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds

      // Graceful shutdown handler
      const shutdown = () => {
        logInfo("Shutting down...");
        if (unwatch) unwatch();
        clearInterval(reminderInterval);
        clearInterval(windowReadyInterval);
        clearInterval(endedWindowsInterval);
        clearInterval(balanceProgressInterval);
        saveState(
          processedWindows,
          processedMints,
          fifteenMinReminders,
          processedEndedWindows,
          windowReadyAlerted,
          lastBalanceProgressPost,
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
              `Heartbeat: block ${block}, processed ${processedWindows.size} windows, ${processedMints.size} mints, ${fifteenMinReminders.size} reminders, ${processedEndedWindows.size} ended windows`
            );
          } catch (error) {
            clearInterval(healthCheck);
            clearInterval(reminderInterval);
            clearInterval(windowReadyInterval);
            clearInterval(endedWindowsInterval);
            clearInterval(balanceProgressInterval);
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
