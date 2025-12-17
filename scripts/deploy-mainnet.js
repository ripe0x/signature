#!/usr/bin/env node

/**
 * Mainnet Deployment Script for Less NFT
 *
 * Features:
 * - User confirmation before each step
 * - Gas estimation and cost preview
 * - Transaction confirmation waiting
 * - Retry logic for intermittent errors
 * - Clear status output
 *
 * Prerequisites:
 *   - MAINNET_RPC_URL in .env
 *   - PRIVATE_KEY in .env (deployer wallet)
 *   - ETHERSCAN_API_KEY in .env (for verification)
 *   - STRATEGY_ADDRESS in .env (RecursiveStrategy on mainnet)
 *   - PAYOUT_RECIPIENT in .env
 *   - OWNER_ADDRESS in .env
 *
 * Usage:
 *   node scripts/deploy-mainnet.js [options]
 *
 * Options:
 *   --skip-bundle      Skip JavaScript bundling
 *   --skip-upload      Skip uploading to ScriptyStorage
 *   --skip-deploy      Skip contract deployment
 *   --skip-verify      Skip Etherscan verification
 *   --dry-run          Show what would happen without executing
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Mainnet Scripty contract addresses
const MAINNET_SCRIPTY = {
  storage: "0x096451F43800f207FC32B4FF86F286EdaF736eE3",
  builder: "0x16b727a2Fc9322C724F4Bc562910c99a5edA5084",
};

// Colors
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
};

const log = (msg, color = "reset") => console.log(`${c[color]}${msg}${c.reset}`);
const logStep = (step, msg) => log(`\n${"=".repeat(60)}\n[${step}] ${msg}\n${"=".repeat(60)}`, "cyan");
const logSuccess = (msg) => log(`✓ ${msg}`, "green");
const logWarning = (msg) => log(`⚠ ${msg}`, "yellow");
const logError = (msg) => log(`✗ ${msg}`, "red");
const logInfo = (msg) => log(`  ${msg}`, "gray");

// Parse args
const args = process.argv.slice(2);
const skipBundle = args.includes("--skip-bundle");
const skipUpload = args.includes("--skip-upload");
const skipDeploy = args.includes("--skip-deploy");
const skipVerify = args.includes("--skip-verify");
const dryRun = args.includes("--dry-run");

// Load environment
function loadEnv() {
  const envPath = join(rootDir, ".env");
  const env = { ...process.env };
  if (existsSync(envPath)) {
    readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...rest] = trimmed.split("=");
        if (key && rest.length) env[key.trim()] = rest.join("=").trim();
      }
    });
  }
  return env;
}

const env = loadEnv();

// Prompt for user confirmation
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${c.yellow}${question} (y/n): ${c.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Wait for user to press enter
function waitForEnter(message = "Press Enter to continue...") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${c.dim}${message}${c.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

// Execute command with retry logic
function execWithRetry(cmd, options = {}, maxRetries = 3) {
  const { silent = false, ...execOptions } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = execSync(cmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: silent ? "pipe" : "inherit",
        ...execOptions
      });
      return result;
    } catch (error) {
      lastError = error;
      if (error.message?.includes("socket") || error.message?.includes("transport")) {
        if (attempt < maxRetries) {
          log(`  Retry ${attempt}/${maxRetries} due to connection error...`, "yellow");
          // Wait a bit before retry
          execSync("sleep 2");
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

// Get current gas price
async function getGasPrice(rpcUrl) {
  try {
    const result = execWithRetry(
      `cast gas-price --rpc-url "${rpcUrl}"`,
      { silent: true }
    ).trim();
    return BigInt(result);
  } catch {
    return null;
  }
}

// Get ETH price in USD (approximate)
async function getEthPrice() {
  try {
    const result = execWithRetry(
      `cast to-unit $(cast call 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419 "latestAnswer()(int256)" --rpc-url "${env.MAINNET_RPC_URL}") 8`,
      { silent: true }
    ).trim();
    return parseFloat(result);
  } catch {
    return 2500; // Fallback estimate
  }
}

// Estimate cost for a transaction
function estimateCost(gasUsed, gasPriceWei, ethPrice) {
  const costWei = gasUsed * gasPriceWei;
  const costEth = Number(costWei) / 1e18;
  const costUsd = costEth * ethPrice;
  return { costEth, costUsd };
}

// Wait for transaction confirmation
async function waitForTx(txHash, rpcUrl, maxWaitSecs = 300) {
  log(`  Waiting for confirmation: ${txHash}`, "gray");
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSecs) {
    try {
      const result = execWithRetry(
        `cast receipt ${txHash} --rpc-url "${rpcUrl}" --json`,
        { silent: true }
      );
      const receipt = JSON.parse(result);
      if (receipt.status === "0x1") {
        logSuccess(`Confirmed in block ${parseInt(receipt.blockNumber, 16)}`);
        return receipt;
      } else {
        logError("Transaction reverted!");
        return null;
      }
    } catch {
      process.stdout.write(".");
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  logWarning("Confirmation timeout - check manually");
  return null;
}

// Extract address from forge output
function extractAddress(output) {
  const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
  return match ? match[1] : null;
}

// Extract tx hash from output
function extractTxHash(output) {
  const match = output.match(/Transaction hash:\s*(0x[a-fA-F0-9]{64})/i);
  return match ? match[1] : null;
}

// Validate environment
function validateEnv() {
  const required = [
    "MAINNET_RPC_URL",
    "PRIVATE_KEY",
    "STRATEGY_ADDRESS",
    "PAYOUT_RECIPIENT",
    "OWNER_ADDRESS",
  ];

  const missing = required.filter(k => !env[k]);
  if (missing.length > 0) {
    logError(`Missing required environment variables:`);
    missing.forEach(k => logError(`  - ${k}`));
    process.exit(1);
  }

  // Validate addresses
  const addressVars = ["STRATEGY_ADDRESS", "PAYOUT_RECIPIENT", "OWNER_ADDRESS"];
  for (const k of addressVars) {
    if (!env[k].match(/^0x[a-fA-F0-9]{40}$/)) {
      logError(`Invalid address format for ${k}: ${env[k]}`);
      process.exit(1);
    }
  }

  return {
    rpcUrl: env.MAINNET_RPC_URL,
    privateKey: env.PRIVATE_KEY,
    strategy: env.STRATEGY_ADDRESS,
    payoutRecipient: env.PAYOUT_RECIPIENT,
    owner: env.OWNER_ADDRESS,
    etherscanKey: env.ETHERSCAN_API_KEY,
    scriptName: env.SCRIPT_NAME || "less",
    baseImageURL: env.BASE_IMAGE_URL || "https://less.art/images/",
    mintPrice: env.MINT_PRICE || "10000000000000000", // 0.01 ETH
  };
}

// Get deployer info
function getDeployerInfo(rpcUrl, privateKey) {
  const address = execWithRetry(
    `cast wallet address --private-key ${privateKey}`,
    { silent: true }
  ).trim();

  const balance = execWithRetry(
    `cast balance ${address} --rpc-url "${rpcUrl}"`,
    { silent: true }
  ).trim();

  const balanceEth = Number(BigInt(balance)) / 1e18;

  return { address, balance: BigInt(balance), balanceEth };
}

// ============================================================
// STEP 1: Bundle JavaScript
// ============================================================
async function stepBundle() {
  if (skipBundle) {
    logWarning("Skipping bundle step");
    return true;
  }

  logStep("1/5", "Bundle JavaScript");

  const entryPoint = join(rootDir, "web/onchain/index.js");
  const outputPath = join(rootDir, "web/onchain/bundled.js");

  if (!existsSync(entryPoint)) {
    logError(`Entry point not found: ${entryPoint}`);
    return false;
  }

  log("\nThis will bundle the JavaScript for on-chain storage.", "gray");
  log("No gas cost - local operation only.\n", "gray");

  if (dryRun) {
    logInfo("DRY RUN: Would bundle JavaScript");
    return true;
  }

  if (!await confirm("Proceed with bundling?")) {
    return false;
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

    const bundleSize = readFileSync(outputPath, "utf-8").length;
    logSuccess(`Bundle created: ${(bundleSize / 1024).toFixed(2)} KB`);
    return true;
  } catch (error) {
    logError(`Bundle failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// STEP 2: Upload to ScriptyStorage
// ============================================================
async function stepUpload(config, gasPrice, ethPrice) {
  if (skipUpload) {
    logWarning("Skipping upload step");
    return true;
  }

  logStep("2/5", "Upload Script to ScriptyStorage");

  const scriptPath = join(rootDir, "web/onchain/bundled.js");
  if (!existsSync(scriptPath)) {
    logError("Bundled script not found. Run without --skip-bundle first.");
    return false;
  }

  const scriptContent = readFileSync(scriptPath, "utf-8");
  const scriptBytes = Buffer.from(scriptContent, "utf-8");
  const chunkSize = 24000;
  const numChunks = Math.ceil(scriptBytes.length / chunkSize);

  // Estimate gas
  const createGas = 100000n;
  const chunkGas = 200000n * BigInt(numChunks); // ~200k per chunk
  const totalGas = createGas + chunkGas;
  const { costEth, costUsd } = estimateCost(totalGas, gasPrice, ethPrice);

  log(`\nScript: ${config.scriptName}`, "gray");
  log(`Size: ${scriptBytes.length} bytes (${numChunks} chunks)`, "gray");
  log(`Storage: ${MAINNET_SCRIPTY.storage}`, "gray");
  log(`\nEstimated cost:`, "yellow");
  log(`  Gas: ~${totalGas.toLocaleString()}`, "yellow");
  log(`  ETH: ~${costEth.toFixed(4)} ETH`, "yellow");
  log(`  USD: ~$${costUsd.toFixed(2)}`, "yellow");

  if (dryRun) {
    logInfo("\nDRY RUN: Would upload script to ScriptyStorage");
    return true;
  }

  if (!await confirm("\nProceed with upload?")) {
    return false;
  }

  // Step 2a: Create content entry
  log("\n[2a] Creating content entry...", "cyan");
  try {
    const createCmd = `cast send --rpc-url "${config.rpcUrl}" --private-key ${config.privateKey} ${MAINNET_SCRIPTY.storage} "createContent(string,bytes)" "${config.scriptName}" "0x"`;
    const result = execWithRetry(createCmd, { silent: true });
    const txHash = extractTxHash(result);
    if (txHash) await waitForTx(txHash, config.rpcUrl);
    logSuccess("Content entry created");
  } catch (error) {
    if (error.message?.includes("already exists") || error.message?.includes("revert")) {
      logWarning("Content entry may already exist, continuing...");
    } else {
      logError(`Failed: ${error.message}`);
      if (!await confirm("Continue anyway?")) return false;
    }
  }

  // Step 2b: Upload chunks
  for (let i = 0; i < numChunks; i++) {
    log(`\n[2b] Uploading chunk ${i + 1}/${numChunks}...`, "cyan");

    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, scriptBytes.length);
    const chunk = scriptBytes.slice(start, end);
    const chunkHex = "0x" + chunk.toString("hex");

    logInfo(`Bytes ${start}-${end} (${chunk.length} bytes)`);

    if (!await confirm(`Upload chunk ${i + 1}?`)) {
      return false;
    }

    try {
      const chunkCmd = `cast send --rpc-url "${config.rpcUrl}" --private-key ${config.privateKey} ${MAINNET_SCRIPTY.storage} "addChunkToContent(string,bytes)" "${config.scriptName}" ${chunkHex}`;
      const result = execWithRetry(chunkCmd, { silent: true });
      const txHash = extractTxHash(result);
      if (txHash) await waitForTx(txHash, config.rpcUrl);
      logSuccess(`Chunk ${i + 1} uploaded`);
    } catch (error) {
      logError(`Chunk upload failed: ${error.message}`);
      return false;
    }
  }

  // Verify
  log("\n[2c] Verifying upload...", "cyan");
  try {
    const result = execWithRetry(
      `cast call ${MAINNET_SCRIPTY.storage} "getContent(string,bytes)(bytes)" "${config.scriptName}" "0x" --rpc-url "${config.rpcUrl}"`,
      { silent: true }
    ).trim();
    if (result && result !== "0x" && result.length > 10) {
      logSuccess(`Verified: ${(result.length - 2) / 2} bytes stored`);
    } else {
      logWarning("Verification returned empty");
    }
  } catch (error) {
    logWarning(`Verification failed: ${error.message}`);
  }

  await waitForEnter();
  return true;
}

// ============================================================
// STEP 3: Deploy Less Contract
// ============================================================
async function stepDeployLess(config, gasPrice, ethPrice) {
  if (skipDeploy) {
    logWarning("Skipping Less deployment");
    return null;
  }

  logStep("3/5", "Deploy Less NFT Contract");

  // Estimate gas (contract creation ~2M gas)
  const deployGas = 2000000n;
  const { costEth, costUsd } = estimateCost(deployGas, gasPrice, ethPrice);

  log(`\nConstructor args:`, "gray");
  log(`  strategy: ${config.strategy}`, "gray");
  log(`  mintPrice: ${config.mintPrice} wei (${Number(config.mintPrice) / 1e18} ETH)`, "gray");
  log(`  payoutRecipient: ${config.payoutRecipient}`, "gray");
  log(`  owner: ${config.owner}`, "gray");
  log(`\nEstimated cost:`, "yellow");
  log(`  Gas: ~${deployGas.toLocaleString()}`, "yellow");
  log(`  ETH: ~${costEth.toFixed(4)} ETH`, "yellow");
  log(`  USD: ~$${costUsd.toFixed(2)}`, "yellow");

  if (dryRun) {
    logInfo("\nDRY RUN: Would deploy Less contract");
    return "0xDRY_RUN_LESS_ADDRESS";
  }

  if (!await confirm("\nDeploy Less contract?")) {
    return null;
  }

  try {
    log("\nDeploying...", "gray");
    const cmd = `forge create contracts/Less.sol:Less --rpc-url "${config.rpcUrl}" --private-key ${config.privateKey} --broadcast --constructor-args ${config.strategy} ${config.mintPrice} ${config.payoutRecipient} ${config.owner}`;

    const result = execWithRetry(cmd, { silent: true });
    const address = extractAddress(result);
    const txHash = extractTxHash(result);

    if (!address) {
      logError("Could not extract contract address");
      console.log(result);
      return null;
    }

    if (txHash) await waitForTx(txHash, config.rpcUrl);
    logSuccess(`Less deployed: ${address}`);

    await waitForEnter();
    return address;
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    return null;
  }
}

// ============================================================
// STEP 4: Deploy LessRenderer Contract
// ============================================================
async function stepDeployRenderer(config, lessAddress, gasPrice, ethPrice) {
  if (skipDeploy) {
    logWarning("Skipping LessRenderer deployment");
    return null;
  }

  logStep("4/5", "Deploy LessRenderer Contract");

  // Estimate gas
  const deployGas = 3000000n;
  const setRendererGas = 50000n;
  const totalGas = deployGas + setRendererGas;
  const { costEth, costUsd } = estimateCost(totalGas, gasPrice, ethPrice);

  log(`\nConstructor args:`, "gray");
  log(`  less: ${lessAddress}`, "gray");
  log(`  scriptyBuilder: ${MAINNET_SCRIPTY.builder}`, "gray");
  log(`  scriptyStorage: ${MAINNET_SCRIPTY.storage}`, "gray");
  log(`  scriptName: "${config.scriptName}"`, "gray");
  log(`  baseImageURL: "${config.baseImageURL}"`, "gray");
  log(`  owner: ${config.owner}`, "gray");
  log(`\nEstimated cost (deploy + setRenderer):`, "yellow");
  log(`  Gas: ~${totalGas.toLocaleString()}`, "yellow");
  log(`  ETH: ~${costEth.toFixed(4)} ETH`, "yellow");
  log(`  USD: ~$${costUsd.toFixed(2)}`, "yellow");

  if (dryRun) {
    logInfo("\nDRY RUN: Would deploy LessRenderer contract");
    return "0xDRY_RUN_RENDERER_ADDRESS";
  }

  if (!await confirm("\nDeploy LessRenderer contract?")) {
    return null;
  }

  let rendererAddress;

  // Deploy renderer
  try {
    log("\n[4a] Deploying LessRenderer...", "cyan");
    const cmd = `forge create contracts/LessRenderer.sol:LessRenderer --rpc-url "${config.rpcUrl}" --private-key ${config.privateKey} --broadcast --constructor-args ${lessAddress} ${MAINNET_SCRIPTY.builder} ${MAINNET_SCRIPTY.storage} "${config.scriptName}" "${config.baseImageURL}" ${config.owner}`;

    const result = execWithRetry(cmd, { silent: true });
    rendererAddress = extractAddress(result);
    const txHash = extractTxHash(result);

    if (!rendererAddress) {
      logError("Could not extract contract address");
      console.log(result);
      return null;
    }

    if (txHash) await waitForTx(txHash, config.rpcUrl);
    logSuccess(`LessRenderer deployed: ${rendererAddress}`);
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    return null;
  }

  // Set renderer on Less contract
  log("\n[4b] Setting renderer on Less contract...", "cyan");
  if (!await confirm("Call setRenderer on Less?")) {
    logWarning("Skipped setRenderer - you'll need to call this manually");
    return rendererAddress;
  }

  try {
    const cmd = `cast send --rpc-url "${config.rpcUrl}" --private-key ${config.privateKey} ${lessAddress} "setRenderer(address)" ${rendererAddress}`;
    const result = execWithRetry(cmd, { silent: true });
    const txHash = extractTxHash(result);
    if (txHash) await waitForTx(txHash, config.rpcUrl);
    logSuccess("Renderer set on Less contract");
  } catch (error) {
    logError(`setRenderer failed: ${error.message}`);
    logWarning(`You'll need to manually call: Less.setRenderer(${rendererAddress})`);
  }

  await waitForEnter();
  return rendererAddress;
}

// ============================================================
// STEP 5: Verify Contracts
// ============================================================
async function stepVerify(config, lessAddress, rendererAddress) {
  if (skipVerify || !config.etherscanKey) {
    if (!config.etherscanKey) {
      logWarning("ETHERSCAN_API_KEY not set - skipping verification");
    } else {
      logWarning("Skipping verification step");
    }
    return;
  }

  logStep("5/5", "Verify Contracts on Etherscan");

  if (dryRun) {
    logInfo("DRY RUN: Would verify contracts on Etherscan");
    return;
  }

  if (!await confirm("Verify contracts on Etherscan?")) {
    return;
  }

  // Verify Less
  log("\n[5a] Verifying Less...", "cyan");
  try {
    const cmd = `forge verify-contract ${lessAddress} contracts/Less.sol:Less --chain mainnet --constructor-args $(cast abi-encode "constructor(address,uint256,address,address)" ${config.strategy} ${config.mintPrice} ${config.payoutRecipient} ${config.owner}) --watch`;
    execWithRetry(cmd);
    logSuccess("Less verified");
  } catch (error) {
    logWarning(`Less verification failed: ${error.message}`);
  }

  // Verify LessRenderer
  log("\n[5b] Verifying LessRenderer...", "cyan");
  try {
    const cmd = `forge verify-contract ${rendererAddress} contracts/LessRenderer.sol:LessRenderer --chain mainnet --constructor-args $(cast abi-encode "constructor(address,address,address,string,string,address)" ${lessAddress} ${MAINNET_SCRIPTY.builder} ${MAINNET_SCRIPTY.storage} "${config.scriptName}" "${config.baseImageURL}" ${config.owner}) --watch`;
    execWithRetry(cmd);
    logSuccess("LessRenderer verified");
  } catch (error) {
    logWarning(`LessRenderer verification failed: ${error.message}`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(`
${c.bright}╔════════════════════════════════════════════════════════════╗
║                                                              ║
║            LESS NFT - MAINNET DEPLOYMENT                     ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝${c.reset}
`);

  if (dryRun) {
    log("🔍 DRY RUN MODE - No transactions will be sent\n", "magenta");
  }

  // Validate environment
  const config = validateEnv();

  // Get deployer info
  log("Checking deployer wallet...", "gray");
  const deployer = getDeployerInfo(config.rpcUrl, config.privateKey);

  // Get gas price
  log("Fetching gas price...", "gray");
  const gasPrice = await getGasPrice(config.rpcUrl);
  const gasPriceGwei = gasPrice ? Number(gasPrice) / 1e9 : 0;

  // Get ETH price
  log("Fetching ETH price...", "gray");
  const ethPrice = await getEthPrice();

  // Display summary
  log(`\n${"─".repeat(60)}`, "dim");
  log(`Network:          Ethereum Mainnet (Chain ID: 1)`, "gray");
  log(`Deployer:         ${deployer.address}`, "gray");
  log(`Balance:          ${deployer.balanceEth.toFixed(4)} ETH`, deployer.balanceEth < 0.5 ? "yellow" : "gray");
  log(`Gas Price:        ${gasPriceGwei.toFixed(2)} gwei`, "gray");
  log(`ETH Price:        $${ethPrice.toFixed(2)}`, "gray");
  log(`${"─".repeat(60)}`, "dim");
  log(`Strategy:         ${config.strategy}`, "gray");
  log(`Payout:           ${config.payoutRecipient}`, "gray");
  log(`Owner:            ${config.owner}`, "gray");
  log(`Script Name:      ${config.scriptName}`, "gray");
  log(`ScriptyStorage:   ${MAINNET_SCRIPTY.storage}`, "gray");
  log(`ScriptyBuilder:   ${MAINNET_SCRIPTY.builder}`, "gray");
  log(`${"─".repeat(60)}\n`, "dim");

  // Estimate total cost
  const totalGasEstimate = 100000n + 400000n + 2000000n + 3000000n + 50000n; // upload + less + renderer + setRenderer
  const { costEth: totalCostEth, costUsd: totalCostUsd } = estimateCost(totalGasEstimate, gasPrice, ethPrice);

  log(`Estimated total cost: ~${totalCostEth.toFixed(4)} ETH (~$${totalCostUsd.toFixed(2)})\n`, "yellow");

  if (deployer.balanceEth < totalCostEth * 1.5) {
    logWarning(`Balance may be insufficient. Recommended: ${(totalCostEth * 1.5).toFixed(4)} ETH`);
  }

  if (!await confirm("Ready to begin deployment?")) {
    log("\nDeployment cancelled.", "yellow");
    process.exit(0);
  }

  // Execute steps
  const results = {
    bundled: false,
    uploaded: false,
    lessAddress: null,
    rendererAddress: null,
  };

  // Step 1: Bundle
  results.bundled = await stepBundle();
  if (!results.bundled && !skipBundle) {
    logError("Bundle step failed");
    process.exit(1);
  }

  // Step 2: Upload
  results.uploaded = await stepUpload(config, gasPrice, ethPrice);
  if (!results.uploaded && !skipUpload) {
    logError("Upload step failed");
    process.exit(1);
  }

  // Step 3: Deploy Less
  results.lessAddress = await stepDeployLess(config, gasPrice, ethPrice);
  if (!results.lessAddress && !skipDeploy) {
    logError("Less deployment failed");
    process.exit(1);
  }

  // Step 4: Deploy Renderer
  results.rendererAddress = await stepDeployRenderer(config, results.lessAddress, gasPrice, ethPrice);
  if (!results.rendererAddress && !skipDeploy) {
    logError("Renderer deployment failed");
    process.exit(1);
  }

  // Step 5: Verify
  if (results.lessAddress && results.rendererAddress) {
    await stepVerify(config, results.lessAddress, results.rendererAddress);
  }

  // Summary
  console.log(`
${c.green}╔════════════════════════════════════════════════════════════╗
║                                                              ║
║                 DEPLOYMENT COMPLETE                          ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝${c.reset}
`);

  if (results.lessAddress) {
    log(`Less NFT:        ${results.lessAddress}`, "green");
    log(`                 https://etherscan.io/address/${results.lessAddress}`, "gray");
  }
  if (results.rendererAddress) {
    log(`LessRenderer:    ${results.rendererAddress}`, "green");
    log(`                 https://etherscan.io/address/${results.rendererAddress}`, "gray");
  }

  // Save deployment info
  if (!dryRun && results.lessAddress) {
    const deploymentInfo = {
      network: "mainnet",
      chainId: 1,
      timestamp: new Date().toISOString(),
      contracts: {
        less: results.lessAddress,
        renderer: results.rendererAddress,
      },
      config: {
        strategy: config.strategy,
        payoutRecipient: config.payoutRecipient,
        owner: config.owner,
        scriptName: config.scriptName,
        baseImageURL: config.baseImageURL,
        mintPrice: config.mintPrice,
      },
      scripty: MAINNET_SCRIPTY,
    };

    const infoPath = join(rootDir, "deployment-mainnet.json");
    writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
    log(`\nDeployment info saved to: ${infoPath}`, "gray");
  }
}

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
