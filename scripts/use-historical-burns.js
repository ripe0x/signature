#!/usr/bin/env node

/**
 * Use Historical Burn Data for Testing
 *
 * This script allows you to use real mainnet burn transaction data
 * to test the minting flow on a fork.
 *
 * Usage:
 *   node scripts/use-historical-burns.js [--network fork|mainnet] [--burns-file burns.json]
 */

const { execSync } = require("child_process");
const { readFileSync, existsSync, writeFileSync } = require("fs");
const { join } = require("path");

const rootDir = join(__dirname, "..");

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "fork";
const burnsFile =
  args.find((arg) => arg.startsWith("--burns-file"))?.split("=")[1] ||
  join(rootDir, "scripts", "historical-burns.json");

// Color logging
function log(msg, color = "white") {
  const colors = {
    gray: "\x1b[90m",
    blue: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
  };
  console.log(`${colors[color] || ""}${msg}${colors.reset}`);
}

function getRpcUrl() {
  if (network === "fork") {
    return process.env.FORK_RPC_URL || "http://127.0.0.1:8545";
  } else if (network === "mainnet") {
    return process.env.MAINNET_RPC_URL;
  }
  return null;
}

// Load burn data
function loadBurnData() {
  if (!existsSync(burnsFile)) {
    log(`Burn data file not found: ${burnsFile}`, "yellow");
    log("Creating example file...", "gray");

    const exampleData = {
      burns: [
        {
          date: "2025-12-02T13:01:00Z",
          ethSpent: "0.995",
          rstrBurned: "1.06M",
          txHash: "0x3530...dff2",
          // Full transaction hash if available
          fullTxHash: null,
        },
        {
          date: "2025-12-02T13:02:00Z",
          ethSpent: "0.995",
          rstrBurned: "2.15M",
          txHash: "0x...",
          fullTxHash: null,
        },
        // Add more burns...
      ],
    };

    writeFileSync(burnsFile, JSON.stringify(exampleData, null, 2));
    log(`Example file created at: ${burnsFile}`, "green");
    log("Please edit it with your actual burn data and run again.", "yellow");
    process.exit(0);
  }

  const data = JSON.parse(readFileSync(burnsFile, "utf-8"));
  return data.burns || [];
}

// Convert ETH string to wei
function ethToWei(ethStr) {
  const eth = parseFloat(ethStr);
  return BigInt(Math.floor(eth * 1e18)).toString();
}

// Get Less contract address
function getLessAddress() {
  const deploymentFile = join(rootDir, `deployment-${network}.json`);
  if (!existsSync(deploymentFile)) {
    log(`Deployment file not found: ${deploymentFile}`, "yellow");
    log("Please deploy contracts first: npm run deploy:fork", "yellow");
    process.exit(1);
  }

  const deployment = JSON.parse(readFileSync(deploymentFile, "utf-8"));
  return deployment.addresses?.less;
}

// Fund strategy with ETH from burn data
function fundStrategy(strategyAddress, ethAmount, rpcUrl) {
  log(`Funding strategy with ${ethAmount} ETH...`, "gray");

  // Try addETH() first (for mock strategies)
  try {
    const cmd = `cast send ${strategyAddress} "addETH()" --value ${ethAmount}ether --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`;
    execSync(cmd, { cwd: rootDir, stdio: "pipe" });
    log(`  ✓ Strategy funded via addETH()`, "green");
    return true;
  } catch (error) {
    // Try direct ETH transfer (for real strategies that accept ETH)
    try {
      const cmd = `cast send ${strategyAddress} --value ${ethAmount}ether --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`;
      execSync(cmd, { cwd: rootDir, stdio: "pipe" });
      log(`  ✓ Strategy funded via direct transfer`, "green");
      return true;
    } catch (error2) {
      log(`  ✗ Could not fund strategy: ${error2.message}`, "yellow");
      return false;
    }
  }
}

// Create fold using historical burn data
function createFoldFromBurn(lessAddress, burn, rpcUrl) {
  log(`\nCreating fold from burn: ${burn.date}`, "blue");
  log(`  ETH: ${burn.ethSpent} ETH`, "gray");
  log(`  RSTR Burned: ${burn.rstrBurned}`, "gray");

  // Get strategy address
  const strategyAddress = execSync(
    `cast call ${lessAddress} "strategy()" --rpc-url ${rpcUrl}`,
    { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
  ).trim();

  // Fund strategy with the ETH amount from the burn
  const funded = fundStrategy(strategyAddress, burn.ethSpent, rpcUrl);
  if (!funded) {
    log("  ⚠ Strategy funding failed, but continuing...", "yellow");
  }

  // Advance block for unique blockhash
  execSync(`cast rpc anvil_mine 5 --rpc-url ${rpcUrl}`, {
    cwd: rootDir,
    stdio: "pipe",
  });

  // Create the fold
  try {
    const cmd = `cast send ${lessAddress} "createFold()" --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`;
    const output = execSync(cmd, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    log(`  ✓ Fold created successfully`, "green");
    return true;
  } catch (error) {
    log(`  ✗ Failed to create fold: ${error.message}`, "red");
    if (error.stdout) log(`  ${error.stdout}`, "gray");
    return false;
  }
}

// Main execution
async function main() {
  log("\n=== Using Historical Burn Data for Testing ===\n", "blue");
  log(`Network: ${network}`, "gray");

  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    log(
      "RPC URL not found. Set FORK_RPC_URL or MAINNET_RPC_URL in .env",
      "yellow"
    );
    process.exit(1);
  }

  // Check RPC connection
  try {
    const blockNumber = execSync(`cast block-number --rpc-url ${rpcUrl}`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    log(`Connected to RPC (block: ${blockNumber.trim()})\n`, "gray");
  } catch (error) {
    log(`Cannot connect to RPC: ${error.message}`, "red");
    process.exit(1);
  }

  // Load burn data
  const burns = loadBurnData();
  if (burns.length === 0) {
    log("No burn data found. Please add burns to the JSON file.", "yellow");
    process.exit(1);
  }

  log(`Loaded ${burns.length} historical burns\n`, "gray");

  // Get Less contract address
  const lessAddress = getLessAddress();
  log(`Less Contract: ${lessAddress}\n`, "gray");

  // Process each burn
  let successfulFolds = 0;
  for (let i = 0; i < burns.length; i++) {
    const burn = burns[i];
    const success = createFoldFromBurn(lessAddress, burn, rpcUrl);
    if (success) {
      successfulFolds++;
    }

    // Wait a bit between folds (simulate time passing)
    if (i < burns.length - 1) {
      // Fast forward time to close the window
      const windowDuration = 30 * 60; // 30 minutes in seconds
      execSync(
        `cast rpc evm_increaseTime ${windowDuration + 60} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, stdio: "pipe" }
      );
      execSync(`cast rpc anvil_mine 1 --rpc-url ${rpcUrl}`, {
        cwd: rootDir,
        stdio: "pipe",
      });
    }
  }

  log(`\n=== Complete ===`, "blue");
  log(
    `Successfully created ${successfulFolds} folds from ${burns.length} burns`,
    "green"
  );
  log(`\nYou can now mint tokens and generate outputs:`, "gray");
  log(
    `  node scripts/generate-outputs.js --network=${network} --mint=5`,
    "gray"
  );
}

main().catch((error) => {
  log(`\nError: ${error.message}`, "red");
  process.exit(1);
});
