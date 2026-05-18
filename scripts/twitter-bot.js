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

import { createPublicClient, http, fallback, parseAbiItem, formatEther } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { TwitterApi } from "twitter-api-v2";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet, createServer } from "http";
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

// Load Twitter handles mapping (address -> handle) - serves as cache + manual fallback
// Use /data on Fly.io for persistence, fallback to scripts dir locally
const handlesPath = join(dataDir, "twitter-handles.json");
const localHandlesPath = join(__dirname, "twitter-handles.json");
let twitterHandles = {};
try {
  // First load from persistent storage (or local cache)
  if (existsSync(handlesPath)) {
    twitterHandles = JSON.parse(readFileSync(handlesPath, "utf8"));
    console.log(
      `Loaded ${
        Object.keys(twitterHandles).length
      } Twitter handle mappings from ${handlesPath}`
    );
  }
  // Also merge in any manual entries from the repo file (local dev or deploy-time additions)
  if (existsSync(localHandlesPath) && localHandlesPath !== handlesPath) {
    const localHandles = JSON.parse(readFileSync(localHandlesPath, "utf8"));
    twitterHandles = { ...twitterHandles, ...localHandles };
    console.log(
      `Merged ${
        Object.keys(localHandles).length
      } manual Twitter handle mappings`
    );
  }
  // Normalize addresses to lowercase for lookup
  twitterHandles = Object.fromEntries(
    Object.entries(twitterHandles).map(([addr, handle]) => [
      addr.toLowerCase(),
      handle,
    ])
  );
} catch (e) {
  console.log("No twitter-handles.json found, starting fresh");
}

// Save a Twitter handle to the cache file
function saveTwitterHandle(address, handle) {
  try {
    twitterHandles[address.toLowerCase()] = handle;
    // Read current file to preserve formatting and any manual entries
    let fileData = {};
    if (existsSync(handlesPath)) {
      fileData = JSON.parse(readFileSync(handlesPath, "utf8"));
    }
    fileData[address.toLowerCase()] = handle;
    writeFileSync(handlesPath, JSON.stringify(fileData, null, 2) + "\n");
  } catch (e) {
    console.log(`Failed to save Twitter handle: ${e.message}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "mainnet";
const dryRun = args.includes("--dry-run");
const testMode = args.includes("--test");
const testMintMode = args.includes("--test-mint");
const testReminderMode = args.includes("--test-reminder");
const testWindowReadyMode = args.includes("--test-window-ready");
const testThresholdReachedMode = args.includes("--test-threshold-reached");
const testBalanceProgressMode = args.includes("--test-balance-progress");
const testSaleMode = args.includes("--test-sale");
const previewSaleTokenIds = args
  .find((arg) => arg.startsWith("--preview-sale="))
  ?.split("=")[1]
  ?.split(",")
  .map((id) => id.trim()); // Preview a real sale tweet for one or more token IDs (comma-separated)
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

// Admin HTTP server config
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || "8080", 10);
const ADMIN_ADDRESS =
  "0xCB43078C32423F5348Cab5885911C3B5faE217F9".toLowerCase();

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

// Format ETH value without trailing zeros
function formatEthValue(value, decimals = 4) {
  return Number(value).toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
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
      pendingMints: new Map(),
      fifteenMinReminders: new Set(),
      processedEndedWindows: new Set(),
      windowReadyAlerted: false,
      thresholdReachedAlerted: false,
      lastBalanceProgressPost: null,
      lastBlock: 0n,
      processedSales: new Set(),
      lastSalesTimestamp: 0,
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
          pendingMints: new Map(),
          fifteenMinReminders: new Set(),
          processedEndedWindows: new Set(),
          windowReadyAlerted: false,
          thresholdReachedAlerted: false,
          lastBalanceProgressPost: null,
          lastBlock: 0n,
          processedSales: new Set(),
          lastSalesTimestamp: 0,
        };
      }

      return {
        processedWindows: new Set(
          data.processedWindows || data.processedFolds || []
        ),
        processedMints: new Set(data.processedMints || []),
        pendingMints: new Map(
          Object.entries(data.pendingMints || {}).map(([k, v]) => [
            Number(k),
            v,
          ])
        ),
        fifteenMinReminders: new Set(data.fifteenMinReminders || []),
        processedEndedWindows: new Set(data.processedEndedWindows || []),
        windowReadyAlerted: data.windowReadyAlerted || false,
        thresholdReachedAlerted: data.thresholdReachedAlerted || false,
        lastBalanceProgressPost: data.lastBalanceProgressPost || null,
        lastBlock: BigInt(data.lastBlock || 0),
        processedSales: new Set(data.processedSales || []),
        lastSalesTimestamp: data.lastSalesTimestamp || 0,
      };
    }
  } catch (error) {
    logWarn(`Failed to load state file: ${error.message}`);
  }
  return {
    processedWindows: new Set(),
    processedMints: new Set(),
    pendingMints: new Map(),
    fifteenMinReminders: new Set(),
    processedEndedWindows: new Set(),
    windowReadyAlerted: false,
    thresholdReachedAlerted: false,
    lastBalanceProgressPost: null,
    lastBlock: 0n,
    processedSales: new Set(),
    lastSalesTimestamp: 0,
  };
}

function saveState(
  processedWindows,
  processedMints,
  fifteenMinReminders,
  processedEndedWindows,
  windowReadyAlerted,
  thresholdReachedAlerted,
  lastBalanceProgressPost,
  lastBlock,
  contractAddress,
  processedSales = new Set(),
  lastSalesTimestamp = 0,
  pendingMints = new Map()
) {
  try {
    const data = {
      contractAddress,
      processedWindows: Array.from(processedWindows),
      processedMints: Array.from(processedMints),
      pendingMints: Object.fromEntries(pendingMints),
      fifteenMinReminders: Array.from(fifteenMinReminders),
      processedEndedWindows: Array.from(processedEndedWindows),
      windowReadyAlerted,
      thresholdReachedAlerted,
      lastBalanceProgressPost,
      lastBlock: lastBlock.toString(),
      processedSales: Array.from(processedSales),
      lastSalesTimestamp: lastSalesTimestamp,
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

// Fetch image from image API using token ID (with timeout and retry)
const IMAGE_FETCH_TIMEOUT = 60000; // 60 seconds (allows for queue wait + render)
const IMAGE_FETCH_RETRIES = 3;
const IMAGE_FETCH_RETRY_DELAY = 5000; // 5 seconds between retries

async function fetchImageOnce(tokenId) {
  const imageApiUrl =
    process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";
  const url = `${imageApiUrl}/images/${tokenId}`;

  return new Promise((resolve) => {
    const get = url.startsWith("https") ? httpsGet : httpGet;
    const req = get(url, (res) => {
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

    // Add timeout
    req.setTimeout(IMAGE_FETCH_TIMEOUT, () => {
      logError(`Image fetch timeout after ${IMAGE_FETCH_TIMEOUT}ms`);
      req.destroy();
      resolve(null);
    });
  });
}

async function fetchImage(tokenId) {
  const imageApiUrl =
    process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";
  const url = `${imageApiUrl}/images/${tokenId}`;
  logInfo(`Fetching image from ${url}`);

  for (let attempt = 1; attempt <= IMAGE_FETCH_RETRIES; attempt++) {
    const buffer = await fetchImageOnce(tokenId);
    if (buffer) {
      return buffer;
    }

    if (attempt < IMAGE_FETCH_RETRIES) {
      logInfo(
        `Retry ${attempt}/${IMAGE_FETCH_RETRIES} for image ${tokenId} in ${
          IMAGE_FETCH_RETRY_DELAY / 1000
        }s...`
      );
      await sleep(IMAGE_FETCH_RETRY_DELAY);
    }
  }

  logError(
    `Failed to fetch image for token ${tokenId} after ${IMAGE_FETCH_RETRIES} attempts`
  );
  return null;
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

// Public RPC fallbacks per chain — used so the bot keeps running if the
// primary (Alchemy) endpoint is rate-limited, over-quota, or down.
const PUBLIC_RPC_FALLBACKS = {
  mainnet: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
  ],
  sepolia: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.drpc.org",
  ],
};

// Build a viem transport: primary RPC first, then 2 public fallbacks.
// `chainName` defaults to the bot's configured network; pass "mainnet"
// explicitly when building a mainnet-only client (e.g. ENS lookups).
function getTransport(primaryRpcUrl, chainName = network) {
  const fallbacks = PUBLIC_RPC_FALLBACKS[chainName] || [];
  return fallback([
    http(primaryRpcUrl),
    ...fallbacks.map((url) => http(url)),
  ]);
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

// ============================================================================
// SINGLETON CLIENTS - Reused across all requests to avoid connection overhead
// ============================================================================

// Mainnet client for ENS resolution (ENS is always on mainnet)
let mainnetClient = null;
function getMainnetClient() {
  if (!mainnetClient) {
    const mainnetRpc = process.env.MAINNET_RPC_URL;
    if (!mainnetRpc) return null;
    mainnetClient = createPublicClient({
      chain: mainnet,
      transport: getTransport(mainnetRpc, "mainnet"),
    });
  }
  return mainnetClient;
}

// NFT client for contract reads (uses configured network)
let nftClient = null;
function getNftClient() {
  if (!nftClient) {
    const rpcUrl = getRpcUrl();
    nftClient = createPublicClient({
      chain: getChain(),
      transport: getTransport(rpcUrl),
    });
  }
  return nftClient;
}

// ============================================================================
// ENS CACHING FROM LEADERBOARD
// ============================================================================
const IMAGE_API_BASE =
  process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 300000; // 5 minutes

// Fetch leaderboard data (cached)
async function getLeaderboard() {
  if (leaderboardCache && Date.now() - leaderboardCacheTime < LEADERBOARD_CACHE_TTL) {
    return leaderboardCache;
  }
  try {
    const response = await fetch(`${IMAGE_API_BASE}/api/leaderboard`);
    if (response.ok) {
      leaderboardCache = await response.json();
      leaderboardCacheTime = Date.now();
      return leaderboardCache;
    }
  } catch {
    // Ignore errors, fall through to null
  }
  return null;
}

// Get ENS name from leaderboard cache
async function getEnsFromLeaderboard(address) {
  const leaderboard = await getLeaderboard();
  if (!leaderboard?.collectors) return null;

  const collector = leaderboard.collectors.find(
    (c) => c.address.toLowerCase() === address.toLowerCase()
  );
  return collector?.ensName || null;
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

// Fetch LESS token market cap from DexScreener
async function fetchLessMarketCap() {
  try {
    if (!LESS_TOKEN_ADDRESS) {
      return null;
    }
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${LESS_TOKEN_ADDRESS}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    // Get the first pair's market cap (usually the main liquidity pool)
    const pair = data.pairs?.[0];
    if (pair?.marketCap) {
      return pair.marketCap;
    }
    // Fallback: calculate from fdv if available
    if (pair?.fdv) {
      return pair.fdv;
    }
    return null;
  } catch (error) {
    logWarn(`Failed to fetch LESS market cap: ${error.message}`);
    return null;
  }
}

// Format URL for tweet - just returns the full URL
// Cards are suppressed by attaching media to the tweet
function formatUrlForTweet(url) {
  return url;
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
      transport: getTransport(mainnetRpc, "mainnet"),
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
      transport: getTransport(rpcUrl),
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

  // Resolve display name (Twitter handle > ENS > truncated address)
  const minterDisplay = await resolveDisplayName(testMinter);

  // Initialize client for contract reads
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const abi = loadContractABI();
  const client = createPublicClient({
    chain: getChain(),
    transport: getTransport(rpcUrl),
  });

  // Fetch remaining time in window (if contract is configured)
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

  // Get collector stats for the minter
  const collectorStats = await getCollectorStats(
    testMinter,
    client,
    contractAddress,
    abi
  );

  // Format and display the tweet with image
  const tweetMessage = formatMintTweet(
    testTokenId,
    minterDisplay,
    minutesRemaining,
    null, // windowId
    false, // isBountyMint
    collectorStats
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
    transport: getTransport(rpcUrl),
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

  // Resolve display name (Twitter handle > ENS > truncated address)
  const minterDisplay = await resolveDisplayName(minter);
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

  // Get collector stats for the minter
  const collectorStats = await getCollectorStats(
    minter,
    client,
    contractAddress,
    abi
  );

  // Format tweet
  const tweetMessage = formatMintTweet(
    Number(tokenId),
    minterDisplay,
    minutesRemaining,
    windowId,
    false, // isBountyMint
    collectorStats
  );

  // Check for dry-run mode
  if (dryRun) {
    logInfo("=== DRY RUN - Tweet would be posted ===");
    console.log();
    console.log(tweetMessage);
    console.log();
    logInfo("=== END DRY RUN ===");
    return;
  }

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
    transport: getTransport(rpcUrl),
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
  const testMintCount = 25;

  logInfo(
    `Simulated: Window #${testWindowId} with ${testMinutesRemaining} minutes remaining, ${testMintCount} mints`
  );
  console.log();

  // Format and display the tweet
  const tweetMessage = formatReminderTweet(
    testWindowId,
    testMinutesRemaining,
    testMintCount
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

// Run test threshold reached mode - test threshold reached tweet with real or mock data
async function runTestThresholdReachedMode() {
  const usingMockData = mockBalance || mockThreshold || mockWindowId;

  if (usingMockData) {
    logInfo("Running in TEST THRESHOLD REACHED MODE - using mock values");
  } else {
    logInfo(
      "Running in TEST THRESHOLD REACHED MODE - fetching real data from contract"
    );
  }
  console.log();

  try {
    let currentBalance, minEthForWindow, nextWindowId, timeUntilOpen;

    if (usingMockData) {
      // Use mock values if provided
      const mockBalanceEth = parseFloat(mockBalance || "0.25");
      const mockThresholdEth = parseFloat(mockThreshold || "0.25");
      const mockWindowIdNum = parseInt(mockWindowId || "11", 10);
      const mockTimeUntilOpen = 1140; // 19 minutes default

      currentBalance = BigInt(Math.floor(mockBalanceEth * 1e18));
      minEthForWindow = BigInt(Math.floor(mockThresholdEth * 1e18));
      nextWindowId = mockWindowIdNum;
      timeUntilOpen = mockTimeUntilOpen;

      logInfo(`Using mock values:`);
      logInfo(`  Balance: ${mockBalanceEth} ETH`);
      logInfo(`  Threshold: ${mockThresholdEth} ETH`);
      logInfo(`  Window ID: ${nextWindowId}`);
      logInfo(`  Time until open: ${timeUntilOpen}s`);
    } else {
      // Fetch real data from contract
      const rpcUrl = getRpcUrl();
      const contractAddress = getContractAddress();
      const abi = loadContractABI();
      const client = createPublicClient({
        chain: network === "sepolia" ? sepolia : mainnet,
        transport: getTransport(rpcUrl),
      });

      // Get strategy address and minEthForWindow
      const [strategyAddress, threshold, windowCount] = await Promise.all([
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

      // Get balance and timeUntilFundsMoved
      const [balance, twapDelay] = await Promise.all([
        client.getBalance({ address: strategyAddress }),
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

      currentBalance = balance;
      minEthForWindow = threshold;
      nextWindowId = Number(windowCount) + 1;
      timeUntilOpen = Number(twapDelay);

      logInfo(`Real contract data:`);
      logInfo(`  Balance: ${formatEther(currentBalance)} ETH`);
      logInfo(`  Threshold: ${formatEther(minEthForWindow)} ETH`);
      logInfo(`  Window ID: ${nextWindowId}`);
      logInfo(`  Time until open: ${timeUntilOpen}s`);
    }

    // Format and display the tweet
    const tweetMessage = formatThresholdReachedTweet(
      currentBalance,
      minEthForWindow,
      nextWindowId,
      timeUntilOpen
    );

    await postTweet(null, tweetMessage);
    logSuccess("Test threshold reached completed!");
  } catch (error) {
    logError(`Error in test threshold reached mode: ${error.message}`);
    process.exit(1);
  }
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
    let client, contractAddress, abi;

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

      // Set up client for burn data fetch even in mock mode
      const rpcUrl = getRpcUrl();
      contractAddress = getContractAddress();
      abi = loadContractABI();
      client = createPublicClient({
        chain: getChain(),
        transport: getTransport(rpcUrl),
      });
    } else {
      // Fetch real data from contract
      const rpcUrl = getRpcUrl();
      contractAddress = getContractAddress();
      abi = loadContractABI();
      client = createPublicClient({
        chain: getChain(),
        transport: getTransport(rpcUrl),
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

    // Get ETH price (mock or real), burn data, and market cap
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

    // Fetch burn data and market cap
    const [burnData, marketCap] = await Promise.all([
      fetchBurnData(client, contractAddress, abi),
      fetchLessMarketCap(),
    ]);
    if (marketCap) {
      logInfo(`Market cap: $${marketCap.toLocaleString()}`);
    }
    if (burnData?.supplyRemaining) {
      logInfo(
        `Supply burned: ${(100 - Number(burnData.supplyRemaining)).toFixed(2)}%`
      );
    }
    console.log();

    // Format and display the tweet (test mode doesn't fetch timeUntilFundsMoved)
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      0, // timeUntilOpen - not fetched in test mode
      burnData,
      marketCap
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

// Run test sale mode - simulates a secondary sale tweet
async function runTestSaleMode() {
  logInfo("Running in TEST SALE MODE - simulating a secondary sale");
  console.log();

  try {
    // Use mock values
    const testTokenIds = [7];
    const testWindowIds = [1]; // Mock window ID
    const testBuyer = "0x4fa58fFc00D973fD222d573C256Eb3Cc81A8569c";
    const testPriceEth = "0.4200";

    logInfo(`Mock sale data:`);
    logInfo(`  Token ID(s): ${testTokenIds.join(", ")}`);
    logInfo(`  Window ID(s): ${testWindowIds.join(", ")}`);
    logInfo(`  Buyer: ${testBuyer}`);
    logInfo(`  Price: ${testPriceEth} ETH`);
    console.log();

    // Resolve display name (Twitter handle > ENS > truncated address)
    const buyerDisplay = await resolveDisplayName(testBuyer);
    logInfo(`Buyer display: ${buyerDisplay}`);

    // Fetch image for token
    const imageBuffer = await fetchImage(testTokenIds[0]);
    if (!imageBuffer) {
      logWarn("Could not fetch image for token - tweet will not have image");
    }

    // Format and display tweet with window IDs
    const tweetMessage = formatSaleTweet(
      testTokenIds,
      buyerDisplay,
      testPriceEth,
      null,
      testWindowIds
    );

    if (imageBuffer) {
      await postTweetWithMultipleImages(null, tweetMessage, [imageBuffer]);
    } else {
      await postTweet(null, tweetMessage);
    }

    logSuccess("Test sale mode completed!");
  } catch (error) {
    logError(`Test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Preview a real sale from OpenSea - fetches actual sale data and shows tweet preview
// Supports multiple token IDs (comma-separated) for grouped sales
async function runPreviewSaleMode(tokenIds) {
  const tokenIdList = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  logInfo(
    `Running in PREVIEW SALE MODE - fetching real sale data for token(s) #${tokenIdList.join(
      ", #"
    )}`
  );
  console.log();

  try {
    const apiKey = process.env.OPENSEA_API_KEY;
    if (!apiKey) {
      logError("OPENSEA_API_KEY not set");
      process.exit(1);
    }

    // Fetch sales from OpenSea
    const collectionSlug = "say-less";
    const url = `https://api.opensea.io/api/v2/events/collection/${collectionSlug}?event_type=sale&limit=50`;

    logInfo(`Fetching sales from OpenSea...`);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`OpenSea API returned ${response.status}: ${errorText}`);
      process.exit(1);
    }

    const data = await response.json();
    const events = data.asset_events || [];

    // Find sales for all requested tokens
    const sales = [];
    for (const tokenId of tokenIdList) {
      const sale = events.find((e) => e.nft?.identifier === tokenId);
      if (!sale) {
        logError(`No sale found for token #${tokenId} in recent sales`);
        logInfo(
          `Available token IDs in recent sales: ${events
            .map((e) => e.nft?.identifier)
            .join(", ")}`
        );
        process.exit(1);
      }
      sales.push({ tokenId, sale });
    }

    // Verify all sales are from the same buyer
    const buyer = sales[0].sale.buyer;
    for (const { tokenId, sale } of sales) {
      if (sale.buyer.toLowerCase() !== buyer.toLowerCase()) {
        logError(`Token #${tokenId} was bought by ${sale.buyer}, not ${buyer}`);
        logError("All tokens must be from the same buyer for grouped sales");
        process.exit(1);
      }
    }

    // Calculate total price
    let totalPriceWei = 0n;
    for (const { tokenId, sale } of sales) {
      const priceWei = BigInt(sale.payment?.quantity || "0");
      totalPriceWei += priceWei;
      const priceEth = formatEthValue(formatEther(priceWei));
      const timestamp = new Date(sale.event_timestamp * 1000).toISOString();
      logInfo(`Found sale: Token #${tokenId} - ${priceEth} ETH - ${timestamp}`);
    }
    const totalPriceEth = formatEthValue(formatEther(totalPriceWei));
    logInfo(`Total: ${totalPriceEth} ETH for ${sales.length} token(s)`);
    console.log();

    // Resolve display name (Twitter handle > ENS > truncated address)
    const buyerDisplay = await resolveDisplayName(buyer);
    logInfo(`Buyer display: ${buyerDisplay}`);

    // Set up contract client to fetch collector stats
    const rpcUrl = getRpcUrl();
    const contractAddress = getContractAddress();
    const abi = loadContractABI();
    const client = createPublicClient({
      chain: getChain(),
      transport: getTransport(rpcUrl),
    });

    // Get collector stats for the buyer
    const collectorStats = await getCollectorStats(
      buyer,
      client,
      contractAddress,
      abi
    );

    // Format token IDs and fetch window IDs for them
    const sortedTokenIds = tokenIdList
      .map((id) => parseInt(id, 10))
      .sort((a, b) => a - b);

    // Fetch window IDs for the sold tokens
    let windowIds = null;
    try {
      const windowCalls = sortedTokenIds.map((tokenId) => ({
        address: contractAddress,
        abi,
        functionName: "getTokenData",
        args: [BigInt(tokenId)],
      }));
      const windowResults = await client.multicall({ contracts: windowCalls });
      windowIds = windowResults.map((result) => {
        if (result.status === "success") {
          return Number(result.result.windowId ?? result.result);
        }
        return null;
      });
      if (windowIds.some((w) => w === null)) {
        windowIds = null;
      }
    } catch (error) {
      logWarn(`Failed to fetch window IDs: ${error.message}`);
    }

    // Fetch images for all tokens (up to 4 for Twitter)
    const imagesToFetch = tokenIdList.slice(0, 4);
    const imageBuffers = [];
    for (const tokenId of imagesToFetch) {
      const imageBuffer = await fetchImage(parseInt(tokenId, 10));
      if (imageBuffer) {
        imageBuffers.push(imageBuffer);
      }
    }

    if (imageBuffers.length === 0) {
      logWarn("Could not fetch any images - tweet will not have images");
    }

    // Format tweet with all token IDs and window IDs
    const tweetMessage = formatSaleTweet(
      sortedTokenIds,
      buyerDisplay,
      totalPriceEth,
      collectorStats,
      windowIds
    );

    // Initialize Twitter client if not in dry-run mode
    const twitterClient = dryRun ? null : initTwitterClient();

    if (imageBuffers.length > 0) {
      await postTweetWithMultipleImages(
        twitterClient,
        tweetMessage,
        imageBuffers
      );
    } else {
      await postTweet(twitterClient, tweetMessage);
    }

    logSuccess(dryRun ? "Preview sale mode completed!" : "Sale tweet posted!");
  } catch (error) {
    logError(`Preview failed: ${error.message}`);
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
      transport: getTransport(rpcUrl),
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
      logInfo(
        `Time until window can open: ${Number(timeUntilFundsMoved)} seconds`
      );
    }

    // Calculate progress percentage (capped at 100%)
    const progressPercent = Math.min(
      100,
      Number((currentBalance * 100n) / minEthForWindow)
    );

    logInfo(`Progress: ${progressPercent.toFixed(1)}%`);

    // Fetch ETH price, burn data, and market cap in parallel
    const [ethPrice, burnData, marketCap] = await Promise.all([
      fetchEthPrice(),
      fetchBurnData(client, contractAddress, abi),
      fetchLessMarketCap(),
    ]);
    if (ethPrice) {
      logInfo(`ETH price: $${ethPrice}`);
    }
    if (marketCap) {
      logInfo(`Market cap: $${marketCap.toLocaleString()}`);
    }
    if (burnData?.supplyRemaining) {
      logInfo(
        `Supply burned: ${(100 - Number(burnData.supplyRemaining)).toFixed(2)}%`
      );
    }

    console.log();

    // Format the tweet
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      Number(timeUntilFundsMoved),
      burnData,
      marketCap
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
        state.thresholdReachedAlerted,
        now,
        state.lastBlock,
        contractAddress,
        state.processedSales,
        state.lastSalesTimestamp,
        state.pendingMints
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
// reminderContext is optional - if provided, schedules the 15-min reminder
async function processEvent(
  log,
  processedWindows,
  twitterClient,
  contractAddress,
  client,
  abi,
  reminderContext = null
) {
  try {
    const windowId = log.args.windowId;
    const startTime = log.args.startTime;
    const endTime = log.args.endTime;
    const strategyBlock = log.args.strategyBlock;

    // Skip if already processed
    if (processedWindows.has(Number(windowId))) {
      logInfo(`Skipping already processed window #${windowId}`);
      return { processed: false, endTime };
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

      // Schedule the 15-minute reminder for this window
      if (reminderContext) {
        scheduleReminder({
          windowId: Number(windowId),
          endTime,
          fifteenMinReminders: reminderContext.fifteenMinReminders,
          twitterClient,
          client,
          contractAddress,
          abi,
          saveStateFn: reminderContext.saveStateFn,
        });
      }
    } else {
      logError("Failed to post tweet");
    }

    return { processed: true, endTime };
  } catch (error) {
    logError(`Error processing event: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return { processed: false, endTime: null };
  }
}

// Format mint tweet message
function formatMintTweet(
  tokenId,
  minterDisplay,
  minutesRemaining = null,
  windowId = null,
  isBountyMint = false,
  collectorStats = null
) {
  const timeText =
    minutesRemaining !== null && minutesRemaining > 0
      ? `\n${minutesRemaining} minute${
          minutesRemaining !== 1 ? "s" : ""
        } remain in mint window ${windowId}`
      : "";
  const mintedBy = isBountyMint
    ? `minted by ${minterDisplay} via bounty`
    : `minted by ${minterDisplay}`;

  // Build collector stats line (similar to secondary sales)
  let statsLine = "";
  if (collectorStats) {
    const { tokenCount, windowCount, totalWindows, isFullCollector } =
      collectorStats;
    if (isFullCollector) {
      statsLine = `\n\nowns ${tokenCount} LESS across all ${totalWindows} mint windows`;
    } else {
      statsLine = `\n\nowns ${tokenCount} LESS across ${windowCount}/${totalWindows} mint windows`;
    }
  }

  return `LESS ${tokenId} ${mintedBy}${timeText}${statsLine}

${formatUrlForTweet(`${BASE_URL}/${tokenId}`)}`;
}

// Format grouped mint tweet message (multiple tokens from same minter)
function formatGroupedMintTweet(
  tokenIds,
  minterDisplay,
  minutesRemaining = null,
  windowId = null,
  isBountyMint = false,
  collectorStats = null
) {
  // For single token, delegate to original function
  if (tokenIds.length === 1) {
    return formatMintTweet(
      tokenIds[0],
      minterDisplay,
      minutesRemaining,
      windowId,
      isBountyMint,
      collectorStats
    );
  }

  const tokenList = tokenIds.join(", ");
  const timeText =
    minutesRemaining !== null && minutesRemaining > 0
      ? `\n${minutesRemaining} minute${
          minutesRemaining !== 1 ? "s" : ""
        } remain in mint window ${windowId}`
      : "";
  const mintedBy = isBountyMint
    ? `minted by ${minterDisplay} via bounty`
    : `minted by ${minterDisplay}`;

  // Build collector stats line
  let statsLine = "";
  if (collectorStats) {
    const { tokenCount, windowCount, totalWindows, isFullCollector } =
      collectorStats;
    if (isFullCollector) {
      statsLine = `\n\nowns ${tokenCount} LESS across all ${totalWindows} mint windows`;
    } else {
      statsLine = `\n\nowns ${tokenCount} LESS across ${windowCount}/${totalWindows} mint windows`;
    }
  }

  return `LESS ${tokenList} ${mintedBy}${timeText}${statsLine}

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// Format 15-minute reminder tweet
function formatReminderTweet(windowId, minutesRemaining, mintCount = 0) {
  const mintText =
    mintCount === 1
      ? `${mintCount} piece minted so far`
      : `${mintCount} pieces minted so far`;

  return `~${minutesRemaining} minutes remain in mint window ${windowId}

${mintText}

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// ============================================================================
// SCHEDULED REMINDER SYSTEM
// Instead of polling every 60s, we schedule the exact time for the reminder
// based on the known window end time
// ============================================================================
let scheduledReminderTimeout = null;
let scheduledReminderWindowId = null;

/**
 * Schedule a 15-minute reminder for a window based on its end time.
 * This eliminates the need for polling - we know exactly when to fire.
 */
function scheduleReminder(context) {
  const {
    windowId,
    endTime,
    fifteenMinReminders,
    twitterClient,
    client,
    contractAddress,
    abi,
    saveStateFn,
  } = context;

  // Clear any existing scheduled reminder
  if (scheduledReminderTimeout) {
    clearTimeout(scheduledReminderTimeout);
    scheduledReminderTimeout = null;
  }

  // Skip if already reminded for this window
  if (fifteenMinReminders.has(windowId)) {
    logInfo(`Reminder already sent for window #${windowId}, not scheduling`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const reminderTime = Number(endTime) - 15 * 60; // 15 minutes before end
  const delayMs = (reminderTime - now) * 1000;

  // If reminder time has passed, check if we should still send it
  if (delayMs <= 0) {
    const timeRemaining = Number(endTime) - now;
    // If window is still active and we're in the reminder window (10-16 min remaining)
    if (timeRemaining > 600 && timeRemaining <= 960) {
      logInfo(`Reminder time passed but still in window, firing immediately`);
      fireReminder(context);
    } else if (timeRemaining > 0 && timeRemaining <= 600) {
      logInfo(`Less than 10 minutes remaining, skipping reminder`);
    } else {
      logInfo(`Window #${windowId} has ended, not scheduling reminder`);
    }
    return;
  }

  // Schedule the reminder
  const delayMinutes = Math.round(delayMs / 60000);
  logInfo(
    `Scheduling 15-min reminder for window #${windowId} in ${delayMinutes} minutes`
  );

  scheduledReminderWindowId = windowId;
  scheduledReminderTimeout = setTimeout(() => {
    fireReminder(context);
  }, delayMs);
}

/**
 * Fire the scheduled reminder - get mint count and post tweet
 * Includes retry logic with exponential backoff for reliability
 */
async function fireReminder(context, retryCount = 0) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 5000; // 5 seconds

  const {
    windowId,
    fifteenMinReminders,
    twitterClient,
    client,
    contractAddress,
    abi,
    saveStateFn,
  } = context;

  try {
    // Double-check we haven't already reminded
    if (fifteenMinReminders.has(windowId)) {
      logInfo(`Reminder already sent for window #${windowId}`);
      return;
    }

    logInfo(`Firing 15-minute reminder for window #${windowId}${retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRIES})` : ''}`);

    // Get mint count for this window
    let mintCount = 0;
    try {
      const currentBlock = await client.getBlockNumber();
      const mintLogs = await client.getLogs({
        address: contractAddress,
        event: parseAbiItem(
          "event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed)"
        ),
        args: { windowId: BigInt(windowId) },
        fromBlock: currentBlock - 10000n,
        toBlock: currentBlock,
      });
      mintCount = mintLogs.length;
    } catch (e) {
      logWarn(`Could not fetch mint count: ${e.message}`);
    }

    // Format and post tweet
    const tweetMessage = formatReminderTweet(windowId, 15, mintCount);

    logInfo("Posting 15-minute reminder tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Reminder tweet posted! Tweet ID: ${tweetId}`);
      fifteenMinReminders.add(windowId);
      if (saveStateFn) {
        saveStateFn();
      }
      // Clear state on success
      scheduledReminderTimeout = null;
      scheduledReminderWindowId = null;
    } else {
      // Post returned null/undefined - treat as failure
      throw new Error("postTweet returned falsy value");
    }
  } catch (error) {
    logError(`Error firing reminder: ${error.message}`);

    // Retry with exponential backoff if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount); // 5s, 10s, 20s
      logInfo(`Retrying reminder in ${delay / 1000} seconds...`);

      scheduledReminderTimeout = setTimeout(() => {
        fireReminder(context, retryCount + 1);
      }, delay);
    } else {
      logError(`Reminder failed after ${MAX_RETRIES} retries, giving up`);
      scheduledReminderTimeout = null;
      scheduledReminderWindowId = null;
    }
  }
}

/**
 * Clear any scheduled reminder (e.g., on shutdown)
 */
function clearScheduledReminder() {
  if (scheduledReminderTimeout) {
    clearTimeout(scheduledReminderTimeout);
    scheduledReminderTimeout = null;
    scheduledReminderWindowId = null;
  }
}

// Format tweet for when a new window is ready to be opened
function formatWindowReadyTweet() {
  return `a new LESS window is ready to open

minting will trigger a 0.25 ETH buy + burn of $LESS

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// Format tweet for when threshold is reached but TWAP delay is still active
function formatThresholdReachedTweet(
  currentBalance,
  threshold,
  windowId,
  timeUntilOpen
) {
  // Full progress bar (100%)
  const progressBar = "▓".repeat(20);

  // Format ETH amounts
  const currentEth = Number(formatEther(currentBalance));
  const thresholdEth = Number(formatEther(threshold));

  // Calculate when the window will open (ET timezone)
  const now = new Date();
  const openTime = new Date(now.getTime() + timeUntilOpen * 1000);
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
  const openTimeET = etFormatter.format(openTime).toLowerCase();

  // Calculate minutes until open
  const minutesUntilOpen = Math.ceil(timeUntilOpen / 60);

  return `$LESS buy + burn threshold reached

${progressBar} 100%
${formatEthValue(currentEth)} ETH / ${formatEthValue(thresholdEth)} ETH

mint window ${windowId} opens in ${minutesUntilOpen} minutes (${openTimeET} ET)

${formatUrlForTweet(`${BASE_URL}/mint`)}`;
}

// Format balance progress tweet with unicode progress bar
function formatBalanceProgressTweet(
  currentBalance,
  threshold,
  progressPercent,
  windowId,
  ethPrice = null,
  timeUntilOpen = 0,
  burnData = null,
  marketCap = null,
  activeBountiesCount = 0
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
    volumeText = `\n(~$${volumeNeededUsd.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} worth of $LESS trading volume)`;
  }

  // Format percentages
  const percentStr = progressPercent.toFixed(1);

  // Build market stats line (market cap + burn %)
  let marketStatsLine = "";
  if (marketCap || burnData?.supplyRemaining) {
    const parts = [];
    if (marketCap) {
      const mcFormatted =
        marketCap >= 1000000
          ? `$${(marketCap / 1000000).toFixed(2)}M`
          : `$${(marketCap / 1000).toFixed(0)}K`;
      parts.push(`${mcFormatted} mcap`);
    }
    if (burnData?.supplyRemaining) {
      const burnedPercent = (100 - Number(burnData.supplyRemaining)).toFixed(2);
      parts.push(`${burnedPercent}% burned`);
    }
    if (parts.length > 0) {
      marketStatsLine = `\n\n${parts.join(" / ")}`;
    }
  }

  // Build bounty line if there are active bounties waiting
  const bountyLine =
    activeBountiesCount > 0
      ? `\n${activeBountiesCount} bounty mint${
          activeBountiesCount !== 1 ? "s" : ""
        } awaiting window`
      : "";

  return `$LESS buy + burn balance progress to mint window ${windowId}

${progressBar} ${percentStr}%
${formatEthValue(currentEth)} ETH / ${formatEthValue(thresholdEth)} ETH

${
  remainingEth > 0
    ? `${formatEthValue(remainingEth)} ETH needed${volumeText}`
    : ""
}${
    remainingEth <= 0 && timeUntilOpen > 0
      ? `\nthreshold reached! opens in ${Math.floor(
          timeUntilOpen / 60
        )}:${String(timeUntilOpen % 60).padStart(2, "0")}`
      : remainingEth <= 0
      ? `\nready to open!`
      : ""
  }${bountyLine}${marketStatsLine}`;
}

// Fetch NFT sales from OpenSea API
async function fetchNFTSales(fromBlock, toBlock) {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    logWarn("OPENSEA_API_KEY not set, skipping sales check");
    return [];
  }

  const collectionSlug = "say-less";
  const url = `https://api.opensea.io/api/v2/events/collection/${collectionSlug}?event_type=sale&limit=50`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`OpenSea API returned ${response.status}: ${errorText}`);
      return [];
    }

    const data = await response.json();
    const events = data.asset_events || [];

    // Transform OpenSea format to our expected format
    return events.map((event) => ({
      buyerAddress: event.buyer,
      sellerAddress: event.seller,
      tokenId: event.nft?.identifier || "0",
      transactionHash: event.transaction,
      // OpenSea gives us the total payment directly
      payment: {
        amount: event.payment?.quantity || "0",
        symbol: event.payment?.symbol || "ETH",
      },
      eventTimestamp: event.event_timestamp,
    }));
  } catch (error) {
    logError(`Failed to fetch NFT sales: ${error.message}`);
    return [];
  }
}

// Check if royalty was paid in a Seaport sale by looking for WETH transfers to royalty recipient
async function getRoyaltyFromTransaction(txHash, client) {
  const ROYALTY_RECIPIENT = "0x76b861d8f0e802d74f78793545ff82b1fde0fe36";
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  // WETH Transfer(address,address,uint256) event signature
  const TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    let royaltyPaid = 0n;

    for (const log of receipt.logs) {
      // Check for WETH transfer to royalty recipient
      if (
        log.address.toLowerCase() === WETH_ADDRESS &&
        log.topics[0] === TRANSFER_TOPIC &&
        log.topics[2]
      ) {
        // topics[2] is the 'to' address, padded to 32 bytes
        const toAddress = "0x" + log.topics[2].slice(26).toLowerCase();
        if (toAddress === ROYALTY_RECIPIENT) {
          royaltyPaid += BigInt(log.data);
        }
      }
    }

    if (royaltyPaid > 0n) {
      const ethValue = formatEther(royaltyPaid);
      logInfo(`Royalty detected: ${ethValue} ETH to ${ROYALTY_RECIPIENT}`);
      return ethValue;
    }

    return null;
  } catch (error) {
    logWarn(`Failed to get royalty info: ${error.message}`);
    return null;
  }
}

// Get collector stats for an address - token count and windows covered
async function getCollectorStats(address, client, contractAddress, abi) {
  try {
    // First get totalSupply and windowCount
    const [totalSupply, totalWindows] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi,
        functionName: "totalSupply",
      }),
      client.readContract({
        address: contractAddress,
        abi,
        functionName: "windowCount",
      }),
    ]);

    const supply = Number(totalSupply);
    const windows = Number(totalWindows) + 1; // +1 to include Window 0

    if (supply === 0) {
      return {
        tokenCount: 0,
        windowCount: 0,
        totalWindows: windows,
        isFullCollector: false,
      };
    }

    // Use multicall to batch ownerOf and getTokenData calls
    // We'll check all tokens and filter by owner
    const BATCH_SIZE = 100;
    const collectedTokens = [];
    const windowsSet = new Set();

    for (let start = 1; start <= supply; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, supply);
      const tokenIds = [];
      for (let i = start; i <= end; i++) {
        tokenIds.push(i);
      }

      // Batch fetch owner and windowId for each token
      const calls = tokenIds.flatMap((tokenId) => [
        {
          address: contractAddress,
          abi,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        },
        {
          address: contractAddress,
          abi,
          functionName: "getTokenData",
          args: [BigInt(tokenId)],
        },
      ]);

      const results = await client.multicall({ contracts: calls });

      // Process results (2 results per token: owner, tokenData)
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        const ownerResult = results[i * 2];
        const tokenDataResult = results[i * 2 + 1];

        if (
          ownerResult.status === "success" &&
          tokenDataResult.status === "success"
        ) {
          const owner = ownerResult.result.toLowerCase();
          if (owner === address.toLowerCase()) {
            collectedTokens.push(tokenId);
            // getTokenData returns { windowId, seed } - extract windowId
            const windowId =
              tokenDataResult.result.windowId ?? tokenDataResult.result;
            windowsSet.add(Number(windowId));
          }
        }
      }
    }

    const tokenCount = collectedTokens.length;
    const windowCount = windowsSet.size;
    const isFullCollector = windowCount === windows;

    logInfo(
      `Collector stats for ${address.slice(
        0,
        8
      )}...: ${tokenCount} tokens, ${windowCount}/${windows} windows${
        isFullCollector ? " (FULL)" : ""
      }`
    );

    return { tokenCount, windowCount, totalWindows: windows, isFullCollector };
  } catch (error) {
    logWarn(`Failed to get collector stats: ${error.message}`);
    return null;
  }
}

// Format sale tweet - handles single or multiple tokens
function formatSaleTweet(
  tokenIds,
  buyerDisplay,
  priceEth,
  collectorStats = null,
  windowIds = null,
  royaltyEth = null,
  buyBurnBalanceEth = null
) {
  const isSingle = tokenIds.length === 1;

  // Build token list with window IDs in parentheses
  let tokenList;
  if (windowIds && windowIds.length === tokenIds.length) {
    tokenList = tokenIds
      .map((id, i) => `${id} (window ${windowIds[i]})`)
      .join(", ");
  } else {
    tokenList = tokenIds.join(", ");
  }

  // Build collector stats line
  let statsLine = "";
  if (collectorStats) {
    const { tokenCount, windowCount, totalWindows, isFullCollector } =
      collectorStats;
    if (isFullCollector) {
      statsLine = `\n\nowns ${tokenCount} LESS across all ${totalWindows} mint windows`;
    } else {
      statsLine = `\n\nowns ${tokenCount} LESS across ${windowCount}/${totalWindows} mint windows`;
    }
  }

  // Build royalty line if royalty was paid
  let royaltyLine = "";
  if (royaltyEth) {
    const formattedRoyalty = formatEthValue(royaltyEth);
    const balancePart = buyBurnBalanceEth
      ? ` (${formatEthValue(buyBurnBalanceEth)} ETH)`
      : "";
    royaltyLine = `\n\n${formattedRoyalty} ETH added to $LESS buy + burn balance${balancePart}`;
  }

  if (isSingle) {
    return `LESS ${tokenList} acquired for ${priceEth} ETH by ${buyerDisplay}${statsLine}${royaltyLine}`;
  } else {
    // Multiple tokens bought by same collector
    return `LESS ${tokenList} acquired for ${priceEth} ETH by ${buyerDisplay}${statsLine}${royaltyLine}`;
  }
}

// Process grouped sales (same buyer) as a single tweet
async function processGroupedSales(
  sales,
  processedSales,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    // All sales should have same buyer
    const buyer = sales[0].buyerAddress;
    const tokenIds = sales
      .map((s) => parseInt(s.tokenId, 10))
      .sort((a, b) => a - b);
    const txHashes = sales.map((s) => s.transactionHash);

    // Skip if any tx already processed
    if (txHashes.some((hash) => processedSales.has(hash))) {
      logInfo(
        `Skipping already processed sales for tokens: ${tokenIds.join(", ")}`
      );
      return false;
    }

    // Calculate total price across all sales
    let totalPrice = 0n;
    for (const sale of sales) {
      // OpenSea gives us the payment amount directly
      const paymentAmount = BigInt(sale.payment?.amount || "0");
      totalPrice += paymentAmount;
    }
    const priceEth = formatEthValue(formatEther(totalPrice));

    logInfo(
      `Detected ${sales.length > 1 ? "multi-token " : ""}sale: token${
        sales.length > 1 ? "s" : ""
      } #${tokenIds.join(", #")} for ${priceEth} ETH`
    );

    // Resolve display name (Twitter handle > ENS > truncated address)
    const buyerDisplay = await resolveDisplayName(buyer);

    // Get collector stats for the buyer
    const collectorStats = await getCollectorStats(
      buyer,
      client,
      contractAddress,
      abi
    );

    // Fetch window IDs for the sold tokens
    let windowIds = null;
    try {
      const windowCalls = tokenIds.map((tokenId) => ({
        address: contractAddress,
        abi,
        functionName: "getTokenData",
        args: [BigInt(tokenId)],
      }));
      const windowResults = await client.multicall({ contracts: windowCalls });
      windowIds = windowResults.map((result) => {
        if (result.status === "success") {
          return Number(result.result.windowId ?? result.result);
        }
        return null;
      });
      // If any failed, set to null so we fall back to no window display
      if (windowIds.some((w) => w === null)) {
        windowIds = null;
      }
    } catch (error) {
      logWarn(`Failed to fetch window IDs: ${error.message}`);
    }

    // Check for royalty payments across all transactions
    let totalRoyaltyEth = null;
    let buyBurnBalanceEth = null;
    try {
      // Get unique tx hashes (in case of multi-token purchase in single tx)
      const uniqueTxHashes = [...new Set(txHashes)];
      let totalRoyaltyWei = 0n;
      for (const txHash of uniqueTxHashes) {
        const royalty = await getRoyaltyFromTransaction(txHash, client);
        if (royalty) {
          totalRoyaltyWei += BigInt(Math.floor(parseFloat(royalty) * 1e18));
        }
      }
      if (totalRoyaltyWei > 0n) {
        totalRoyaltyEth = formatEther(totalRoyaltyWei);
        // Fetch current balance of strategy contract (where buy+burn funds accumulate)
        const strategyAddress = await client.readContract({
          address: contractAddress,
          abi,
          functionName: "strategy",
        });
        if (strategyAddress && strategyAddress !== "0x0000000000000000000000000000000000000000") {
          const balance = await client.getBalance({ address: strategyAddress });
          buyBurnBalanceEth = formatEther(balance);
          logInfo(`Buy+burn balance: ${buyBurnBalanceEth} ETH`);
        }
      }
    } catch (error) {
      logWarn(`Failed to fetch royalty info: ${error.message}`);
    }

    // For multi-token sales, use a grid image to show all tokens
    let imageBuffers = [];
    if (tokenIds.length > 1) {
      try {
        const gridImage = await createGridImage(tokenIds);
        imageBuffers = [gridImage];
      } catch (error) {
        logWarn(
          `Grid creation failed, falling back to individual images: ${error.message}`
        );
        // Fall back to individual images (up to 4)
        for (const tokenId of tokenIds.slice(0, 4)) {
          const imageBuffer = await fetchImage(tokenId);
          if (imageBuffer) imageBuffers.push(imageBuffer);
        }
      }
    } else {
      // Single token - just fetch the one image
      const imageBuffer = await fetchImage(tokenIds[0]);
      if (imageBuffer) imageBuffers.push(imageBuffer);
    }

    if (imageBuffers.length === 0) {
      logWarn(
        `Skipping sale tweet - no images available for tokens: ${tokenIds.join(
          ", "
        )}`
      );
      return false;
    }

    // Format and post tweet with collector stats, window IDs, and royalty
    const tweetMessage = formatSaleTweet(
      tokenIds,
      buyerDisplay,
      priceEth,
      collectorStats,
      windowIds,
      totalRoyaltyEth,
      buyBurnBalanceEth
    );

    logInfo("Posting sale tweet...");
    const tweetId = await postTweetWithMultipleImages(
      twitterClient,
      tweetMessage,
      imageBuffers
    );

    if (tweetId) {
      logSuccess(`Sale tweet posted! Tweet ID: ${tweetId}`);
      // Mark all tx hashes as processed
      for (const hash of txHashes) {
        processedSales.add(hash);
      }
      return true;
    }
    return false;
  } catch (error) {
    logError(`Error processing grouped sales: ${error.message}`);
    return false;
  }
}

// Post tweet with multiple images (up to 4)
async function postTweetWithMultipleImages(
  twitterClient,
  message,
  imageBuffers
) {
  // In dry-run or test mode, just preview
  if (
    dryRun ||
    testMode ||
    testMintMode ||
    testReminderMode ||
    testWindowReadyMode ||
    testBalanceProgressMode
  ) {
    displayTweetPreview(message);
    logInfo(`[DRY-RUN] Would attach ${imageBuffers.length} image(s)`);
    return "dry-run-id";
  }

  try {
    const mediaIds = [];

    // Upload all images
    for (let i = 0; i < imageBuffers.length && i < 4; i++) {
      const mediaId = await twitterClient.v1.uploadMedia(imageBuffers[i], {
        mimeType: "image/png",
      });
      mediaIds.push(mediaId);
      logSuccess(`Image ${i + 1} uploaded, media_id: ${mediaId}`);
    }

    // Post tweet with all media
    const tweetOptions =
      mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {};
    const tweet = await twitterClient.v2.tweet(message, tweetOptions);
    return tweet.data.id;
  } catch (error) {
    if (error.code === 187) {
      logError("Tweet failed: duplicate content");
      return null;
    }
    if (error.code === 429 || error.message?.includes("429")) {
      const waitSeconds = error.rateLimit?.reset
        ? Math.max(error.rateLimit.reset - Math.floor(Date.now() / 1000), 60)
        : 900;
      logWarn(
        `Rate limited. Waiting ${Math.ceil(waitSeconds / 60)} minutes...`
      );
      await sleep(waitSeconds * 1000);
      // Retry without images
      const tweet = await twitterClient.v2.tweet(message);
      return tweet.data.id;
    }
    logError(`Tweet failed: ${error.message}`);
    return null;
  }
}

// Check for and process NFT sales
async function processSalesCheck(
  processedSales,
  lastSalesTimestamp,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // On first run (no lastSalesTimestamp), set to current time to avoid posting historical sales
    if (lastSalesTimestamp === 0) {
      logInfo(
        "First sales check run - setting baseline timestamp to now (no historical posts)"
      );
      return { processed: 0, lastTimestamp: currentTimestamp };
    }

    // Fetch recent sales from OpenSea
    const allSales = await fetchNFTSales();

    if (allSales.length === 0) {
      return { processed: 0, lastTimestamp: lastSalesTimestamp };
    }

    // Filter to only sales AFTER our last check
    const newSales = allSales.filter(
      (sale) => sale.eventTimestamp > lastSalesTimestamp
    );

    if (newSales.length === 0) {
      return { processed: 0, lastTimestamp: lastSalesTimestamp };
    }

    logInfo(
      `Found ${newSales.length} new sale(s) to process (after timestamp ${lastSalesTimestamp})`
    );

    // Group sales by buyer address (for multi-token purchases)
    const salesByBuyer = new Map();
    for (const sale of newSales) {
      const buyerKey = sale.buyerAddress.toLowerCase();
      if (!salesByBuyer.has(buyerKey)) {
        salesByBuyer.set(buyerKey, []);
      }
      salesByBuyer.get(buyerKey).push(sale);
    }

    let processedCount = 0;
    let newestTimestamp = lastSalesTimestamp;

    for (const [buyer, buyerSales] of salesByBuyer) {
      const success = await processGroupedSales(
        buyerSales,
        processedSales,
        twitterClient,
        client,
        contractAddress,
        abi
      );
      if (success) {
        processedCount++;
        // Track the newest timestamp we've processed
        for (const sale of buyerSales) {
          if (sale.eventTimestamp > newestTimestamp) {
            newestTimestamp = sale.eventTimestamp;
          }
        }
        // Delay between tweets to avoid rate limiting
        if (salesByBuyer.size > 1) {
          await sleep(5000);
        }
      }
    }

    return { processed: processedCount, lastTimestamp: newestTimestamp };
  } catch (error) {
    logError(`Sales check error: ${error.message}`);
    return { processed: 0, lastTimestamp: lastSalesTimestamp };
  }
}

// Resolve ENS name for an address (always uses mainnet since ENS lives there)
// Checks leaderboard cache first for better performance
async function resolveEns(address) {
  try {
    // Check leaderboard cache first (ENS names are indexed by image-api)
    const cachedEns = await getEnsFromLeaderboard(address);
    if (cachedEns) {
      logInfo(`Resolved ENS from leaderboard: ${address} -> ${cachedEns}`);
      return cachedEns;
    }

    // Fall back to RPC lookup using singleton client
    const client = getMainnetClient();
    if (!client) {
      return null;
    }
    const ensName = await client.getEnsName({ address });
    if (ensName) {
      logInfo(`Resolved ENS: ${address} -> ${ensName}`);
    }
    return ensName;
  } catch (error) {
    logWarn(`ENS lookup failed: ${error.message}`);
    return null;
  }
}

// Resolve Twitter handle from Farcaster via Neynar API
async function resolveFarcasterTwitterHandle(address) {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      return null;
    }

    const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    // Response is keyed by address (lowercase)
    const users = data[address.toLowerCase()];
    if (!users || users.length === 0) {
      return null;
    }

    // Check verified_accounts for X/Twitter
    const user = users[0];
    if (user.verified_accounts && Array.isArray(user.verified_accounts)) {
      const xAccount = user.verified_accounts.find(
        (acc) => acc.platform === "x"
      );
      if (xAccount && xAccount.username) {
        logInfo(
          `Resolved Twitter from Farcaster: ${address} -> @${xAccount.username}`
        );
        return xAccount.username;
      }
    }

    return null;
  } catch (error) {
    logWarn(`Farcaster lookup failed: ${error.message}`);
    return null;
  }
}

// Resolve Twitter handle from ENS text records
// Uses singleton client for better performance
async function resolveTwitterHandle(address) {
  try {
    const client = getMainnetClient();
    if (!client) {
      return null;
    }

    // First get ENS name for the address (check leaderboard cache first)
    let ensName = await getEnsFromLeaderboard(address);
    if (!ensName) {
      ensName = await client.getEnsName({ address });
    }
    if (!ensName) {
      return null;
    }

    // Try com.twitter first (standard ENS text record), then twitter
    let handle = await client.getEnsText({
      name: ensName,
      key: "com.twitter",
    });
    if (!handle) {
      handle = await client.getEnsText({
        name: ensName,
        key: "twitter",
      });
    }

    if (handle) {
      // Extract handle from URL if needed (e.g., https://twitter.com/username or https://x.com/username)
      const urlMatch = handle.match(
        /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i
      );
      if (urlMatch) {
        handle = urlMatch[1];
      }
      // Strip @ if present
      handle = handle.replace(/^@/, "");
      logInfo(`Resolved Twitter from ENS: ${address} -> @${handle}`);
    }
    return handle || null;
  } catch (error) {
    logWarn(`Twitter handle lookup failed: ${error.message}`);
    return null;
  }
}

// Resolve display name with priority: cached handle > Farcaster > ENS Twitter > ENS name > truncated address
async function resolveDisplayName(address) {
  // 1. Check cache first (twitter-handles.json)
  const cachedHandle = twitterHandles[address.toLowerCase()];
  if (cachedHandle) {
    logInfo(`Resolved Twitter from cache: ${address} -> @${cachedHandle}`);
    return `@${cachedHandle}`;
  }

  // 2. Try Farcaster connected Twitter (via Neynar)
  const farcasterHandle = await resolveFarcasterTwitterHandle(address);
  if (farcasterHandle) {
    saveTwitterHandle(address, farcasterHandle);
    return `@${farcasterHandle}`;
  }

  // 3. Try ENS Twitter handle
  const twitterHandle = await resolveTwitterHandle(address);
  if (twitterHandle) {
    saveTwitterHandle(address, twitterHandle);
    return `@${twitterHandle}`;
  }

  // 4. Try ENS name
  const ensName = await resolveEns(address);
  if (ensName) {
    return ensName;
  }

  // 5. Fallback to truncated address
  return truncateAddress(address);
}

// Bounty factory address and ABI for detecting bounty mints
const BOUNTY_FACTORY_ADDRESS = "0x8536a04b2606C9D14Ac1956fFB82Dc988E6e2c0D";
const BOUNTY_FACTORY_ABI = [
  {
    name: "getAllBounties",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    name: "totalBounties",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getBountyStatuses",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "bountyAddress", type: "address" },
          { name: "owner", type: "address" },
          { name: "canClaim", type: "bool" },
          { name: "reward", type: "uint256" },
          { name: "totalCost", type: "uint256" },
          { name: "balance", type: "uint256" },
          { name: "currentWindowId", type: "uint256" },
          { name: "windowActive", type: "bool" },
        ],
      },
    ],
  },
];
const BOUNTY_ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];

// Check if a minter address is a bounty contract and return the bounty owner
async function checkIfBountyMint(minterAddress, client) {
  try {
    // Get all bounty addresses from the factory
    const allBounties = await client.readContract({
      address: BOUNTY_FACTORY_ADDRESS,
      abi: BOUNTY_FACTORY_ABI,
      functionName: "getAllBounties",
    });

    // Check if minter is in the list of bounties
    const isBounty = allBounties.some(
      (bounty) => bounty.toLowerCase() === minterAddress.toLowerCase()
    );

    if (!isBounty) {
      return null;
    }

    // Get the bounty owner
    const owner = await client.readContract({
      address: minterAddress,
      abi: BOUNTY_ABI,
      functionName: "owner",
    });

    logInfo(`Detected bounty mint: bounty=${minterAddress}, owner=${owner}`);
    return owner;
  } catch (error) {
    logWarn(`Bounty check failed: ${error.message}`);
    return null;
  }
}

// Get count of active bounties that can fund the next window
async function getActiveBountiesCount(client, contractAddress) {
  try {
    // Get total bounties count
    const totalBounties = await client.readContract({
      address: BOUNTY_FACTORY_ADDRESS,
      abi: BOUNTY_FACTORY_ABI,
      functionName: "totalBounties",
    });

    if (!totalBounties || totalBounties === 0n) {
      return 0;
    }

    // Get bounty statuses (fetch first 50)
    const bountyStatuses = await client.readContract({
      address: BOUNTY_FACTORY_ADDRESS,
      abi: BOUNTY_FACTORY_ABI,
      functionName: "getBountyStatuses",
      args: [0n, 50n],
    });

    if (!bountyStatuses || bountyStatuses.length === 0) {
      return 0;
    }

    // Get base mint price from the LESS contract
    const baseMintPrice = await client.readContract({
      address: contractAddress,
      abi: [
        {
          name: "mintPrice",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "mintPrice",
    });

    // Check if window is active (we already know it's not when calling from balance progress)
    // But we'll check anyway for accurate counting
    const isWindowActive = await client.readContract({
      address: contractAddress,
      abi: [
        {
          name: "isWindowActive",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "isWindowActive",
    });

    // Count bounties that can fund the next window
    let activeCount = 0;
    for (const bounty of bountyStatuses) {
      let estimatedCost;
      if (isWindowActive) {
        // Window is active - use on-chain totalCost (includes escalating pricing)
        estimatedCost = bounty.totalCost;
      } else {
        // Window is NOT active - estimate using base mint price (mint counts will reset)
        estimatedCost = baseMintPrice + bounty.reward;
      }

      if (bounty.balance >= estimatedCost && estimatedCost > 0n) {
        activeCount++;
      }
    }

    return activeCount;
  } catch (error) {
    logWarn(`Failed to get active bounties count: ${error.message}`);
    return 0;
  }
}

// Process a Minted event
async function processMintEvent(
  log,
  processedMints,
  pendingMints,
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

    // Check if this is a bounty mint
    const bountyOwner = await checkIfBountyMint(minter, client);
    let minterDisplay;
    let bountyOwnerDisplay = null;

    if (bountyOwner) {
      // Bounty mint - resolve the bounty owner's display name
      bountyOwnerDisplay = await resolveDisplayName(bountyOwner);
      minterDisplay = bountyOwnerDisplay;
      logInfo(`Bounty owner display: ${bountyOwnerDisplay}`);
    } else {
      // Regular mint - resolve the minter's display name
      minterDisplay = await resolveDisplayName(minter);
    }

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

    // If image failed, add to pending mints for retry
    if (!imageBuffer) {
      const existing = pendingMints.get(Number(tokenId));
      const retries = existing ? existing.retries + 1 : 0;
      const maxPendingRetries = 10;

      if (retries >= maxPendingRetries) {
        logError(`Giving up on mint #${tokenId} after ${retries} retries`);
        // Mark as processed so we don't keep trying forever
        processedMints.add(Number(tokenId));
        pendingMints.delete(Number(tokenId));
      } else {
        pendingMints.set(Number(tokenId), {
          windowId: Number(windowId),
          minter,
          seed,
          retries,
          addedAt: existing?.addedAt || Date.now(),
        });
        logWarn(
          `Added mint #${tokenId} to pending queue (retry ${retries}/${maxPendingRetries}) - will retry on next poll`
        );
      }
      return;
    }

    // Get collector stats for the minter (use bounty owner if bounty mint)
    const collectorAddress = bountyOwner || minter;
    const abi = loadContractABI();
    const collectorStats = await getCollectorStats(
      collectorAddress,
      client,
      contractAddress,
      abi
    );

    // Format and post tweet with image
    const tweetMessage = formatMintTweet(
      Number(tokenId),
      minterDisplay,
      minutesRemaining,
      windowId,
      bountyOwnerDisplay !== null, // isBountyMint
      collectorStats
    );

    logInfo("Posting mint tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage, imageBuffer);

    if (tweetId) {
      logSuccess(`Mint tweet posted! Tweet ID: ${tweetId}`);
      processedMints.add(Number(tokenId));
      pendingMints.delete(Number(tokenId)); // Remove from pending if it was there
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

// Process grouped mints (same minter) as a single tweet
async function processGroupedMints(
  logs,
  processedMints,
  pendingMints,
  twitterClient,
  client,
  contractAddress
) {
  try {
    // All logs should have same minter
    const minter = logs[0].args.minter;
    const windowId = logs[0].args.windowId;
    const tokenIds = logs
      .map((log) => Number(log.args.tokenId))
      .sort((a, b) => a - b);

    // Skip any already processed tokens
    const unprocessedTokenIds = tokenIds.filter(
      (id) => !processedMints.has(id)
    );
    if (unprocessedTokenIds.length === 0) {
      logInfo(
        `Skipping already processed mints for tokens: ${tokenIds.join(", ")}`
      );
      return;
    }

    logInfo(
      `Detected ${unprocessedTokenIds.length > 1 ? "multi-token " : ""}mint: token${
        unprocessedTokenIds.length > 1 ? "s" : ""
      } #${unprocessedTokenIds.join(", #")} by ${minter}`
    );

    // Check if this is a bounty mint (same for all tokens since same minter)
    const bountyOwner = await checkIfBountyMint(minter, client);
    let minterDisplay;
    const isBountyMint = bountyOwner !== null;

    if (bountyOwner) {
      minterDisplay = await resolveDisplayName(bountyOwner);
      logInfo(`Bounty owner display: ${minterDisplay}`);
    } else {
      minterDisplay = await resolveDisplayName(minter);
    }

    // Fetch remaining time in window (same for all tokens since same window)
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

    // Fetch images for all tokens with retry logic
    let imageBuffers = [];
    const maxRetries = 3;
    const retryDelay = 2000;

    if (unprocessedTokenIds.length > 1) {
      // Try grid image first for multiple tokens
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const gridImage = await createGridImage(unprocessedTokenIds);
          imageBuffers = [gridImage];
          break;
        } catch (error) {
          if (attempt < maxRetries) {
            logWarn(
              `Grid creation attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelay}ms: ${error.message}`
            );
            await sleep(retryDelay);
          } else {
            logWarn(
              `Grid creation failed after ${maxRetries} attempts, falling back to individual images: ${error.message}`
            );
            // Fall back to individual images (up to 4)
            for (const tokenId of unprocessedTokenIds.slice(0, 4)) {
              for (let imgAttempt = 1; imgAttempt <= maxRetries; imgAttempt++) {
                const imageBuffer = await fetchImage(tokenId);
                if (imageBuffer) {
                  imageBuffers.push(imageBuffer);
                  break;
                }
                if (imgAttempt < maxRetries) {
                  logWarn(
                    `Image fetch attempt ${imgAttempt}/${maxRetries} failed for token ${tokenId}, retrying...`
                  );
                  await sleep(retryDelay);
                }
              }
            }
          }
        }
      }
    } else {
      // Single token - fetch with retry
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const imageBuffer = await fetchImage(unprocessedTokenIds[0]);
        if (imageBuffer) {
          imageBuffers.push(imageBuffer);
          break;
        }
        if (attempt < maxRetries) {
          logWarn(
            `Image fetch attempt ${attempt}/${maxRetries} failed for token ${unprocessedTokenIds[0]}, retrying in ${retryDelay}ms...`
          );
          await sleep(retryDelay);
        }
      }
    }

    // If still no images after retries, add to pending for later
    if (imageBuffers.length === 0) {
      logWarn(
        `No images available after retries for tokens: ${unprocessedTokenIds.join(", ")} - adding to pending queue`
      );
      for (const log of logs) {
        const tokenId = Number(log.args.tokenId);
        if (!processedMints.has(tokenId)) {
          const existing = pendingMints.get(tokenId);
          pendingMints.set(tokenId, {
            windowId: Number(log.args.windowId),
            minter: log.args.minter,
            seed: log.args.seed,
            retries: existing ? existing.retries + 1 : 0,
            addedAt: existing?.addedAt || Date.now(),
          });
        }
      }
      return;
    }

    // Get collector stats for the minter (use bounty owner if bounty mint)
    const collectorAddress = bountyOwner || minter;
    const abi = loadContractABI();
    const collectorStats = await getCollectorStats(
      collectorAddress,
      client,
      contractAddress,
      abi
    );

    // Format and post tweet
    const tweetMessage = formatGroupedMintTweet(
      unprocessedTokenIds,
      minterDisplay,
      minutesRemaining,
      windowId,
      isBountyMint,
      collectorStats
    );

    logInfo("Posting mint tweet...");
    const tweetId = await postTweetWithMultipleImages(
      twitterClient,
      tweetMessage,
      imageBuffers
    );

    if (tweetId) {
      logSuccess(`Mint tweet posted! Tweet ID: ${tweetId}`);
      // Mark all tokens as processed
      for (const tokenId of unprocessedTokenIds) {
        processedMints.add(tokenId);
        pendingMints.delete(tokenId);
      }
    } else {
      logError("Failed to post mint tweet");
    }
  } catch (error) {
    logError(`Error processing grouped mints: ${error.message}`);
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

    // Get mint count for this window
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;
    const tokenIds = await getMintsForWindow(
      client,
      contractAddress,
      windowId,
      fromBlock
    );
    const mintCount = tokenIds.length;

    // Format and post tweet
    const tweetMessage = formatReminderTweet(
      windowId,
      minutesRemaining,
      mintCount
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
// Minimizes empty cells while preferring reasonable aspect ratios (not too wide or tall)
function calculateGridDimensions(count) {
  if (count <= 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };

  let best = { cols: count, rows: 1, score: Infinity };

  // Try all possible row counts
  const maxRows = count;

  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(count / rows);
    if (cols < rows) break; // Only consider landscape or square (cols >= rows)

    const waste = cols * rows - count;
    const ratio = cols / rows;

    // Ideal ratio is around 1.5-2 (mild landscape). Penalize extremes.
    // Single row (ratio=10) or near-square with lots of waste are both bad.
    const idealRatio = 1.5;
    const ratioPenalty = Math.abs(ratio - idealRatio) * 2;
    const wastePenalty = waste * 1.5;
    const score = wastePenalty + ratioPenalty;

    if (score < best.score) {
      best = { cols, rows, score };
    }
  }

  return { cols: best.cols, rows: best.rows };
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
function formatWindowEndTweet(
  windowId,
  mintCount,
  tokenIds,
  progressInfo = null
) {
  const tokenRange =
    tokenIds.length > 0
      ? tokenIds.length === 1
        ? `token ${tokenIds[0]}`
        : `tokens ${tokenIds[0]}-${tokenIds[tokenIds.length - 1]}`
      : "no tokens";

  let progressLine = "";
  if (progressInfo) {
    const { currentBalance, minEthForWindow, progressPercent, nextWindowId } =
      progressInfo;
    const balanceEth = formatEthValue(formatEther(currentBalance));
    const thresholdEth = formatEthValue(formatEther(minEthForWindow));

    // Create progress bar
    const barLength = 15;
    const filledBlocks = Math.floor((progressPercent / 100) * barLength);
    let progressBar =
      "▓".repeat(filledBlocks) + "░".repeat(barLength - filledBlocks);

    progressLine = `\n\nprogress to LESS mint window ${nextWindowId}:\n${progressBar} ${progressPercent.toFixed(
      0
    )}%`;
  }

  return `LESS mint window ${windowId} closed

${mintCount} pieces minted
${tokenRange}${progressLine}

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
    const [currentBalance, windowCount, timeUntilFundsMoved] =
      await Promise.all([
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

    // Fetch ETH price, burn data, market cap, and active bounties in parallel
    const [ethPrice, burnData, marketCap, activeBountiesCount] =
      await Promise.all([
        fetchEthPrice(),
        fetchBurnData(client, contractAddress, abi),
        fetchLessMarketCap(),
        getActiveBountiesCount(client, contractAddress),
      ]);

    logInfo(
      `Balance progress: ${formatEther(currentBalance)} ETH / ${formatEther(
        minEthForWindow
      )} ETH (${progressPercent.toFixed(
        1
      )}%), ${activeBountiesCount} active bounties`
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
    if (marketCap) {
      logInfo(`Market cap: $${marketCap.toLocaleString()}`);
    }
    if (burnData?.supplyRemaining) {
      logInfo(
        `Supply burned: ${(100 - Number(burnData.supplyRemaining)).toFixed(2)}%`
      );
    }

    // Format and post tweet
    const tweetMessage = formatBalanceProgressTweet(
      currentBalance,
      minEthForWindow,
      progressPercent,
      nextWindowId,
      ethPrice,
      Number(timeUntilFundsMoved),
      burnData,
      marketCap,
      activeBountiesCount
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

// Process threshold reached check - posts once when balance >= threshold but TWAP delay is active
async function processThresholdReachedCheck(
  thresholdReachedAlerted,
  twitterClient,
  client,
  contractAddress,
  abi
) {
  try {
    // Get strategy address and minEthForWindow
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
      return { alerted: thresholdReachedAlerted, shouldReset: false };
    }

    // Get current balance and timeUntilFundsMoved
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

    const thresholdMet = currentBalance >= minEthForWindow;
    const twapDelayActive = Number(timeUntilFundsMoved) > 0;

    // If threshold not met, reset the alert state
    if (!thresholdMet) {
      return { alerted: false, shouldReset: true };
    }

    // If threshold met but TWAP delay is done (window ready), don't post this tweet
    // The windowReadyCheck will handle it
    if (!twapDelayActive) {
      return { alerted: thresholdReachedAlerted, shouldReset: false };
    }

    // If we've already alerted for this threshold reached state, skip
    if (thresholdReachedAlerted) {
      return { alerted: true, shouldReset: false };
    }

    // Threshold is met and TWAP delay is active - post the tweet!
    const nextWindowId = Number(windowCount) + 1;
    logInfo(
      `Threshold reached! Balance: ${formatEther(currentBalance)} ETH >= ${formatEther(minEthForWindow)} ETH. TWAP delay: ${timeUntilFundsMoved}s`
    );

    // Format and post tweet
    const tweetMessage = formatThresholdReachedTweet(
      currentBalance,
      minEthForWindow,
      nextWindowId,
      Number(timeUntilFundsMoved)
    );

    logInfo("Posting threshold reached tweet...");
    const tweetId = await postTweet(twitterClient, tweetMessage);

    if (tweetId) {
      logSuccess(`Threshold reached tweet posted! Tweet ID: ${tweetId}`);
      return { alerted: true, shouldReset: false };
    } else {
      logError("Failed to post threshold reached tweet");
      return { alerted: false, shouldReset: false };
    }
  } catch (error) {
    // Silently handle contract errors
    if (
      error.message?.includes("revert") ||
      error.message?.includes("execution reverted")
    ) {
      return { alerted: thresholdReachedAlerted, shouldReset: false };
    }
    logError(`Error checking threshold reached: ${error.message}`);
    return { alerted: thresholdReachedAlerted, shouldReset: false };
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
    logInfo(`Window ${currentWindowId} has ended, creating summary tweet...`);

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

    // Fetch progress towards next window
    let progressInfo = null;
    try {
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
        strategyAddress &&
        strategyAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        const currentBalance = await client.getBalance({
          address: strategyAddress,
        });
        const progressPercent = Math.min(
          100,
          Number((currentBalance * 100n) / minEthForWindow)
        );
        progressInfo = {
          currentBalance,
          minEthForWindow,
          progressPercent,
          nextWindowId: currentWindowId + 1,
        };
        logInfo(
          `Progress towards window ${
            currentWindowId + 1
          }: ${progressPercent.toFixed(1)}%`
        );
      }
    } catch (error) {
      logError(`Failed to fetch progress info: ${error.message}`);
      // Continue without progress info
    }

    // Format and post tweet
    const tweetMessage = formatWindowEndTweet(
      currentWindowId,
      tokenIds.length,
      tokenIds,
      progressInfo
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

  // Handle test threshold reached mode
  if (testThresholdReachedMode) {
    await runTestThresholdReachedMode();
    return;
  }

  // Handle test balance progress mode
  if (testBalanceProgressMode) {
    await runTestBalanceProgressMode();
    return;
  }

  // Handle test sale mode
  if (testSaleMode) {
    await runTestSaleMode();
    return;
  }

  // Handle preview sale mode (show real sale data from OpenSea)
  if (previewSaleTokenIds) {
    await runPreviewSaleMode(previewSaleTokenIds);
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
  const pendingMints = state.pendingMints; // Map of tokenId -> { windowId, minter, seed, retries, addedAt }
  const fifteenMinReminders = state.fifteenMinReminders;
  const processedEndedWindows = state.processedEndedWindows;
  let windowReadyAlerted = state.windowReadyAlerted;
  let thresholdReachedAlerted = state.thresholdReachedAlerted;
  let lastBalanceProgressPost = state.lastBalanceProgressPost;
  let lastProcessedBlock = rescanMode ? 0n : state.lastBlock; // Reset if --rescan flag
  const processedSales = state.processedSales;
  let lastSalesTimestamp = rescanMode ? 0 : state.lastSalesTimestamp;

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
  if (pendingMints.size > 0) {
    logInfo(`Loaded ${pendingMints.size} pending mints to retry from state`);
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
        transport: getTransport(rpcUrl),
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

          // Create a saveStateFn for the reminder context
          const saveStateFn = () =>
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );

          // Create reminder context for scheduling
          const reminderContext = {
            fifteenMinReminders,
            saveStateFn,
          };

          // Process missed windows and schedule reminders for still-active ones
          for (const log of missedWindowLogs) {
            const result = await processEvent(
              log,
              processedWindows,
              twitterClient,
              contractAddress,
              client,
              abi,
              reminderContext
            );

            // If this is a recent window that's still active, schedule reminder
            // (processEvent handles scheduling when it successfully processes)

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

          // Group logs by minter address for batch processing
          const mintsByMinter = new Map();
          for (const log of missedMintLogs) {
            const minterKey = log.args.minter.toLowerCase();
            if (!mintsByMinter.has(minterKey)) {
              mintsByMinter.set(minterKey, []);
            }
            mintsByMinter.get(minterKey).push(log);
          }

          // Process each minter's batch
          for (const [minter, minterLogs] of mintsByMinter) {
            await processGroupedMints(
              minterLogs,
              processedMints,
              pendingMints,
              twitterClient,
              client,
              contractAddress
            );
            // Rate limit delay between different minters
            if (mintsByMinter.size > 1) {
              await sleep(5000);
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
        thresholdReachedAlerted,
        lastBalanceProgressPost,
        lastProcessedBlock,
        contractAddress,
        processedSales,
        lastSalesTimestamp,
        pendingMints
      );

      // Reset retry count on successful connection
      retryCount = 0;

      // Create a saveStateFn for reminders scheduled in the watcher
      const watcherSaveStateFn = () =>
        saveState(
          processedWindows,
          processedMints,
          fifteenMinReminders,
          processedEndedWindows,
          windowReadyAlerted,
          thresholdReachedAlerted,
          lastBalanceProgressPost,
          lastProcessedBlock,
          contractAddress,
          processedSales,
          lastSalesTimestamp,
          pendingMints
        );

      // Watch for new WindowCreated events
      const unwatchWindows = client.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event WindowCreated(uint256 indexed windowId, uint64 startTime, uint64 endTime)"
        ),
        onLogs: async (logs) => {
          for (const log of logs) {
            // Create reminder context for this window
            const reminderContext = {
              fifteenMinReminders,
              saveStateFn: watcherSaveStateFn,
            };

            await processEvent(
              log,
              processedWindows,
              twitterClient,
              contractAddress,
              client,
              abi,
              reminderContext
            );
            // Reset windowReadyAlerted and thresholdReachedAlerted since a new window was created
            windowReadyAlerted = false;
            thresholdReachedAlerted = false;
            if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
              lastProcessedBlock = log.blockNumber;
              watcherSaveStateFn();
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
          // Group logs by minter address for batch processing
          const mintsByMinter = new Map();
          for (const log of logs) {
            const minterKey = log.args.minter.toLowerCase();
            if (!mintsByMinter.has(minterKey)) {
              mintsByMinter.set(minterKey, []);
            }
            mintsByMinter.get(minterKey).push(log);
          }

          // Process each minter's batch
          for (const [minter, minterLogs] of mintsByMinter) {
            await processGroupedMints(
              minterLogs,
              processedMints,
              pendingMints,
              twitterClient,
              client,
              contractAddress
            );
            // Rate limit delay between different minters
            if (mintsByMinter.size > 1) {
              await sleep(5000);
            }
          }

          // Update last processed block
          const maxBlock = Math.max(...logs.map((l) => Number(l.blockNumber || 0)));
          if (maxBlock > lastProcessedBlock) {
            lastProcessedBlock = BigInt(maxBlock);
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
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

      // Check if there's an active window and schedule a reminder for it (handles bot restarts)
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

        const timeRemaining = Number(timeUntilClose);
        if (timeRemaining > 0) {
          // Window is active - get the current window info to schedule reminder
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

          // Calculate endTime from current time + timeRemaining
          const now = Math.floor(Date.now() / 1000);
          const endTime = now + timeRemaining;

          logInfo(
            `Active window #${windowId} detected (${Math.round(timeRemaining / 60)} minutes remaining)`
          );

          // Schedule reminder using the new system
          scheduleReminder({
            windowId,
            endTime,
            fifteenMinReminders,
            twitterClient,
            client,
            contractAddress,
            abi,
            saveStateFn: watcherSaveStateFn,
          });
        }
      } catch (error) {
        logWarn(`Could not check for active window: ${error.message}`);
      }

      // Threshold reached checker (every 10 minutes) - posts when balance >= threshold but TWAP delay active
      const thresholdReachedInterval = setInterval(async () => {
        try {
          const result = await processThresholdReachedCheck(
            thresholdReachedAlerted,
            twitterClient,
            client,
            contractAddress,
            abi
          );
          // Update state if changed
          if (result.alerted !== thresholdReachedAlerted || result.shouldReset) {
            thresholdReachedAlerted = result.alerted;
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
          }
        } catch (error) {
          logError(`Threshold reached check error: ${error.message}`);
        }
      }, 600000);

      // Window ready checker (every 10 minutes) - posts when canCreateWindow() is true
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
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
          }
        } catch (error) {
          logError(`Window ready check error: ${error.message}`);
        }
      }, 600000);

      // Ended windows checker (every 10 minutes) - posts summary when windows end
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
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
          }
        } catch (error) {
          logError(`Ended windows check error: ${error.message}`);
        }
      }, 600000);

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
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
          }
        } catch (error) {
          logError(`Balance progress check error: ${error.message}`);
        }
      }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds

      // Secondary sales checker (every 10 minutes)
      const salesInterval = setInterval(async () => {
        try {
          const result = await processSalesCheck(
            processedSales,
            lastSalesTimestamp,
            twitterClient,
            client,
            contractAddress,
            abi
          );
          if (
            result.processed > 0 ||
            result.lastTimestamp > lastSalesTimestamp
          ) {
            lastSalesTimestamp = result.lastTimestamp;
            saveState(
              processedWindows,
              processedMints,
              fifteenMinReminders,
              processedEndedWindows,
              windowReadyAlerted,
              thresholdReachedAlerted,
              lastBalanceProgressPost,
              lastProcessedBlock,
              contractAddress,
              processedSales,
              lastSalesTimestamp,
              pendingMints
            );
          }
        } catch (error) {
          logError(`Sales check error: ${error.message}`);
        }
      }, 600000); // 10 minutes

      // Graceful shutdown handler
      const shutdown = () => {
        logInfo("Shutting down...");
        if (unwatch) unwatch();
        clearScheduledReminder(); // Clear scheduled reminder timeout
        clearInterval(thresholdReachedInterval);
        clearInterval(windowReadyInterval);
        clearInterval(endedWindowsInterval);
        clearInterval(balanceProgressInterval);
        clearInterval(salesInterval);
        saveState(
          processedWindows,
          processedMints,
          fifteenMinReminders,
          processedEndedWindows,
          windowReadyAlerted,
          thresholdReachedAlerted,
          lastBalanceProgressPost,
          lastProcessedBlock,
          contractAddress,
          processedSales,
          lastSalesTimestamp,
          pendingMints
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
              `Heartbeat: block ${block}, processed ${processedWindows.size} windows, ${processedMints.size} mints, ${fifteenMinReminders.size} reminders, ${processedEndedWindows.size} ended windows, ${processedSales.size} sales`
            );
          } catch (error) {
            clearInterval(healthCheck);
            clearScheduledReminder(); // Clear scheduled reminder timeout
            clearInterval(windowReadyInterval);
            clearInterval(endedWindowsInterval);
            clearInterval(balanceProgressInterval);
            clearInterval(salesInterval);
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

// ============ ADMIN HTTP SERVER ============

// Create twitter client for admin use (separate from CLI dry-run flag)
function createAdminTwitterClient() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (apiKey && apiSecret && accessToken && accessTokenSecret) {
    return new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
  }
  return null;
}

// Generate balance progress tweet with live data
async function generateBalanceTweet() {
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const abi = loadContractABI();
  const client = createPublicClient({
    chain: getChain(),
    transport: getTransport(rpcUrl),
  });

  const [strategyAddress, minEthForWindow, windowCount] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi,
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

  const nextWindowId = Number(windowCount) + 1;
  const [currentBalance, timeUntilFundsMoved] = await Promise.all([
    client.getBalance({ address: strategyAddress }),
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

  const progressPercent =
    Number((currentBalance * 10000n) / minEthForWindow) / 100;
  const [ethPrice, burnData, marketCap] = await Promise.all([
    fetchEthPrice(),
    fetchBurnData(client, contractAddress, abi),
    fetchLessMarketCap(),
  ]);
  const timeUntilOpen = Number(timeUntilFundsMoved);

  return formatBalanceProgressTweet(
    currentBalance,
    minEthForWindow,
    progressPercent,
    nextWindowId,
    ethPrice,
    timeUntilOpen,
    burnData,
    marketCap
  );
}

// Generate mint tweet with live data
async function generateMintTweet(tokenId) {
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const client = createPublicClient({
    chain: getChain(),
    transport: getTransport(rpcUrl),
  });

  // Get token data
  const [windowId, owner, timeUntilClose] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [{ name: "tokenId", type: "uint256" }],
          name: "getTokenData",
          outputs: [{ name: "windowId", type: "uint64" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "getTokenData",
      args: [BigInt(tokenId)],
    }),
    client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [{ name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    }),
    client
      .readContract({
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
      })
      .catch(() => 0n),
  ]);

  const minterDisplay = await resolveDisplayName(owner);
  const minutesRemaining = Math.ceil(Number(timeUntilClose) / 60);

  // Get collector stats for the owner
  const abi = loadContractABI();
  const collectorStats = await getCollectorStats(
    owner,
    client,
    contractAddress,
    abi
  );

  return formatMintTweet(
    tokenId,
    minterDisplay,
    minutesRemaining > 0 ? minutesRemaining : null,
    Number(windowId),
    false,
    collectorStats
  );
}

// Generate window tweet with live data
async function generateWindowTweet(windowId) {
  const rpcUrl = getRpcUrl();
  const contractAddress = getContractAddress();
  const abi = loadContractABI();
  const client = createPublicClient({
    chain: getChain(),
    transport: getTransport(rpcUrl),
  });

  const [windowDuration, windowCount] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [],
          name: "windowDuration",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "windowDuration",
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

  // Get burn data
  const burnData = await fetchBurnData(client, contractAddress, abi);
  const durationMinutes = Math.floor(Number(windowDuration) / 60);
  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + Number(windowDuration);

  return formatTweet(windowId, startTime, endTime, burnData);
}

function startAdminServer() {
  const adminTwitterClient = createAdminTwitterClient();

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${ADMIN_PORT}`);
    const path = url.pathname;

    // Helper to send JSON response
    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // Helper to read request body
    const readBody = () => {
      return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(JSON.parse(body || "{}"));
          } catch {
            resolve({});
          }
        });
      });
    };

    try {
      // GET /api/status - Return bot state
      if (path === "/api/status" && req.method === "GET") {
        if (existsSync(stateFile)) {
          const data = JSON.parse(readFileSync(stateFile, "utf-8"));
          sendJson(200, data);
        } else {
          sendJson(404, { error: "State file not found" });
        }
        return;
      }

      // POST /api/tweet/preview - Preview a tweet with live data
      if (path === "/api/tweet/preview" && req.method === "POST") {
        const body = await readBody();
        const { type, tokenId, windowId } = body;

        if (!type || !["balance", "window", "mint", "window-ended"].includes(type)) {
          sendJson(400, { error: "Invalid type" });
          return;
        }

        let preview = "";
        try {
          if (type === "balance") {
            preview = await generateBalanceTweet();
          } else if (type === "window") {
            if (!windowId) {
              sendJson(400, { error: "windowId required" });
              return;
            }
            preview = await generateWindowTweet(windowId);
          } else if (type === "mint") {
            if (!tokenId) {
              sendJson(400, { error: "tokenId required" });
              return;
            }
            preview = await generateMintTweet(tokenId);
          } else if (type === "window-ended") {
            if (!windowId) {
              sendJson(400, { error: "windowId required" });
              return;
            }
            // Generate window-ended preview
            const targetWindowId = Number(windowId);
            const rpcUrl = getRpcUrl();
            const contractAddress = getContractAddress();
            const abi = loadContractABI();
            const client = createPublicClient({
              chain: getChain(),
              transport: getTransport(rpcUrl),
            });

            // Get mints for this window (returns array of token IDs)
            // Use fromBlock 0n to get all historical events for this window
            const tokenIds = await getMintsForWindow(client, contractAddress, targetWindowId, 0n);
            if (!tokenIds || tokenIds.length === 0) {
              sendJson(404, { error: `No tokens found for window ${targetWindowId}` });
              return;
            }

            // Fetch progress info for next window
            let progressInfo = null;
            try {
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
                strategyAddress &&
                strategyAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                const currentBalance = await client.getBalance({
                  address: strategyAddress,
                });
                const progressPercent = Math.min(
                  100,
                  Number((currentBalance * 100n) / minEthForWindow)
                );
                progressInfo = {
                  currentBalance,
                  minEthForWindow,
                  progressPercent,
                  nextWindowId: targetWindowId + 1,
                };
              }
            } catch (progressErr) {
              // Progress info is optional, continue without it
            }

            preview = formatWindowEndTweet(targetWindowId, tokenIds.length, tokenIds, progressInfo);
          }
          sendJson(200, { preview, type });
        } catch (error) {
          sendJson(500, {
            error: `Failed to generate preview: ${error.message}`,
          });
        }
        return;
      }

      // POST /api/tweet/post - Post a tweet (requires admin)
      if (path === "/api/tweet/post" && req.method === "POST") {
        const body = await readBody();
        const { type, tokenId, windowId, address } = body;

        // Verify admin
        if (!address || address.toLowerCase() !== ADMIN_ADDRESS) {
          sendJson(403, { error: "Not authorized" });
          return;
        }

        if (
          !type ||
          !["balance", "window", "mint", "window-ended", "sale"].includes(type)
        ) {
          sendJson(400, { error: "Invalid type" });
          return;
        }

        if (!adminTwitterClient) {
          sendJson(500, { error: "Twitter client not configured" });
          return;
        }

        try {
          let tweetText = "";
          let imageBuffer = null;

          if (type === "balance") {
            tweetText = await generateBalanceTweet();
          } else if (type === "window") {
            if (!windowId) {
              sendJson(400, { error: "windowId required" });
              return;
            }
            tweetText = await generateWindowTweet(windowId);
          } else if (type === "mint") {
            if (!tokenId) {
              sendJson(400, { error: "tokenId required" });
              return;
            }
            tweetText = await generateMintTweet(tokenId);
            // Fetch image for mint tweets using the robust fetchImage function
            imageBuffer = await fetchImage(tokenId);
            if (!imageBuffer) {
              logWarn(`Failed to fetch image for mint tweet`);
            }
          } else if (type === "window-ended") {
            if (!windowId) {
              sendJson(400, { error: "windowId required" });
              return;
            }
            const imageApiUrl =
              process.env.IMAGE_API_URL || "https://fold-image-api.fly.dev";
            const targetWindowId = Number(windowId);

            // Create client for blockchain queries
            const rpcUrl = getRpcUrl();
            const contractAddress = getContractAddress();
            const abi = loadContractABI();
            const client = createPublicClient({
              chain: getChain(),
              transport: getTransport(rpcUrl),
            });

            // Fetch token IDs directly from blockchain (more reliable than leaderboard)
            // Use fromBlock 0n to get all historical events for this window
            const tokenIds = await getMintsForWindow(
              client,
              contractAddress,
              targetWindowId,
              0n
            );

            logInfo(
              `Window ${targetWindowId} ended: found ${
                tokenIds.length
              } tokens (${tokenIds[0]}-${tokenIds[tokenIds.length - 1]})`
            );

            if (tokenIds.length === 0) {
              sendJson(400, {
                error: `No tokens found for window ${windowId}`,
              });
              return;
            }

            // Fetch progress info for next window
            let progressInfo = null;
            try {
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
                strategyAddress &&
                strategyAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                const currentBalance = await client.getBalance({
                  address: strategyAddress,
                });
                const progressPercent = Math.min(
                  100,
                  Number((currentBalance * 100n) / minEthForWindow)
                );
                progressInfo = {
                  currentBalance,
                  minEthForWindow,
                  progressPercent,
                  nextWindowId: targetWindowId + 1,
                };
                logInfo(
                  `Progress towards window ${
                    targetWindowId + 1
                  }: ${progressPercent.toFixed(1)}%`
                );
              }
            } catch (progressErr) {
              logWarn(`Failed to fetch progress info: ${progressErr.message}`);
            }

            // Format tweet
            tweetText = formatWindowEndTweet(
              targetWindowId,
              tokenIds.length,
              tokenIds,
              progressInfo
            );

            // Fetch grid image
            try {
              const gridUrl = `${imageApiUrl}/api/grid?tokenIds=${tokenIds.join(
                ","
              )}&cellWidth=300&cellHeight=424`;
              const gridRes = await fetch(gridUrl);
              if (gridRes.ok) {
                imageBuffer = Buffer.from(await gridRes.arrayBuffer());
                logSuccess(`Grid image fetched: ${imageBuffer.length} bytes`);
              }
            } catch (imgErr) {
              logWarn(`Failed to fetch grid image: ${imgErr.message}`);
            }
          } else if (type === "sale") {
            if (!tokenId) {
              sendJson(400, { error: "tokenId required" });
              return;
            }

            const apiKey = process.env.OPENSEA_API_KEY;
            if (!apiKey) {
              sendJson(500, { error: "OPENSEA_API_KEY not configured" });
              return;
            }

            // Create client for blockchain queries
            const rpcUrl = getRpcUrl();
            const contractAddress = getContractAddress();
            const abi = loadContractABI();
            const client = createPublicClient({
              chain: getChain(),
              transport: getTransport(rpcUrl),
            });

            // Fetch sales from OpenSea
            const collectionSlug = "say-less";
            const url = `https://api.opensea.io/api/v2/events/collection/${collectionSlug}?event_type=sale&limit=50`;
            const response = await fetch(url, {
              headers: {
                accept: "application/json",
                "x-api-key": apiKey,
              },
            });

            if (!response.ok) {
              sendJson(500, { error: `OpenSea API error: ${response.status}` });
              return;
            }

            const data = await response.json();
            const events = data.asset_events || [];
            const sale = events.find((e) => e.nft?.identifier === String(tokenId));

            if (!sale) {
              sendJson(404, { error: `No recent sale found for token #${tokenId}` });
              return;
            }

            const buyer = sale.buyer;
            const priceWei = BigInt(sale.payment?.quantity || "0");
            const priceEth = formatEthValue(formatEther(priceWei));
            const txHash = sale.transaction;

            // Resolve display name
            const buyerDisplay = await resolveDisplayName(buyer);

            // Get collector stats
            const collectorStats = await getCollectorStats(buyer, client, contractAddress, abi);

            // Fetch window ID for the token
            let windowIds = null;
            try {
              const result = await client.readContract({
                address: contractAddress,
                abi,
                functionName: "getTokenData",
                args: [BigInt(tokenId)],
              });
              windowIds = [Number(result.windowId ?? result)];
            } catch (err) {
              logWarn(`Failed to fetch window ID: ${err.message}`);
            }

            // Calculate royalty (1.69% of sale price)
            const royaltyWei = (priceWei * 169n) / 10000n;
            const royaltyEth = formatEther(royaltyWei);

            // Fetch buy+burn balance from strategy contract
            let buyBurnBalanceEth = null;
            try {
              const strategyAddress = await client.readContract({
                address: contractAddress,
                abi,
                functionName: "strategy",
              });
              if (strategyAddress && strategyAddress !== "0x0000000000000000000000000000000000000000") {
                const balance = await client.getBalance({ address: strategyAddress });
                buyBurnBalanceEth = formatEther(balance);
                logInfo(`Buy+burn balance: ${buyBurnBalanceEth} ETH`);
              }
            } catch (err) {
              logWarn(`Failed to fetch buy+burn balance: ${err.message}`);
            }

            // Format tweet
            tweetText = formatSaleTweet(
              [Number(tokenId)],
              buyerDisplay,
              priceEth,
              collectorStats,
              windowIds,
              formatEthValue(royaltyEth),
              buyBurnBalanceEth
            );

            // Fetch image
            imageBuffer = await fetchImage(Number(tokenId));
            if (!imageBuffer) {
              logWarn(`Failed to fetch image for sale tweet`);
            }
          }

          // Post the tweet
          const tweetId = await postTweet(
            adminTwitterClient,
            tweetText,
            imageBuffer
          );

          if (tweetId) {
            logSuccess(`Admin posted ${type} tweet via API, ID: ${tweetId}`);

            // Update state file to mark mint as processed (prevents duplicate posts on restart)
            if (type === "mint" && tokenId) {
              try {
                const stateData = existsSync(stateFile)
                  ? JSON.parse(readFileSync(stateFile, "utf8"))
                  : { processedMints: [], pendingMints: {} };
                const processedMints = new Set(stateData.processedMints || []);
                processedMints.add(Number(tokenId));
                stateData.processedMints = Array.from(processedMints);
                // Also remove from pendingMints if it was there
                if (stateData.pendingMints && stateData.pendingMints[tokenId]) {
                  delete stateData.pendingMints[tokenId];
                }
                stateData.updatedAt = new Date().toISOString();
                writeFileSync(stateFile, JSON.stringify(stateData, null, 2));
                logInfo(`Updated state: marked token ${tokenId} as processed`);
              } catch (stateErr) {
                logWarn(`Failed to update state file: ${stateErr.message}`);
              }
            }

            sendJson(200, { success: true, tweetId });
          } else {
            sendJson(500, { error: "Failed to post tweet" });
          }
        } catch (error) {
          logError(`Admin tweet post error: ${error.message}`);
          sendJson(500, { error: error.message });
        }
        return;
      }

      // Health check
      if (path === "/health" && req.method === "GET") {
        sendJson(200, { status: "ok", timestamp: new Date().toISOString() });
        return;
      }

      // 404 for unknown routes
      sendJson(404, { error: "Not found" });
    } catch (error) {
      logError(`Admin server error: ${error.message}`);
      sendJson(500, { error: error.message });
    }
  });

  server.listen(ADMIN_PORT, "0.0.0.0", () => {
    logSuccess(`Admin HTTP server listening on port ${ADMIN_PORT}`);
  });

  return server;
}

// Start admin server (runs alongside bot, but not for test/preview modes)
const isTestOrPreviewMode =
  testMode ||
  testMintMode ||
  testReminderMode ||
  testWindowReadyMode ||
  testBalanceProgressMode ||
  testSaleMode ||
  previewSaleTokenIds ||
  verifyMode;
const adminServer = isTestOrPreviewMode ? null : startAdminServer();

// Run the bot
runBot().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
