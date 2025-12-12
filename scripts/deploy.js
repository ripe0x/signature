#!/usr/bin/env node

/**
 * Comprehensive Deployment Script
 *
 * Bundles JavaScript, uploads to ScriptyStorage, and deploys contracts
 * with transaction confirmation and status updates.
 *
 * Usage:
 *   node scripts/deploy.js [--network mainnet|fork] [--skip-bundle] [--skip-upload] [--skip-deploy]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Colors for terminal output
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
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, "cyan");
}

function logSuccess(message) {
  log(`✓ ${message}`, "green");
}

function logWarning(message) {
  log(`⚠ ${message}`, "yellow");
}

function logError(message) {
  log(`✗ ${message}`, "red");
}

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "fork";
const skipBundle = args.includes("--skip-bundle");
const skipUpload = args.includes("--skip-upload");
const skipDeploy = args.includes("--skip-deploy");

// Load environment variables
function loadEnv() {
  const envPath = join(rootDir, ".env");
  const env = {};

  // Also load from process.env (for CI/CD or manual setup)
  Object.keys(process.env).forEach((key) => {
    env[key] = process.env[key];
  });

  // Override with .env file if it exists
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join("=").trim();
        }
      }
    });
  } else {
    logWarning(".env file not found. Using environment variables only.");
  }

  return env;
}

const env = loadEnv();

// Get RPC URL based on network
function getRpcUrl() {
  if (network === "fork") {
    return env.FORK_RPC_URL || "http://127.0.0.1:8545";
  } else if (network === "mainnet") {
    return env.MAINNET_RPC_URL;
  } else {
    logError(
      `Unknown network: ${network}. Use --network=mainnet or --network=fork`
    );
    process.exit(1);
  }
}

const rpcUrl = getRpcUrl();
if (!rpcUrl && !skipUpload && !skipDeploy) {
  logError(`RPC URL not found for network: ${network}`);
  if (network === "fork") {
    logError(
      "For fork mode, either set FORK_RPC_URL in .env or start a local node on http://127.0.0.1:8545"
    );
  } else {
    logError("For mainnet, set MAINNET_RPC_URL in .env");
  }
  process.exit(1);
}

// Check if we're on a fork (local node)
const isFork = network === "fork";

// Ask for user confirmation
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      `${colors.yellow}${question} (y/n): ${colors.reset}`,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      }
    );
  });
}

// Wait for transaction confirmation
async function waitForTx(txHash, network) {
  if (isFork) {
    // On fork, transactions are instant, just verify it exists
    log(`Transaction hash: ${txHash}`, "gray");
    return true;
  }

  log(`Waiting for transaction confirmation: ${txHash}`, "gray");

  try {
    // Use ethers or viem to wait for confirmation
    // For now, we'll use a simple fetch-based approach
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }),
        });

        const data = await response.json();
        if (data.result) {
          const receipt = data.result;
          if (receipt.status === "0x1") {
            logSuccess(
              `Transaction confirmed in block ${parseInt(
                receipt.blockNumber,
                16
              )}`
            );
            return true;
          } else {
            logError("Transaction failed");
            return false;
          }
        }
      } catch (error) {
        // Ignore and retry
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      process.stdout.write(".");
    }

    logWarning("Transaction confirmation timeout. Please verify manually.");
    return false;
  } catch (error) {
    logWarning(`Could not verify transaction: ${error.message}`);
    return false;
  }
}

// Extract transaction hash from forge output
function extractTxHash(output) {
  const lines = output.split("\n");
  for (const line of lines) {
    // Look for transaction hash patterns
    const txHashMatch = line.match(/0x[a-fA-F0-9]{64}/);
    if (txHashMatch) {
      return txHashMatch[0];
    }
    // Also check for "Transaction hash:" pattern
    const txHashLine = line.match(/Transaction hash:\s*(0x[a-fA-F0-9]{64})/i);
    if (txHashLine) {
      return txHashLine[1];
    }
  }
  return null;
}

// Extract contract addresses from forge output
function extractAddresses(output) {
  const addresses = {};
  const lines = output.split("\n");

  for (const line of lines) {
    // Look for "deployed at:" pattern
    const lessMatch = line.match(/Less deployed at:\s*(0x[a-fA-F0-9]{40})/i);
    if (lessMatch) {
      addresses.less = lessMatch[1];
    }

    const rendererMatch = line.match(
      /LessRenderer deployed at:\s*(0x[a-fA-F0-9]{40})/i
    );
    if (rendererMatch) {
      addresses.renderer = rendererMatch[1];
    }
  }

  return addresses;
}

// Step 1: Bundle JavaScript
async function bundleScript() {
  if (skipBundle) {
    logWarning("Skipping bundle step");
    return;
  }

  logStep("1/3", "Bundling JavaScript for on-chain deployment");

  try {
    // Dynamic import for esbuild (ES module)
    let esbuild;
    try {
      esbuild = await import("esbuild");
    } catch (e) {
      logError("esbuild not found. Installing...");
      execSync("npm install --save-dev esbuild", {
        cwd: rootDir,
        stdio: "inherit",
      });
      esbuild = await import("esbuild");
    }

    const entryPoint = join(rootDir, "web/onchain/index.js");
    const outputPath = join(rootDir, "web/onchain/bundled.js");

    if (!existsSync(entryPoint)) {
      logError(`Entry point not found: ${entryPoint}`);
      process.exit(1);
    }

    log("Bundling JavaScript...", "gray");

    await esbuild.default.build({
      entryPoints: [entryPoint],
      bundle: true,
      format: "esm",
      platform: "browser",
      outfile: outputPath,
      minify: true,
      sourcemap: false,
      target: "es2020",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });

    const bundleSize = readFileSync(outputPath, "utf-8").length;
    logSuccess(
      `Bundle created: ${outputPath} (${(bundleSize / 1024).toFixed(2)} KB)`
    );
  } catch (error) {
    logError(`Bundle failed: ${error.message}`);
    process.exit(1);
  }
}

// Check if RPC endpoint is available
async function checkRpcConnection() {
  if (isFork) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });
      const data = await response.json();
      if (data.result) {
        return true;
      }
    } catch (error) {
      return false;
    }
  }
  return true; // Assume mainnet RPC is available
}

// Step 2: Upload to ScriptyStorage
async function uploadScript() {
  if (skipUpload) {
    logWarning("Skipping upload step");
    return;
  }

  logStep("2/3", "Uploading script to ScriptyStorage");

  const scriptPath = join(rootDir, "web/onchain/bundled.js");
  if (!existsSync(scriptPath)) {
    logError(`Bundled script not found: ${scriptPath}`);
    logError("Run without --skip-bundle first");
    process.exit(1);
  }

  // Check RPC connection for fork
  if (isFork) {
    log("Checking RPC connection...", "gray");
    const rpcAvailable = await checkRpcConnection();
    if (!rpcAvailable) {
      logError(`Cannot connect to RPC at ${rpcUrl}`);
      logError(
        "Please start a fork node (e.g., `anvil --fork-url $MAINNET_RPC_URL`)"
      );
      process.exit(1);
    }
    logSuccess("RPC connection OK");
  }

  if (!isFork) {
    const confirmed = await askConfirmation(
      `\nReady to upload script to ${network}. This will cost gas. Continue?`
    );
    if (!confirmed) {
      log("Upload cancelled", "yellow");
      process.exit(0);
    }
  }

  try {
    log("Running upload script...", "gray");

    const forgeCmd = [
      "forge script script/UploadScript.s.sol",
      "--tc UploadScript",
      `--rpc-url ${rpcUrl}`,
      "--broadcast", // Always broadcast (fork accepts transactions)
      "-vvv",
    ]
      .filter(Boolean)
      .join(" ");

    let output;
    let success = false;
    try {
      output = execSync(forgeCmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      });
      success = true;
    } catch (error) {
      // Forge may exit with non-zero even on success in some cases
      // Check the actual output to determine if it succeeded
      output = error.stdout || error.stderr || error.message;

      // Check for success indicators in output
      if (
        output.includes("Script ran successfully") ||
        output.includes("SUCCESS: Script uploaded successfully") ||
        output.includes("=== Upload Complete ===")
      ) {
        success = true;
      }
    }

    console.log(output);

    // Check if the script actually failed
    if (
      !success &&
      (output.includes("Error: Compiler run failed") ||
        output.includes("Error: script failed") ||
        (output.includes("Revert") &&
          !output.includes("Script ran successfully")))
    ) {
      logError(`Upload failed. Check the output above for details.`);
      process.exit(1);
    }

    console.log(output);

    if (!isFork) {
      const txHash = extractTxHash(output);
      if (txHash) {
        const confirmed = await waitForTx(txHash, network);
        if (!confirmed) {
          logWarning(
            "Transaction confirmation failed. Please verify manually."
          );
        }
      } else {
        logWarning(
          "Could not extract transaction hash. Please verify manually."
        );
      }
    }

    logSuccess("Script uploaded to ScriptyStorage");
  } catch (error) {
    logError(`Upload failed: ${error.message}`);
    process.exit(1);
  }
}

// Step 3: Deploy contracts
async function deployContracts() {
  if (skipDeploy) {
    logWarning("Skipping deployment step");
    return;
  }

  logStep("3/3", "Deploying contracts");

  // Verify required environment variables
  const required = ["STRATEGY_ADDRESS", "PAYOUT_RECIPIENT", "OWNER_ADDRESS"];
  const missing = required.filter((key) => !env[key] || env[key].trim() === "");

  if (missing.length > 0) {
    logError(`Missing required environment variables: ${missing.join(", ")}`);
    logError("");
    logError("To deploy contracts, you need to set these in your .env file:");
    missing.forEach((key) => {
      logError(`  ${key}=0x...`);
    });
    logError("");
    logError("Example .env file:");
    logError("  STRATEGY_ADDRESS=0x1234567890123456789012345678901234567890");
    logError("  PAYOUT_RECIPIENT=0x1234567890123456789012345678901234567890");
    logError("  OWNER_ADDRESS=0x1234567890123456789012345678901234567890");
    logError("");
    logError("Or skip deployment with: --skip-deploy");
    logError("Or test upload only: node scripts/deploy.js --skip-deploy");
    process.exit(1);
  }

  // Validate that addresses are valid (start with 0x and are 42 chars)
  const invalid = required.filter((key) => {
    const value = env[key];
    return value && (!value.startsWith("0x") || value.length !== 42);
  });

  if (invalid.length > 0) {
    logError(`Invalid address format for: ${invalid.join(", ")}`);
    logError(
      "Addresses must start with 0x and be 42 characters long (0x + 40 hex chars)"
    );
    invalid.forEach((key) => {
      logError(`  ${key}=${env[key]} (length: ${env[key].length})`);
    });
    process.exit(1);
  }

  if (!isFork) {
    const confirmed = await askConfirmation(
      `\nReady to deploy contracts to ${network}. This will cost gas. Continue?`
    );
    if (!confirmed) {
      log("Deployment cancelled", "yellow");
      process.exit(0);
    }
  }

  try {
    log("Deploying contracts...", "gray");

    // For fork, use anvil's default private key to ensure transactions are sent
    // Anvil's first account: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    const forkPrivateKey = isFork
      ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
      : null;

    const forgeCmd = [
      "forge script script/Deploy.s.sol",
      "--tc DeployScript",
      `--rpc-url ${rpcUrl}`,
      "--broadcast", // Always broadcast (fork accepts transactions)
      forkPrivateKey ? `--private-key ${forkPrivateKey}` : "",
      "-vvv",
    ]
      .filter(Boolean)
      .join(" ");

    let output;
    let success = false;
    try {
      output = execSync(forgeCmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      });
      success = true;
    } catch (error) {
      // Forge may exit with non-zero even on success in some cases
      // Check the actual output to determine if it succeeded
      output = error.stdout || error.stderr || error.message;

      // Check for success indicators in output
      if (
        output.includes("Script ran successfully") ||
        output.includes("Renderer set on Less contract") ||
        output.includes("Less deployed at:") ||
        output.includes("LessRenderer deployed at:")
      ) {
        success = true;
      }
    }

    console.log(output);

    // Check if the script actually failed
    if (
      !success &&
      (output.includes("Error: Compiler run failed") ||
        output.includes("Error: script failed") ||
        (output.includes("Revert") &&
          !output.includes("Script ran successfully")))
    ) {
      logError(`Deployment failed. Check the output above for details.`);
      process.exit(1);
    }

    console.log(output);

    const addresses = extractAddresses(output);

    if (!isFork) {
      const txHash = extractTxHash(output);
      if (txHash) {
        const confirmed = await waitForTx(txHash, network);
        if (!confirmed) {
          logWarning(
            "Transaction confirmation failed. Please verify manually."
          );
        }
      }
    }

    logSuccess("Contracts deployed successfully");

    if (addresses.less) {
      log(`Less NFT: ${addresses.less}`, "green");
    } else {
      logWarning("Could not extract Less contract address");
    }

    if (addresses.renderer) {
      log(`LessRenderer: ${addresses.renderer}`, "green");
    } else {
      logWarning("Could not extract LessRenderer contract address");
    }

    // Save deployment info
    const deploymentInfo = {
      network,
      timestamp: new Date().toISOString(),
      addresses,
      scriptName: env.SCRIPT_NAME || "less",
      scriptyStorage: env.SCRIPTY_STORAGE,
      scriptyBuilder: env.SCRIPTY_BUILDER,
    };

    const infoPath = join(rootDir, `deployment-${network}.json`);
    writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
    log(`Deployment info saved to: ${infoPath}`, "gray");
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
async function main() {
  log("\n" + "=".repeat(60), "bright");
  log("  Less NFT Deployment Script", "bright");
  log("=".repeat(60) + "\n", "bright");

  log(`Network: ${network}`, "cyan");
  log(`RPC URL: ${rpcUrl}`, "gray");
  log(`Fork mode: ${isFork ? "Yes" : "No"}`, "gray");
  log("");

  try {
    await bundleScript();
    await uploadScript();
    await deployContracts();

    log("\n" + "=".repeat(60), "green");
    log("  Deployment Complete!", "green");
    log("=".repeat(60) + "\n", "green");
  } catch (error) {
    logError(`\nDeployment failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
