#!/usr/bin/env node

/**
 * Unified Deployment Script for Less NFT
 *
 * Supports all environments: mainnet, sepolia, local (fork)
 *
 * Usage:
 *   node scripts/deploy.js --network <network> [options]
 *
 * Networks:
 *   mainnet   - Ethereum mainnet (requires full config)
 *   sepolia   - Sepolia testnet (uses MockLess)
 *   local     - Local anvil fork (uses MockLess + forked Scripty)
 *
 * Options:
 *   --skip-bundle    Skip JavaScript bundling
 *   --skip-upload    Skip ScriptyStorage upload
 *   --skip-deploy    Skip contract deployment
 *   --skip-verify    Skip Etherscan verification
 *   --dry-run        Preview without executing transactions
 *   --yes            Skip confirmation prompts
 *
 * Environment Variables:
 *   MAINNET_RPC_URL    - Mainnet RPC endpoint
 *   SEPOLIA_RPC_URL    - Sepolia RPC endpoint
 *   PRIVATE_KEY        - Deployer private key
 *   ETHERSCAN_API_KEY  - For contract verification
 *   STRATEGY_ADDRESS   - RecursiveStrategy (mainnet only)
 *   PAYOUT_RECIPIENT   - Receives mint fees (mainnet only)
 *   OWNER_ADDRESS      - Contract owner
 *   SCRIPT_NAME        - Name in ScriptyStorage (optional)
 *   BASE_IMAGE_URL     - Static image URL base (optional)
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
// Network Configuration
// ============================================================

const NETWORKS = {
  mainnet: {
    chainId: 1,
    rpcEnvVar: "MAINNET_RPC_URL",
    scriptyStorage: "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699",
    scriptyBuilder: "0xD7587F110E08F4D120A231bA97d3B577A81Df022",
    useMockLess: false,
    verify: true,
    confirmations: true,
  },
  sepolia: {
    chainId: 11155111,
    rpcEnvVar: "SEPOLIA_RPC_URL",
    scriptyStorage: "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699",
    scriptyBuilder: "0xD7587F110E08F4D120A231bA97d3B577A81Df022",
    useMockLess: true,
    verify: true,
    confirmations: true,
  },
  local: {
    chainId: 31337,
    rpcEnvVar: "MAINNET_RPC_URL", // Fork mainnet
    rpcUrl: "http://127.0.0.1:8545",
    scriptyStorage: "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699",
    scriptyBuilder: "0xD7587F110E08F4D120A231bA97d3B577A81Df022",
    useMockLess: true,
    verify: false,
    confirmations: false,
  },
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
};

const log = (msg, color = "reset") => console.log(`${c[color]}${msg}${c.reset}`);
const logStep = (step, msg) => log(`\n${"─".repeat(50)}\n[${step}] ${msg}\n${"─".repeat(50)}`, "cyan");
const logSuccess = (msg) => log(`✓ ${msg}`, "green");
const logWarning = (msg) => log(`⚠ ${msg}`, "yellow");
const logError = (msg) => log(`✗ ${msg}`, "red");
const logInfo = (msg) => log(`  ${msg}`, "gray");

// ============================================================
// Argument Parsing
// ============================================================

const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const networkName = getArg("network") || args.find(a => !a.startsWith("--")) || null;
const skipBundle = hasFlag("skip-bundle");
const skipUpload = hasFlag("skip-upload");
const skipDeploy = hasFlag("skip-deploy");
const skipVerify = hasFlag("skip-verify");
const dryRun = hasFlag("dry-run");
const autoYes = hasFlag("yes");

// ============================================================
// Environment Loading
// ============================================================

function loadEnv() {
  const envPath = join(rootDir, ".env");
  const env = {};
  // Load .env file first
  if (existsSync(envPath)) {
    readFileSync(envPath, "utf-8").split("\n").forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...rest] = trimmed.split("=");
        if (key && rest.length) env[key.trim()] = rest.join("=").trim();
      }
    });
  }
  // CLI environment variables override .env
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
    rl.question(`${c.yellow}${question} (y/n): ${c.reset}`, answer => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function execWithRetry(cmd, options = {}, maxRetries = 3) {
  const { silent = false } = options;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return execSync(cmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: silent ? "pipe" : "inherit",
      });
    } catch (error) {
      if (error.message?.includes("socket") && attempt < maxRetries) {
        log(`  Retry ${attempt}/${maxRetries}...`, "yellow");
        execSync("sleep 2");
        continue;
      }
      throw error;
    }
  }
}

function extractAddress(output) {
  const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
  return match ? match[1] : null;
}

function extractTxHash(output) {
  const match = output.match(/Transaction hash:\s*(0x[a-fA-F0-9]{64})/i);
  return match ? match[1] : null;
}

// Fetch ETH price for USD estimates
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

// Format gas cost for display
function formatGasCost(gasUsed, gasPriceGwei, ethPrice) {
  const ethCost = (gasUsed * gasPriceGwei) / 1e9;
  let msg = `${gasUsed.toLocaleString()} gas (~${ethCost.toFixed(6)} ETH`;
  if (ethPrice) {
    msg += ` / $${(ethCost * ethPrice).toFixed(2)}`;
  }
  msg += ")";
  return msg;
}

async function waitForTx(txHash, rpcUrl, maxWait = 180) {
  log(`  Waiting for tx: ${txHash.slice(0, 10)}...`, "gray");
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWait) {
    try {
      const result = execSync(
        `cast receipt ${txHash} --rpc-url "${rpcUrl}" --json`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );
      const receipt = JSON.parse(result);
      if (receipt.status === "0x1") {
        logSuccess(`Confirmed in block ${parseInt(receipt.blockNumber, 16)}`);
        return receipt;
      } else {
        logError("Transaction reverted");
        return null;
      }
    } catch {
      process.stdout.write(".");
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  logWarning("Confirmation timeout");
  return null;
}

// ============================================================
// Step 1: Bundle JavaScript
// ============================================================

async function stepBundle() {
  if (skipBundle) {
    logWarning("Skipping bundle");
    return true;
  }

  logStep("1/4", "Bundle JavaScript");

  const entryPoint = join(rootDir, "web/onchain/index.js");
  const outputPath = join(rootDir, "web/onchain/bundled.js");

  if (!existsSync(entryPoint)) {
    logError(`Entry point not found: ${entryPoint}`);
    return false;
  }

  if (dryRun) {
    logInfo("DRY RUN: Would bundle JavaScript");
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

async function stepUpload(network, rpcUrl, privateKey) {
  if (skipUpload) {
    logWarning("Skipping upload");
    return true;
  }

  logStep("2/4", "Upload to ScriptyStorage");

  const scriptPath = join(rootDir, "web/onchain/bundled.js");
  if (!existsSync(scriptPath)) {
    logError("Bundled script not found");
    return false;
  }

  const scriptName = env.SCRIPT_NAME || (network.useMockLess ? `less-${networkName}` : "less");
  const scriptBytes = readFileSync(scriptPath);
  const chunkSize = 24000;
  const numChunks = Math.ceil(scriptBytes.length / chunkSize);

  logInfo(`Script: ${scriptName}`);
  logInfo(`Size: ${scriptBytes.length} bytes (${numChunks} chunks)`);
  logInfo(`Storage: ${network.scriptyStorage}`);

  // Estimate gas for upload
  log("\n  Estimating upload costs...", "gray");
  let totalGas = 0;
  let gasPriceGwei = null;
  let ethPrice = null;

  try {
    // Get gas price
    const gasPriceWei = execSync(
      `cast gas-price --rpc-url "${rpcUrl}"`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();
    gasPriceGwei = Number(BigInt(gasPriceWei)) / 1e9;

    // Estimate createContent gas
    try {
      const createGas = execSync(
        `cast estimate --rpc-url "${rpcUrl}" ${network.scriptyStorage} "createContent(string,bytes)" "${scriptName}" "0x"`,
        { encoding: "utf-8", stdio: "pipe" }
      ).trim();
      totalGas += parseInt(createGas);
    } catch {
      totalGas += 100000; // Fallback estimate
    }

    // Estimate gas for each chunk
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, scriptBytes.length);
      const chunk = scriptBytes.slice(start, end);
      const chunkHex = "0x" + chunk.toString("hex");

      try {
        const chunkGas = execSync(
          `cast estimate --rpc-url "${rpcUrl}" ${network.scriptyStorage} "addChunkToContent(string,bytes)" "${scriptName}" ${chunkHex}`,
          { encoding: "utf-8", stdio: "pipe" }
        ).trim();
        totalGas += parseInt(chunkGas);
      } catch {
        totalGas += 500000; // Fallback per chunk
      }
    }

    ethPrice = await getEthPrice();

    const ethCost = (totalGas * gasPriceGwei) / 1e9;
    log("\n  Upload Cost Estimate:", "cyan");
    logInfo(`Transactions: ${numChunks + 1} (1 create + ${numChunks} chunks)`);
    logInfo(`Total gas: ${totalGas.toLocaleString()}`);
    logInfo(`Gas price: ${gasPriceGwei.toFixed(2)} gwei`);
    logInfo(`ETH: ${ethCost.toFixed(6)} ETH`);
    if (ethPrice) {
      log(`  USD: ~$${(ethCost * ethPrice).toFixed(2)} (at $${ethPrice}/ETH)`, "yellow");
    }
    log("", "reset");
  } catch (error) {
    logWarning(`Gas estimation failed: ${error.message}`);
  }

  if (dryRun) {
    logInfo("DRY RUN: Skipping actual upload");
    return true;
  }

  if (!autoYes && !await confirm("Proceed with upload?")) {
    return false;
  }

  // Create content entry
  log("\n  Creating content entry...", "gray");
  try {
    execWithRetry(
      `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${network.scriptyStorage} "createContent(string,bytes)" "${scriptName}" "0x"`,
      { silent: true }
    );
    logSuccess("Content entry created");
  } catch {
    logWarning("Content may already exist, continuing...");
  }

  // Upload chunks
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, scriptBytes.length);
    const chunk = scriptBytes.slice(start, end);
    const chunkHex = "0x" + chunk.toString("hex");

    log(`  Uploading chunk ${i + 1}/${numChunks} (${chunk.length} bytes)...`, "gray");

    try {
      const result = execWithRetry(
        `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${network.scriptyStorage} "addChunkToContent(string,bytes)" "${scriptName}" ${chunkHex}`,
        { silent: true }
      );

      if (network.confirmations) {
        const txHash = extractTxHash(result);
        if (txHash) await waitForTx(txHash, rpcUrl);
      }
      logSuccess(`Chunk ${i + 1}/${numChunks} uploaded`);
    } catch (error) {
      logError(`Chunk ${i + 1} failed: ${error.message}`);
      return false;
    }
  }

  logSuccess("Upload complete");
  return true;
}

// ============================================================
// Step 3: Deploy Contracts
// ============================================================

async function stepDeploy(network, rpcUrl, privateKey) {
  if (skipDeploy) {
    logWarning("Skipping deployment");
    return null;
  }

  logStep("3/4", "Deploy Contracts");

  logInfo(`Network: ${networkName}`);
  logInfo(`Using MockLess: ${network.useMockLess}`);

  // Run simulation to get gas estimates
  log("\n  Simulating deployment...", "gray");

  let gasEstimate = null;
  let gasPriceGwei = null;
  let ethPrice = null;

  try {
    const simCmd = [
      "forge script script/Deploy.s.sol:Deploy",
      `--rpc-url "${rpcUrl}"`,
      `--private-key ${privateKey}`,
      "-vvv",
    ].join(" ");

    const simResult = execWithRetry(simCmd, { silent: true });

    // Parse gas estimates
    const gasMatch = simResult.match(/Estimated total gas used for script:\s*([\d,]+)/);
    const gasPriceMatch = simResult.match(/Estimated gas price:\s*([\d.]+)\s*gwei/);

    if (gasMatch) gasEstimate = parseInt(gasMatch[1].replace(/,/g, ""));
    if (gasPriceMatch) gasPriceGwei = parseFloat(gasPriceMatch[1]);

    // Get current ETH price
    ethPrice = await getEthPrice();

    if (gasEstimate && gasPriceGwei) {
      const ethCost = (gasEstimate * gasPriceGwei) / 1e9;
      log("\n  Deployment Cost Estimate:", "cyan");
      logInfo(`Gas: ${gasEstimate.toLocaleString()}`);
      logInfo(`Gas price: ${gasPriceGwei.toFixed(2)} gwei`);
      logInfo(`ETH: ${ethCost.toFixed(6)} ETH`);
      if (ethPrice) {
        log(`  USD: ~$${(ethCost * ethPrice).toFixed(2)} (at $${ethPrice}/ETH)`, "yellow");
      }
      log("", "reset");
    }
  } catch (error) {
    logWarning(`Simulation failed: ${error.message}`);
  }

  if (dryRun) {
    logInfo("DRY RUN: Skipping actual deployment");
    return { less: "0xDRY_RUN", renderer: "0xDRY_RUN" };
  }

  if (!autoYes && !await confirm("Proceed with deployment?")) {
    return null;
  }

  try {
    log("\n  Broadcasting transactions...", "gray");

    const forgeCmd = [
      "forge script script/Deploy.s.sol:Deploy",
      `--rpc-url "${rpcUrl}"`,
      `--private-key ${privateKey}`,
      "--broadcast",
      network.confirmations ? "--slow" : "",
      "-vvv",
    ].filter(Boolean).join(" ");

    const result = execWithRetry(forgeCmd, { silent: true });

    // Extract addresses from output
    const lessMatch = result.match(/Less(?:Mock)?.*?deployed.*?:\s*(0x[a-fA-F0-9]{40})/i) ||
                      result.match(/MockLess deployed at:\s*(0x[a-fA-F0-9]{40})/i) ||
                      result.match(/Less deployed at:\s*(0x[a-fA-F0-9]{40})/i);
    const rendererMatch = result.match(/LessRenderer deployed at:\s*(0x[a-fA-F0-9]{40})/i);

    const addresses = {
      less: lessMatch ? lessMatch[1] : null,
      renderer: rendererMatch ? rendererMatch[1] : null,
    };

    if (!addresses.less || !addresses.renderer) {
      // Try to extract from broadcast file
      const broadcastPath = join(rootDir, `broadcast/Deploy.s.sol/${network.chainId}/run-latest.json`);
      if (existsSync(broadcastPath)) {
        const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
        for (const tx of broadcast.transactions || []) {
          if (tx.contractName === "MockLess" || tx.contractName === "Less") {
            addresses.less = tx.contractAddress;
          }
          if (tx.contractName === "LessRenderer") {
            addresses.renderer = tx.contractAddress;
          }
        }
      }
    }

    if (addresses.less) logSuccess(`Less: ${addresses.less}`);
    if (addresses.renderer) logSuccess(`Renderer: ${addresses.renderer}`);

    return addresses;
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    return null;
  }
}

// ============================================================
// Step 4: Verify Contracts
// ============================================================

async function stepVerify(network, addresses) {
  if (skipVerify || !network.verify) {
    if (!network.verify) logInfo("Verification not available for this network");
    else logWarning("Skipping verification");
    return;
  }

  if (!env.ETHERSCAN_API_KEY) {
    logWarning("ETHERSCAN_API_KEY not set, skipping verification");
    return;
  }

  logStep("4/4", "Verify Contracts on Etherscan");

  if (dryRun) {
    logInfo("DRY RUN: Would verify contracts on Etherscan");
    return;
  }

  const chainName = networkName === "mainnet" ? "mainnet" : "sepolia";

  // Verify Less/MockLess
  if (addresses.less) {
    log("\n  Verifying Less contract...", "gray");
    try {
      const contractName = network.useMockLess
        ? "contracts/test/MockLess.sol:MockLess"
        : "contracts/Less.sol:Less";

      let cmd = `forge verify-contract ${addresses.less} ${contractName} --chain ${chainName} --watch`;

      if (!network.useMockLess) {
        const constructorArgs = execSync(
          `cast abi-encode "constructor(address,uint256,address,address)" ${env.STRATEGY_ADDRESS} ${env.MINT_PRICE || "1000000000000000"} ${env.PAYOUT_RECIPIENT} ${env.OWNER_ADDRESS}`,
          { encoding: "utf-8", cwd: rootDir }
        ).trim();
        cmd += ` --constructor-args ${constructorArgs}`;
      }

      execWithRetry(cmd);
      logSuccess("Less verified");
    } catch (error) {
      logWarning(`Less verification failed: ${error.message}`);
    }
  }

  // Verify Renderer
  if (addresses.renderer) {
    log("\n  Verifying LessRenderer...", "gray");
    try {
      const scriptName = env.SCRIPT_NAME || (network.useMockLess ? `less-${networkName}` : "less");
      const baseImageURL = env.BASE_IMAGE_URL || "https://less.art/images/";
      const owner = env.OWNER_ADDRESS || addresses.less; // Fallback

      const constructorArgs = execSync(
        `cast abi-encode "constructor(address,address,address,string,string,address)" ${addresses.less} ${network.scriptyBuilder} ${network.scriptyStorage} "${scriptName}" "${baseImageURL}" ${owner}`,
        { encoding: "utf-8", cwd: rootDir }
      ).trim();

      execWithRetry(
        `forge verify-contract ${addresses.renderer} contracts/LessRenderer.sol:LessRenderer --chain ${chainName} --constructor-args ${constructorArgs} --watch`
      );
      logSuccess("LessRenderer verified");
    } catch (error) {
      logWarning(`LessRenderer verification failed: ${error.message}`);
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`
${c.bright}╔════════════════════════════════════════════════════════╗
║           LESS NFT - UNIFIED DEPLOYMENT                ║
╚════════════════════════════════════════════════════════╝${c.reset}
`);

  // Validate network
  if (!networkName || !NETWORKS[networkName]) {
    logError("Usage: node scripts/deploy.js --network <mainnet|sepolia|local> [options]");
    logError("");
    logError("Options:");
    logError("  --skip-bundle    Skip JS bundling");
    logError("  --skip-upload    Skip ScriptyStorage upload");
    logError("  --skip-deploy    Skip contract deployment");
    logError("  --skip-verify    Skip Etherscan verification");
    logError("  --dry-run        Preview without executing");
    logError("  --yes            Skip confirmation prompts");
    process.exit(1);
  }

  const network = NETWORKS[networkName];

  if (dryRun) {
    log("DRY RUN MODE - No transactions will be sent\n", "magenta");
  }

  // Get RPC URL
  const rpcUrl = network.rpcUrl || env[network.rpcEnvVar];
  if (!rpcUrl && !skipDeploy && !skipUpload) {
    logError(`${network.rpcEnvVar} not set in .env`);
    process.exit(1);
  }

  // Get private key
  const privateKey = env.PRIVATE_KEY;
  if (!privateKey && !skipDeploy && !skipUpload && !dryRun) {
    logError("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  // Get deployer address
  let deployerAddress = "unknown";
  let balance = 0;
  if (privateKey) {
    try {
      deployerAddress = execSync(`cast wallet address --private-key ${privateKey}`, {
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      const balanceWei = execSync(`cast balance ${deployerAddress} --rpc-url "${rpcUrl}"`, {
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      balance = Number(BigInt(balanceWei)) / 1e18;
    } catch {}
  }

  // Display configuration
  // Generate versioned script name to avoid conflicts across deploys
  // This ensures upload and deploy use the same name
  if (!env.SCRIPT_NAME?.includes("-v")) {
    const baseScriptName = env.SCRIPT_NAME || (network.useMockLess ? `less-${networkName}` : "less");
    const versionedName = `${baseScriptName}-v${Math.floor(Date.now() / 1000)}`;
    env.SCRIPT_NAME = versionedName;
    process.env.SCRIPT_NAME = versionedName; // Pass to forge
  }

  log(`Network:     ${networkName}`, "gray");
  log(`Chain ID:    ${network.chainId}`, "gray");
  log(`Deployer:    ${deployerAddress}`, "gray");
  log(`Balance:     ${balance.toFixed(4)} ETH`, balance < 0.1 ? "yellow" : "gray");
  log(`Mock Mode:   ${network.useMockLess}`, "gray");
  log(`Script:      ${env.SCRIPT_NAME}`, "gray");
  log(`Verify:      ${network.verify && !skipVerify}`, "gray");
  log("");

  // Execute steps (each step has its own confirmation with gas estimates)
  const bundled = await stepBundle();
  if (!bundled && !skipBundle) process.exit(1);

  const uploaded = await stepUpload(network, rpcUrl, privateKey);
  if (!uploaded && !skipUpload) process.exit(1);

  const addresses = await stepDeploy(network, rpcUrl, privateKey);
  if (!addresses && !skipDeploy) process.exit(1);

  if (addresses) {
    await stepVerify(network, addresses);

    // Save deployment info
    if (!dryRun) {
      const deploymentInfo = {
        network: networkName,
        chainId: network.chainId,
        timestamp: new Date().toISOString(),
        contracts: addresses,
        config: {
          scriptyStorage: network.scriptyStorage,
          scriptyBuilder: network.scriptyBuilder,
          scriptName: env.SCRIPT_NAME || `less-${networkName}`,
          useMockLess: network.useMockLess,
        },
      };

      const infoPath = join(rootDir, `deployment-${networkName}.json`);
      writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
      log(`\nDeployment saved to: ${infoPath}`, "gray");
    }
  }

  console.log(`
${c.green}╔════════════════════════════════════════════════════════╗
║                 DEPLOYMENT COMPLETE                    ║
╚════════════════════════════════════════════════════════╝${c.reset}
`);

  if (addresses) {
    log(`Less:     ${addresses.less}`, "green");
    log(`Renderer: ${addresses.renderer}`, "green");

    if (networkName !== "local") {
      const explorer = networkName === "mainnet" ? "etherscan.io" : "sepolia.etherscan.io";
      log(`\nView on Etherscan:`, "gray");
      log(`  https://${explorer}/address/${addresses.less}`, "gray");
      log(`  https://${explorer}/address/${addresses.renderer}`, "gray");
    }
  }
}

main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
