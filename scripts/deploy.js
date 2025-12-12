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

// Extract contract addresses from broadcast JSON file (fallback)
function extractAddressesFromBroadcast() {
  const addresses = {};
  const broadcastPath = join(
    rootDir,
    "broadcast/Deploy.s.sol/1/run-latest.json"
  );

  if (!existsSync(broadcastPath)) {
    return addresses;
  }

  try {
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
    if (broadcast.transactions && Array.isArray(broadcast.transactions)) {
      for (const tx of broadcast.transactions) {
        if (tx.contractName === "Less" && tx.contractAddress) {
          addresses.less = tx.contractAddress;
        }
        if (tx.contractName === "LessRenderer" && tx.contractAddress) {
          addresses.renderer = tx.contractAddress;
        }
      }
    }
  } catch (error) {
    // Silently fail - this is just a fallback
  }

  return addresses;
}

// Deploy contracts directly using forge create (more reliable for forks)
async function deployWithForgeCreate(rpcUrl, privateKey) {
  const addresses = {};

  log("Deploying contracts using forge create...", "yellow");

  // Get constructor arguments from env
  const strategy = env.STRATEGY_ADDRESS;
  const mintPrice = env.MINT_PRICE || "10000000000000000";
  const payoutRecipient = env.PAYOUT_RECIPIENT;
  const owner = env.OWNER_ADDRESS;
  const scriptyBuilder = env.SCRIPTY_BUILDER || "0xD7587F110E08F4D120A231bA97d3B577A81Df022";
  const scriptyStorage = env.SCRIPTY_STORAGE || "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699";
  const scriptName = env.SCRIPT_NAME || "less";
  const baseImageURL = env.BASE_IMAGE_URL || "https://less.art/images/";

  try {
    // Step 1: Deploy Less contract
    log("Deploying Less contract...", "gray");
    const lessCmd = [
      "forge create contracts/Less.sol:Less",
      `--rpc-url ${rpcUrl}`,
      `--private-key ${privateKey}`,
      "--legacy",
      "--broadcast",
      "--constructor-args",
      strategy,
      mintPrice,
      payoutRecipient,
      owner,
    ].join(" ");

    const lessResult = execSync(lessCmd, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    // Extract deployed address from forge create output
    // Format: "Deployed to: 0x..." or "Deployer: 0x..." / "Deployed to: 0x..."
    const lessAddressMatch = lessResult.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
    if (!lessAddressMatch) {
      logError("Failed to extract Less contract address from forge create output");
      console.log(lessResult);
      return null;
    }
    addresses.less = lessAddressMatch[1];
    logSuccess(`Less deployed at: ${addresses.less}`);

    // Step 2: Deploy LessRenderer contract
    log("Deploying LessRenderer contract...", "gray");
    const rendererCmd = [
      "forge create contracts/LessRenderer.sol:LessRenderer",
      `--rpc-url ${rpcUrl}`,
      `--private-key ${privateKey}`,
      "--legacy",
      "--broadcast",
      "--constructor-args",
      addresses.less,
      scriptyBuilder,
      scriptyStorage,
      `"${scriptName}"`,
      `"${baseImageURL}"`,
      owner,
    ].join(" ");

    const rendererResult = execSync(rendererCmd, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const rendererAddressMatch = rendererResult.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
    if (!rendererAddressMatch) {
      logError("Failed to extract LessRenderer contract address from forge create output");
      console.log(rendererResult);
      return null;
    }
    addresses.renderer = rendererAddressMatch[1];
    logSuccess(`LessRenderer deployed at: ${addresses.renderer}`);

    // Step 3: Call setRenderer on Less contract
    // The owner needs to call this - on Anvil we can impersonate the account
    log("Setting renderer on Less contract...", "gray");

    // Encode the setRenderer call: selector 0x56d3163d + padded address
    const rendererAddressPadded = addresses.renderer.toLowerCase().replace("0x", "").padStart(64, "0");
    const setRendererCalldata = `0x56d3163d${rendererAddressPadded}`;

    try {
      // First, impersonate the owner account on Anvil
      log("Impersonating owner account...", "gray");
      execSync(
        `cast rpc anvil_impersonateAccount ${owner} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );

      // Now send the transaction from the impersonated account
      // Use function signature with single quotes (shell-safe)
      const setRendererCmd = `cast send --rpc-url ${rpcUrl} --unlocked --from ${owner} --legacy ${addresses.less} 'setRenderer(address)' ${addresses.renderer}`;

      execSync(setRendererCmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Stop impersonating
      execSync(
        `cast rpc anvil_stopImpersonatingAccount ${owner} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );

      logSuccess("Renderer set on Less contract");
    } catch (setRendererError) {
      // Try alternative: if owner is Anvil's first account, use its private key
      logWarning(`setRenderer with impersonation failed, trying alternative...`);

      const anvilFirstAccount = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();
      if (owner.toLowerCase() === anvilFirstAccount) {
        const altCmd = `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} --legacy ${addresses.less} 'setRenderer(address)' ${addresses.renderer}`;

        execSync(altCmd, {
          cwd: rootDir,
          encoding: "utf-8",
          stdio: "pipe",
        });
        logSuccess("Renderer set on Less contract");
      } else {
        // Log the error but continue - user may need to manually set renderer
        logWarning(`Could not set renderer automatically. Owner ${owner} is not the deployer.`);
        logWarning(`You may need to manually call setRenderer(${addresses.renderer}) on ${addresses.less}`);
      }
    }

    return addresses;
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    return null;
  }
}

// Send transactions from broadcast JSON using cast send (for forks) - LEGACY FALLBACK
async function sendBroadcastTransactions(rpcUrl, privateKey) {
  // Try both run-latest.json and dry-run/run-latest.json
  let broadcastPath = join(rootDir, "broadcast/Deploy.s.sol/1/run-latest.json");

  if (!existsSync(broadcastPath)) {
    broadcastPath = join(
      rootDir,
      "broadcast/Deploy.s.sol/1/dry-run/run-latest.json"
    );
  }

  if (!existsSync(broadcastPath)) {
    return false;
  }

  try {
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
    if (!broadcast.transactions || !Array.isArray(broadcast.transactions)) {
      return false;
    }

    log("Sending transactions manually using cast send...", "yellow");
    const deployedAddresses = {};

    for (const tx of broadcast.transactions) {
      if (tx.hash && tx.hash !== null) {
        // Transaction already sent, skip
        continue;
      }

      if (!tx.transaction) {
        continue;
      }

      const txData = tx.transaction;
      // Contract creation: transaction has no 'to' field (or 'to' is null/empty)
      // Function call: transaction has a 'to' field pointing to an existing contract
      const isContractCreation =
        !txData.to ||
        txData.to === null ||
        txData.to === "0x" ||
        txData.to === "";

      // Build cast send command
      let cmd;

      // Build common options
      const value =
        txData.value && txData.value !== "0x0" && txData.value !== "0"
          ? txData.value.startsWith("0x")
            ? parseInt(txData.value, 16).toString()
            : txData.value
          : "0";

      if (isContractCreation) {
        // Contract creation: cast send --create <CODE>
        const opts = [
          `--private-key ${privateKey}`,
          `--rpc-url ${rpcUrl}`,
          "--legacy",
        ];
        if (value !== "0") opts.push(`--value ${value}`);

        cmd = ["cast send", ...opts, "--create", txData.input].join(" ");
      } else {
        // Function call: use raw calldata with --data to avoid shell quoting issues
        const targetAddress = txData.to;
        const fromAddress = txData.from;

        // Check if sender is the deployer (has private key) or needs impersonation
        const deployerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();
        const isDeployer = fromAddress.toLowerCase() === deployerAddress;

        const opts = [`--rpc-url ${rpcUrl}`, "--legacy"];

        if (isDeployer) {
          opts.push(`--private-key ${privateKey}`);
        } else {
          // Use --unlocked to impersonate on Anvil
          opts.push("--unlocked", `--from ${fromAddress}`);
        }

        if (value !== "0") opts.push(`--value ${value}`);

        // Use --data with raw calldata (avoids shell quoting issues with function signatures)
        cmd = ["cast send", ...opts, targetAddress, `--data ${txData.input}`].join(" ");
      }

      try {
        log(`Sending ${tx.contractName || "transaction"}...`, "gray");
        const result = execSync(cmd, {
          cwd: rootDir,
          encoding: "utf-8",
          stdio: "pipe",
        });

        // Extract transaction hash from result
        const txHashMatch = result.match(/0x[a-fA-F0-9]{64}/);
        if (txHashMatch && isContractCreation) {
          const txHash = txHashMatch[0];
          // Get the transaction receipt to find the contract address
          try {
            const receipt = execSync(
              `cast receipt ${txHash} --rpc-url ${rpcUrl} --json`,
              { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
            );
            const receiptJson = JSON.parse(receipt);
            if (receiptJson.contractAddress) {
              deployedAddresses[tx.contractName] = receiptJson.contractAddress;
              log(
                `✓ ${tx.contractName || "Contract"} deployed at ${receiptJson.contractAddress}`,
                "green"
              );
            } else {
              log(`✓ ${tx.contractName || "Transaction"} sent`, "green");
            }
          } catch (receiptError) {
            log(`✓ ${tx.contractName || "Transaction"} sent`, "green");
          }
        } else {
          log(`✓ ${tx.contractName || "Transaction"} sent`, "green");
        }
      } catch (error) {
        logError(
          `Failed to send ${tx.contractName || "transaction"}: ${error.message}`
        );
        if (error.stderr) console.log(error.stderr);
        return false;
      }
    }

    // Wait a moment for transactions to be mined
    log("Waiting for transactions to be mined...", "gray");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return deployedAddresses;
  } catch (error) {
    logError(`Failed to parse broadcast JSON: ${error.message}`);
    return false;
  }
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
      format: "iife",  // Use IIFE for inline <script> tags (not ESM)
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

// Upload script directly using cast send (for forks)
async function uploadScriptDirect(rpcUrl, privateKey) {
  const scriptyStorage = env.SCRIPTY_STORAGE || "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699";
  const scriptName = env.SCRIPT_NAME || "less";
  const scriptPath = join(rootDir, "web/onchain/bundled.js");

  log(`Uploading script "${scriptName}" to ScriptyStorage...`, "yellow");

  const scriptContent = readFileSync(scriptPath, "utf-8");
  const scriptBytes = Buffer.from(scriptContent, "utf-8");
  const scriptHex = "0x" + scriptBytes.toString("hex");

  log(`Script size: ${scriptBytes.length} bytes`, "gray");

  try {
    // Step 1: Create content entry
    // Function: createContent(string name, bytes details)
    // Selector: 0x56c3163d... let me calculate it
    log("Creating content entry...", "gray");

    // Encode createContent(string,bytes) call
    const createContentCmd = `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} --legacy ${scriptyStorage} 'createContent(string,bytes)' "${scriptName}" "0x"`;

    try {
      execSync(createContentCmd, { cwd: rootDir, encoding: "utf-8", stdio: "pipe" });
      logSuccess("Content entry created");
    } catch (error) {
      // May fail if content already exists, continue anyway
      logWarning("Content entry may already exist, continuing...");
    }

    // Step 2: Upload script in chunks (max ~24KB per chunk due to gas limits)
    const maxChunkSize = 24000;
    const totalChunks = Math.ceil(scriptBytes.length / maxChunkSize);

    log(`Uploading in ${totalChunks} chunk(s)...`, "gray");

    for (let i = 0; i < totalChunks; i++) {
      const start = i * maxChunkSize;
      const end = Math.min(start + maxChunkSize, scriptBytes.length);
      const chunk = scriptBytes.slice(start, end);
      const chunkHex = "0x" + chunk.toString("hex");

      log(`  Uploading chunk ${i + 1}/${totalChunks} (${chunk.length} bytes)...`, "gray");

      const addChunkCmd = `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} --legacy ${scriptyStorage} 'addChunkToContent(string,bytes)' "${scriptName}" ${chunkHex}`;

      execSync(addChunkCmd, { cwd: rootDir, encoding: "utf-8", stdio: "pipe" });
    }

    logSuccess("Script uploaded to ScriptyStorage");

    // Verify upload
    log("Verifying upload...", "gray");
    try {
      const verifyCmd = `cast call ${scriptyStorage} 'getContent(string,bytes)(bytes)' "${scriptName}" "0x" --rpc-url ${rpcUrl}`;
      const result = execSync(verifyCmd, { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }).trim();

      if (result && result !== "0x" && result.length > 10) {
        logSuccess(`Verified: Script stored (${(result.length - 2) / 2} bytes)`);
      } else {
        logWarning("Verification returned empty - upload may have failed");
      }
    } catch (error) {
      logWarning(`Could not verify upload: ${error.message}`);
    }

    return true;
  } catch (error) {
    logError(`Upload failed: ${error.message}`);
    return false;
  }
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

    // Use direct upload for forks (forge script --broadcast doesn't work)
    const forkPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const success = await uploadScriptDirect(rpcUrl, forkPrivateKey);
    if (!success) {
      logError("Upload failed");
      process.exit(1);
    }
    return;
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
      "--broadcast",
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
      output = error.stdout || error.stderr || error.message;

      if (
        output.includes("Script ran successfully") ||
        output.includes("SUCCESS: Script uploaded successfully") ||
        output.includes("=== Upload Complete ===")
      ) {
        success = true;
      }
    }

    console.log(output);

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

    const txHash = extractTxHash(output);
    if (txHash) {
      const confirmed = await waitForTx(txHash, network);
      if (!confirmed) {
        logWarning("Transaction confirmation failed. Please verify manually.");
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

  // For fork, use anvil's default private key
  // Anvil's first account: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  const forkPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  let addresses = {};

  try {
    if (isFork) {
      // Use forge create for fork deployments (more reliable than forge script)
      log("Using forge create for fork deployment...", "gray");
      addresses = await deployWithForgeCreate(rpcUrl, forkPrivateKey);

      if (!addresses) {
        logError("Fork deployment failed");
        process.exit(1);
      }
    } else {
      // For mainnet, use forge script with --broadcast
      log("Deploying contracts with forge script...", "gray");

      const forgeCmd = [
        "forge script script/Deploy.s.sol",
        "--tc DeployScript",
        `--rpc-url ${rpcUrl}`,
        "--broadcast",
        "-vvv",
      ].join(" ");

      // Prepare environment variables for Foundry
      const forgeEnv = {
        ...process.env,
        ...env,
      };

      let output;
      let success = false;
      try {
        output = execSync(forgeCmd, {
          cwd: rootDir,
          encoding: "utf-8",
          stdio: "pipe",
          env: forgeEnv,
        });
        success = true;
      } catch (error) {
        output = error.stdout || error.stderr || error.message;
        if (
          output.includes("Script ran successfully") ||
          output.includes("Renderer set on Less contract") ||
          output.includes("Less deployed at:")
        ) {
          success = true;
        }
      }

      console.log(output);

      if (
        !success &&
        (output.includes("Error: Compiler run failed") ||
          output.includes("Error: script failed") ||
          (output.includes("Revert") && !output.includes("Script ran successfully")))
      ) {
        logError(`Deployment failed. Check the output above for details.`);
        process.exit(1);
      }

      addresses = extractAddresses(output);

      // Fallback: try to extract from broadcast JSON
      if (!addresses.less || !addresses.renderer) {
        const broadcastAddresses = extractAddressesFromBroadcast();
        if (broadcastAddresses.less && !addresses.less) {
          addresses.less = broadcastAddresses.less;
        }
        if (broadcastAddresses.renderer && !addresses.renderer) {
          addresses.renderer = broadcastAddresses.renderer;
        }
      }

      // Wait for transaction confirmation
      const txHash = extractTxHash(output);
      if (txHash) {
        const confirmed = await waitForTx(txHash, network);
        if (!confirmed) {
          logWarning("Transaction confirmation failed. Please verify manually.");
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

    // Verify contracts exist on fork
    if (isFork && addresses.less) {
      try {
        const code = execSync(
          `cast code ${addresses.less} --rpc-url ${rpcUrl}`,
          { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
        ).trim();
        if (!code || code === "0x") {
          logError(`Less contract at ${addresses.less} does not exist on fork`);
          process.exit(1);
        } else {
          logSuccess(`Verified Less contract exists on fork`);
        }

        // Also verify renderer is set
        const rendererResult = execSync(
          `cast call ${addresses.less} "renderer()(address)" --rpc-url ${rpcUrl}`,
          { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
        ).trim();
        if (rendererResult.toLowerCase() === addresses.renderer.toLowerCase()) {
          logSuccess(`Verified renderer is correctly set to ${addresses.renderer}`);
        } else {
          logWarning(`Renderer mismatch: expected ${addresses.renderer}, got ${rendererResult}`);
        }
      } catch (error) {
        logWarning(`Could not verify contract: ${error.message}`);
      }
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
