#!/usr/bin/env node

/**
 * OpenSea Fix Deployment Script
 *
 * This script deploys a fix for OpenSea's URL-decoding issue that corrupts
 * JavaScript containing % characters (like modulo operators).
 *
 * The fix uses scripty.sol's scriptBase64DataURI encoding:
 * - Stores the JS as base64 in ScriptyStorage
 * - Uses scriptBase64DataURI tagType in LessRenderer
 * - Base64 has no % chars, so OpenSea's URL-decoding is harmless
 *
 * Steps:
 * 1. Bundle JavaScript
 * 2. Upload base64-encoded script to ScriptyStorage
 * 3. Deploy new LessRenderer contract
 * 4. Verify contract on Etherscan
 * 5. Set new renderer on Less NFT contract
 *
 * Usage:
 *   node scripts/deploy-opensea-fix.js [--dry-run] [--yes]
 *
 * Environment Variables:
 *   MAINNET_RPC_URL    - Mainnet RPC endpoint
 *   PRIVATE_KEY        - Deployer private key (must be contract owner)
 *   ETHERSCAN_API_KEY  - For contract verification
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  // Mainnet addresses
  lessContract: "0x008B66385ed2346E6895031E250B2ac8dc14605C",
  scriptyStorage: "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699",
  scriptyBuilder: "0xD7587F110E08F4D120A231bA97d3B577A81Df022",

  // Metadata
  collectionName: "LESS",
  description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
  collectionImage: "https://fold-image-api.fly.dev/images/1",
  externalLink: "https://less.art",
  baseImageURL: "https://fold-image-api.fly.dev/images/",

  // Script settings
  chunkSize: 24000,
};

// ============================================================
// Colors and Logging
// ============================================================

const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

const log = (msg, color = "reset") => console.log(`${c[color]}${msg}${c.reset}`);
const logStep = (step, total, msg) => {
  console.log("");
  log(`${"═".repeat(60)}`, "cyan");
  log(`  STEP ${step}/${total}: ${msg}`, "cyan");
  log(`${"═".repeat(60)}`, "cyan");
};
const logSuccess = (msg) => log(`  ✓ ${msg}`, "green");
const logWarning = (msg) => log(`  ⚠ ${msg}`, "yellow");
const logError = (msg) => log(`  ✗ ${msg}`, "red");
const logInfo = (msg) => log(`    ${msg}`, "gray");
const logHighlight = (msg) => log(`  → ${msg}`, "yellow");

// ============================================================
// Argument Parsing
// ============================================================

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const dryRun = hasFlag("dry-run");
const autoYes = hasFlag("yes");

// ============================================================
// Environment Loading
// ============================================================

function loadEnv() {
  const envPath = join(rootDir, ".env");
  const env = {};
  if (existsSync(envPath)) {
    readFileSync(envPath, "utf-8").split("\n").forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...rest] = trimmed.split("=");
        if (key && rest.length) env[key.trim()] = rest.join("=").trim();
      }
    });
  }
  Object.assign(env, process.env);
  return env;
}

const env = loadEnv();

// ============================================================
// Utilities
// ============================================================

function confirm(question) {
  if (autoYes) return Promise.resolve(true);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${c.yellow}  ? ${question} (y/n): ${c.reset}`, answer => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function exec(cmd, options = {}) {
  const { silent = false, ignoreError = false } = options;
  try {
    return execSync(cmd, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
    });
  } catch (error) {
    if (ignoreError) return null;
    throw error;
  }
}

function execSilent(cmd) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: "utf-8", stdio: "pipe" });
  } catch (error) {
    return null;
  }
}

async function getEthPrice() {
  try {
    const result = execSync(
      'curl -s "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd" 2>/dev/null',
      { encoding: "utf-8", timeout: 5000 }
    );
    const data = JSON.parse(result);
    return data.ethereum?.usd || null;
  } catch {
    return null;
  }
}

function formatCost(gasUsed, gasPriceGwei, ethPrice) {
  const ethCost = (gasUsed * gasPriceGwei) / 1e9;
  let msg = `${gasUsed.toLocaleString()} gas ≈ ${ethCost.toFixed(4)} ETH`;
  if (ethPrice) {
    msg += ` ($${(ethCost * ethPrice).toFixed(2)})`;
  }
  return msg;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Step 1: Bundle JavaScript
// ============================================================

async function step1_Bundle() {
  logStep(1, 5, "Bundle JavaScript");

  const entryPoint = join(rootDir, "web/onchain/index.js");
  const outputPath = join(rootDir, "web/onchain/bundled.js");

  if (!existsSync(entryPoint)) {
    logError(`Entry point not found: ${entryPoint}`);
    return false;
  }

  logInfo(`Entry: web/onchain/index.js`);
  logInfo(`Output: web/onchain/bundled.js`);

  if (dryRun) {
    logHighlight("DRY RUN: Would bundle JavaScript");
    return true;
  }

  try {
    const esbuild = await import("esbuild");
    await esbuild.default.build({
      entryPoints: [entryPoint],
      bundle: true,
      format: "iife",
      platform: "browser",
      outfile: outputPath,
      minify: true,
      sourcemap: false,
      target: "es2020",
    });

    const size = readFileSync(outputPath).length;
    logSuccess(`Bundle created: ${(size / 1024).toFixed(2)} KB`);
    return true;
  } catch (error) {
    logError(`Bundle failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// Step 2: Upload to ScriptyStorage
// ============================================================

async function step2_Upload(rpcUrl, privateKey, scriptName) {
  logStep(2, 5, "Upload Base64-Encoded Script to ScriptyStorage");

  const scriptPath = join(rootDir, "web/onchain/bundled.js");
  if (!existsSync(scriptPath)) {
    logError("Bundled script not found. Run step 1 first.");
    return false;
  }

  // Base64 encode the script
  const rawScript = readFileSync(scriptPath);
  const base64Script = rawScript.toString("base64");
  const scriptBytes = Buffer.from(base64Script);
  const numChunks = Math.ceil(scriptBytes.length / CONFIG.chunkSize);

  logInfo(`Script name: ${scriptName}`);
  logInfo(`Raw size: ${rawScript.length.toLocaleString()} bytes`);
  logInfo(`Base64 size: ${scriptBytes.length.toLocaleString()} bytes (+${((scriptBytes.length / rawScript.length - 1) * 100).toFixed(0)}%)`);
  logInfo(`Chunks: ${numChunks}`);
  logInfo(`Storage: ${CONFIG.scriptyStorage}`);
  console.log("");

  // Estimate gas
  log("  Estimating gas costs...", "gray");
  let totalGas = 100000; // createContent estimate
  let gasPriceGwei = null;
  let ethPrice = null;

  try {
    const gasPriceWei = execSilent(`cast gas-price --rpc-url "${rpcUrl}"`);
    if (gasPriceWei) {
      gasPriceGwei = Number(BigInt(gasPriceWei.trim())) / 1e9;
    }

    // Estimate ~21000 base + ~68 per byte for calldata
    const bytesPerChunk = Math.min(CONFIG.chunkSize, scriptBytes.length);
    const gasPerChunk = 50000 + (bytesPerChunk * 68);
    totalGas += gasPerChunk * numChunks;

    ethPrice = await getEthPrice();

    logInfo(`Estimated: ${formatCost(totalGas, gasPriceGwei || 30, ethPrice)}`);
    logInfo(`Transactions: ${numChunks + 1} (1 create + ${numChunks} chunks)`);
  } catch (error) {
    logWarning(`Gas estimation failed: ${error.message}`);
  }

  console.log("");
  if (!await confirm("Proceed with upload?")) {
    return false;
  }

  if (dryRun) {
    logHighlight("DRY RUN: Would upload script");
    return true;
  }

  // Create content entry
  log("\n  Creating content entry...", "gray");
  try {
    exec(
      `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${CONFIG.scriptyStorage} "createContent(string,bytes)" "${scriptName}" "0x"`,
      { silent: true }
    );
    logSuccess("Content entry created");
  } catch {
    logWarning("Content may already exist, continuing...");
  }

  // Upload chunks
  for (let i = 0; i < numChunks; i++) {
    const start = i * CONFIG.chunkSize;
    const end = Math.min(start + CONFIG.chunkSize, scriptBytes.length);
    const chunk = scriptBytes.slice(start, end);
    const chunkHex = "0x" + chunk.toString("hex");

    log(`  Uploading chunk ${i + 1}/${numChunks} (${chunk.length.toLocaleString()} bytes)...`, "gray");

    try {
      exec(
        `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${CONFIG.scriptyStorage} "addChunkToContent(string,bytes)" "${scriptName}" ${chunkHex}`,
        { silent: true }
      );
      logSuccess(`Chunk ${i + 1}/${numChunks} uploaded`);
    } catch (error) {
      logError(`Chunk ${i + 1} failed: ${error.message}`);
      return false;
    }

    // Small delay between chunks
    await sleep(1000);
  }

  logSuccess("Upload complete");
  return true;
}

// ============================================================
// Step 3: Deploy LessRenderer
// ============================================================

async function step3_Deploy(rpcUrl, privateKey, scriptName, ownerAddress) {
  logStep(3, 5, "Deploy New LessRenderer Contract");

  logInfo(`Less contract: ${CONFIG.lessContract}`);
  logInfo(`Script name: ${scriptName}`);
  logInfo(`ScriptyBuilder: ${CONFIG.scriptyBuilder}`);
  logInfo(`ScriptyStorage: ${CONFIG.scriptyStorage}`);
  logInfo(`Owner: ${ownerAddress}`);
  console.log("");

  // Estimate gas
  log("  Estimating deployment cost...", "gray");
  let gasEstimate = 1500000; // Approximate renderer deployment
  let gasPriceGwei = null;
  let ethPrice = null;

  try {
    const gasPriceWei = execSilent(`cast gas-price --rpc-url "${rpcUrl}"`);
    if (gasPriceWei) {
      gasPriceGwei = Number(BigInt(gasPriceWei.trim())) / 1e9;
    }
    ethPrice = await getEthPrice();

    logInfo(`Estimated: ${formatCost(gasEstimate, gasPriceGwei || 30, ethPrice)}`);
  } catch (error) {
    logWarning(`Gas estimation failed`);
  }

  console.log("");
  if (!await confirm("Proceed with deployment?")) {
    return null;
  }

  if (dryRun) {
    logHighlight("DRY RUN: Would deploy LessRenderer");
    return "0xDRY_RUN_RENDERER_ADDRESS";
  }

  // Set environment variables for the forge script
  const forgeEnv = {
    ...process.env,
    LESS_TOKEN_ADDRESS: CONFIG.lessContract,
    SCRIPT_NAME: scriptName,
    BASE_IMAGE_URL: CONFIG.baseImageURL,
    OWNER_ADDRESS: ownerAddress,
  };

  try {
    log("\n  Deploying LessRenderer...", "gray");

    const result = execSync(
      `forge script script/DeployRenderer.s.sol:DeployRenderer --rpc-url "${rpcUrl}" --private-key ${privateKey} --broadcast -vvv`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe", env: forgeEnv }
    );

    // Extract deployed address
    const addressMatch = result.match(/LessRenderer deployed at:\s*(0x[a-fA-F0-9]{40})/i);
    if (addressMatch) {
      const rendererAddress = addressMatch[1];
      logSuccess(`LessRenderer deployed: ${rendererAddress}`);
      return rendererAddress;
    }

    // Try broadcast file
    const broadcastPath = join(rootDir, "broadcast/DeployRenderer.s.sol/1/run-latest.json");
    if (existsSync(broadcastPath)) {
      const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
      for (const tx of broadcast.transactions || []) {
        if (tx.contractName === "LessRenderer") {
          logSuccess(`LessRenderer deployed: ${tx.contractAddress}`);
          return tx.contractAddress;
        }
      }
    }

    logError("Could not extract deployed address from output");
    console.log(result);
    return null;
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    return null;
  }
}

// ============================================================
// Step 4: Verify Contract
// ============================================================

async function step4_Verify(rendererAddress, scriptName, ownerAddress) {
  logStep(4, 5, "Verify Contract on Etherscan");

  if (!env.ETHERSCAN_API_KEY) {
    logWarning("ETHERSCAN_API_KEY not set, skipping verification");
    return true;
  }

  logInfo(`Renderer: ${rendererAddress}`);
  logInfo(`This may take a few minutes...`);
  console.log("");

  if (!await confirm("Proceed with verification?")) {
    return true; // Don't fail the whole process
  }

  if (dryRun) {
    logHighlight("DRY RUN: Would verify contract on Etherscan");
    return true;
  }

  try {
    // Build constructor args tuple
    // RendererConfig struct: (less, scriptyBuilder, scriptyStorage, scriptName, baseImageURL, collectionName, description, collectionImage, externalLink, owner)
    const constructorArgs = execSync(
      `cast abi-encode "constructor((address,address,address,string,string,string,string,string,string,address))" "(${CONFIG.lessContract},${CONFIG.scriptyBuilder},${CONFIG.scriptyStorage},${scriptName},${CONFIG.baseImageURL},${CONFIG.collectionName},${CONFIG.description},${CONFIG.collectionImage},${CONFIG.externalLink},${ownerAddress})"`,
      { encoding: "utf-8", cwd: rootDir }
    ).trim();

    log("\n  Verifying on Etherscan...", "gray");

    exec(
      `forge verify-contract ${rendererAddress} contracts/LessRenderer.sol:LessRenderer --chain mainnet --constructor-args ${constructorArgs} --watch`,
      { silent: false }
    );

    logSuccess("Contract verified on Etherscan");
    return true;
  } catch (error) {
    logWarning(`Verification failed: ${error.message}`);
    logInfo("You can verify manually later with:");
    logInfo(`forge verify-contract ${rendererAddress} contracts/LessRenderer.sol:LessRenderer --chain mainnet --watch`);
    return true; // Don't fail the whole process
  }
}

// ============================================================
// Step 5: Set Renderer on Less Contract
// ============================================================

async function step5_SetRenderer(rpcUrl, privateKey, rendererAddress) {
  logStep(5, 5, "Set New Renderer on Less NFT Contract");

  logInfo(`Less contract: ${CONFIG.lessContract}`);
  logInfo(`New renderer: ${rendererAddress}`);
  console.log("");

  // Get current renderer
  try {
    const currentRenderer = execSilent(
      `cast call ${CONFIG.lessContract} "renderer()(address)" --rpc-url "${rpcUrl}"`
    );
    if (currentRenderer) {
      logInfo(`Current renderer: ${currentRenderer.trim()}`);
    }
  } catch {}

  // Estimate gas
  log("\n  Estimating gas...", "gray");
  let gasEstimate = 50000;
  let gasPriceGwei = null;
  let ethPrice = null;

  try {
    const gasPriceWei = execSilent(`cast gas-price --rpc-url "${rpcUrl}"`);
    if (gasPriceWei) {
      gasPriceGwei = Number(BigInt(gasPriceWei.trim())) / 1e9;
    }
    ethPrice = await getEthPrice();

    logInfo(`Estimated: ${formatCost(gasEstimate, gasPriceGwei || 30, ethPrice)}`);
  } catch {}

  console.log("");
  log("  ⚠️  WARNING: This will change the renderer for ALL tokens!", "yellow");
  log("  ⚠️  Make sure you have tested the new renderer thoroughly!", "yellow");
  console.log("");

  if (!await confirm("Proceed with setting renderer?")) {
    return false;
  }

  if (dryRun) {
    logHighlight("DRY RUN: Would set renderer");
    return true;
  }

  try {
    log("\n  Setting renderer...", "gray");

    exec(
      `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${CONFIG.lessContract} "setRenderer(address)" ${rendererAddress}`,
      { silent: true }
    );

    // Verify it was set correctly
    await sleep(2000);
    const newRenderer = execSilent(
      `cast call ${CONFIG.lessContract} "renderer()(address)" --rpc-url "${rpcUrl}"`
    );

    if (newRenderer && newRenderer.trim().toLowerCase() === rendererAddress.toLowerCase()) {
      logSuccess(`Renderer updated to: ${rendererAddress}`);
      return true;
    } else {
      logError(`Renderer verification failed. Expected ${rendererAddress}, got ${newRenderer?.trim()}`);
      return false;
    }
  } catch (error) {
    logError(`Failed to set renderer: ${error.message}`);
    return false;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`
${c.bright}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║          LESS NFT - OPENSEA FIX DEPLOYMENT                     ║
║                                                                ║
║   Fixes OpenSea's URL-decoding that corrupts % in JavaScript   ║
║   by using base64-encoded scripts with scriptBase64DataURI     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝${c.reset}
`);

  if (dryRun) {
    log("🔍 DRY RUN MODE - No transactions will be sent\n", "magenta");
  }

  // Validate environment
  const rpcUrl = env.MAINNET_RPC_URL;
  const privateKey = env.PRIVATE_KEY;
  const etherscanKey = env.ETHERSCAN_API_KEY;

  if (!rpcUrl) {
    logError("MAINNET_RPC_URL not set in .env");
    process.exit(1);
  }

  if (!privateKey && !dryRun) {
    logError("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  // Get deployer info
  let deployerAddress = "unknown";
  let balance = 0;

  if (privateKey) {
    try {
      deployerAddress = execSilent(`cast wallet address --private-key ${privateKey}`)?.trim() || "unknown";
      const balanceWei = execSilent(`cast balance ${deployerAddress} --rpc-url "${rpcUrl}"`);
      if (balanceWei) {
        balance = Number(BigInt(balanceWei.trim())) / 1e18;
      }
    } catch {}
  }

  // Verify deployer is owner
  let isOwner = false;
  try {
    const owner = execSilent(`cast call ${CONFIG.lessContract} "owner()(address)" --rpc-url "${rpcUrl}"`);
    isOwner = owner?.trim().toLowerCase() === deployerAddress.toLowerCase();
  } catch {}

  // Generate script name with timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const scriptName = `less-b64-v${timestamp}`;

  // Display configuration
  log("Configuration:", "bright");
  logInfo(`Network: Ethereum Mainnet`);
  logInfo(`Deployer: ${deployerAddress}`);
  logInfo(`Balance: ${balance.toFixed(4)} ETH${balance < 0.1 ? " ⚠️ LOW" : ""}`);
  logInfo(`Is Owner: ${isOwner ? "✓ Yes" : "✗ No - YOU WILL NOT BE ABLE TO SET RENDERER"}`);
  logInfo(`Script Name: ${scriptName}`);
  logInfo(`Less Contract: ${CONFIG.lessContract}`);
  logInfo(`Etherscan Key: ${etherscanKey ? "✓ Set" : "✗ Not set (verification will be skipped)"}`);
  console.log("");

  if (!isOwner && !dryRun) {
    logError("Deployer is not the owner of the Less contract!");
    logError("You will be able to deploy the renderer but not set it.");
    if (!await confirm("Continue anyway?")) {
      process.exit(1);
    }
  }

  // Confirm start
  log("This script will:", "bright");
  logInfo("1. Bundle web/onchain/index.js");
  logInfo("2. Upload base64-encoded script to ScriptyStorage");
  logInfo("3. Deploy new LessRenderer contract");
  logInfo("4. Verify contract on Etherscan");
  logInfo("5. Set new renderer on Less NFT contract");
  console.log("");

  if (!await confirm("Ready to start?")) {
    log("\nAborted.", "yellow");
    process.exit(0);
  }

  // Execute steps
  const results = {
    bundle: false,
    upload: false,
    deploy: null,
    verify: false,
    setRenderer: false,
  };

  // Step 1: Bundle
  results.bundle = await step1_Bundle();
  if (!results.bundle) {
    logError("\nBundle failed. Aborting.");
    process.exit(1);
  }

  // Step 2: Upload
  results.upload = await step2_Upload(rpcUrl, privateKey, scriptName);
  if (!results.upload) {
    logError("\nUpload failed. Aborting.");
    process.exit(1);
  }

  // Step 3: Deploy
  results.deploy = await step3_Deploy(rpcUrl, privateKey, scriptName, deployerAddress);
  if (!results.deploy) {
    logError("\nDeployment failed. Aborting.");
    process.exit(1);
  }

  // Step 4: Verify
  results.verify = await step4_Verify(results.deploy, scriptName, deployerAddress);

  // Step 5: Set Renderer
  if (isOwner || dryRun) {
    results.setRenderer = await step5_SetRenderer(rpcUrl, privateKey, results.deploy);
  } else {
    logWarning("\nSkipping setRenderer - deployer is not owner");
    logInfo(`To set renderer manually, run:`);
    logInfo(`cast send ${CONFIG.lessContract} "setRenderer(address)" ${results.deploy} --rpc-url "${rpcUrl}" --private-key <OWNER_KEY>`);
  }

  // Summary
  console.log("");
  log("═".repeat(60), "cyan");
  log("  DEPLOYMENT SUMMARY", "cyan");
  log("═".repeat(60), "cyan");
  console.log("");

  log(`  Bundle:       ${results.bundle ? "✓" : "✗"}`, results.bundle ? "green" : "red");
  log(`  Upload:       ${results.upload ? "✓" : "✗"}`, results.upload ? "green" : "red");
  log(`  Deploy:       ${results.deploy ? "✓" : "✗"}`, results.deploy ? "green" : "red");
  log(`  Verify:       ${results.verify ? "✓" : "⚠ Skipped/Failed"}`, results.verify ? "green" : "yellow");
  log(`  Set Renderer: ${results.setRenderer ? "✓" : "⚠ Skipped"}`, results.setRenderer ? "green" : "yellow");
  console.log("");

  if (results.deploy && results.deploy !== "0xDRY_RUN_RENDERER_ADDRESS") {
    log("  Deployed Addresses:", "bright");
    logInfo(`New Renderer: ${results.deploy}`);
    logInfo(`Script Name:  ${scriptName}`);
    console.log("");

    log("  Links:", "bright");
    logInfo(`Etherscan: https://etherscan.io/address/${results.deploy}`);
    logInfo(`OpenSea:   https://opensea.io/collection/less-art`);
    console.log("");

    // Save deployment info
    if (!dryRun) {
      const deploymentInfo = {
        timestamp: new Date().toISOString(),
        network: "mainnet",
        fix: "opensea-base64-encoding",
        scriptName,
        renderer: results.deploy,
        lessContract: CONFIG.lessContract,
        rendererSet: results.setRenderer,
      };
      const infoPath = join(rootDir, "deployment-opensea-fix.json");
      writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
      logInfo(`Saved to: deployment-opensea-fix.json`);
    }
  }

  if (results.setRenderer) {
    console.log("");
    log("  ✓ DEPLOYMENT COMPLETE - OpenSea fix is now live!", "green");
    logInfo("Test by refreshing metadata on OpenSea for a token.");
  } else if (results.deploy) {
    console.log("");
    log("  ⚠ Renderer deployed but not set on contract", "yellow");
    logInfo("You need to call setRenderer() with the owner key.");
  }

  console.log("");
}

main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
