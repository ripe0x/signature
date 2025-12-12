#!/usr/bin/env node

/**
 * Create Folds and Mint NFTs
 *
 * This script:
 * 1. Funds the strategy with ETH
 * 2. Creates a fold (triggers buy and burn)
 * 3. Mints NFTs during the active window
 * 4. Repeats for multiple fold windows
 *
 * Usage:
 *   node scripts/create-folds-and-mint.js [--network fork|mainnet] [--folds 5] [--mints-per-fold 3] [--eth-per-fold 1]
 */

import { execSync } from "child_process";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "fork";
const numFolds =
  parseInt(
    args.find((arg) => arg.startsWith("--folds"))?.split("=")[1] || "5"
  ) || 5;
const mintsPerFold =
  parseInt(
    args.find((arg) => arg.startsWith("--mints-per-fold"))?.split("=")[1] || "3"
  ) || 3;
const ethPerFold =
  parseFloat(
    args.find((arg) => arg.startsWith("--eth-per-fold"))?.split("=")[1] || "1"
  ) || 1.0;

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

// Get contract addresses
function getContractAddresses() {
  const deploymentFile = join(rootDir, `deployment-${network}.json`);
  if (!existsSync(deploymentFile)) {
    log(`Deployment file not found: ${deploymentFile}`, "yellow");
    log("Please deploy contracts first: npm run deploy:fork", "yellow");
    process.exit(1);
  }

  const deployment = JSON.parse(readFileSync(deploymentFile, "utf-8"));
  return {
    less: deployment.addresses?.less,
    renderer: deployment.addresses?.renderer,
  };
}

// Get strategy address from Less contract
function getStrategyAddress(lessAddress, rpcUrl) {
  try {
    const output = execSync(
      `cast call ${lessAddress} "strategy()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    // Remove padding and ensure proper address format
    let addr = output.trim();
    // If it's a padded address, extract the last 40 hex chars
    if (addr.length > 42) {
      addr = "0x" + addr.slice(-40);
    }
    return addr.toLowerCase();
  } catch (error) {
    log(`Error getting strategy address: ${error.message}`, "red");
    process.exit(1);
  }
}

// Fund strategy with ETH via addFees (requires hook address)
function fundStrategy(strategyAddress, hookAddress, ethAmount, rpcUrl) {
  log(`Funding strategy with ${ethAmount} ETH via addFees()...`, "gray");

  if (!hookAddress) {
    log(
      `  ⚠ Hook address not found. Strategy may already have ETH from fees.`,
      "yellow"
    );
    return true; // Continue anyway - strategy might already have ETH
  }

  try {
    // Fund the hook address first (for gas + value)
    // Need enough for gas fees plus the ETH being sent
    const totalNeeded = ethAmount + 0.1; // ETH amount + gas buffer
    execSync(
      `cast send ${hookAddress} --value ${totalNeeded}ether --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
      { cwd: rootDir, stdio: "pipe" }
    );

    // Impersonate the hook address to call addFees()
    execSync(
      `cast rpc anvil_impersonateAccount ${hookAddress} --rpc-url ${rpcUrl}`,
      { cwd: rootDir, stdio: "pipe" }
    );

    // Call addFees() as the hook
    const cmd = `cast send ${strategyAddress} "addFees()" --value ${ethAmount}ether --rpc-url ${rpcUrl} --unlocked --from ${hookAddress}`;
    execSync(cmd, { cwd: rootDir, stdio: "pipe" });

    // Stop impersonating
    execSync(
      `cast rpc anvil_stopImpersonatingAccount ${hookAddress} --rpc-url ${rpcUrl}`,
      { cwd: rootDir, stdio: "pipe" }
    );

    log(`  ✓ Strategy funded via addFees()`, "green");
    return true;
  } catch (error) {
    log(
      `  ⚠ Could not fund strategy via addFees(): ${error.message}`,
      "yellow"
    );
    log(`  Strategy may already have ETH from fees, continuing...`, "gray");
    // Stop impersonating if it was started
    try {
      execSync(
        `cast rpc anvil_stopImpersonatingAccount ${hookAddress} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, stdio: "pipe" }
      );
    } catch (e) {
      // Ignore
    }
    return true; // Continue anyway - strategy might already have ETH
  }
}

// Get hook address from strategy
function getHookAddress(strategyAddress, rpcUrl) {
  try {
    const output = execSync(
      `cast call ${strategyAddress} "hookAddress()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    let addr = output.trim();
    // Remove padding if present
    if (addr.length > 42) {
      addr = "0x" + addr.slice(-40);
    }
    if (addr === "0x0000000000000000000000000000000000000000") {
      return null;
    }
    return addr.toLowerCase();
  } catch (error) {
    // Try alternative method name
    try {
      const output = execSync(
        `cast call ${strategyAddress} "hook()" --rpc-url ${rpcUrl}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );
      let addr = output.trim();
      if (addr.length > 42) {
        addr = "0x" + addr.slice(-40);
      }
      if (addr === "0x0000000000000000000000000000000000000000") {
        return null;
      }
      return addr.toLowerCase();
    } catch (error2) {
      log(`Could not get hook address: ${error2.message}`, "yellow");
      return null;
    }
  }
}

// Check if window is active
function isWindowActive(lessAddress, rpcUrl) {
  try {
    const output = execSync(
      `cast call ${lessAddress} "isWindowActive()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    return (
      output.trim() ===
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
  } catch (error) {
    return false;
  }
}

// Create a fold (triggers buy and burn)
function createFold(lessAddress, rpcUrl) {
  // Check if window is already active (addFees might have triggered a burn)
  if (isWindowActive(lessAddress, rpcUrl)) {
    log(`  Window already active (fold may have been auto-created)`, "gray");
    return true;
  }

  log(`Creating fold...`, "blue");

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
    // Check if error is because window is already active
    if (error.message.includes("MintWindowActive")) {
      log(`  Window already active (fold may have been auto-created)`, "gray");
      return true;
    }
    log(`  ✗ Failed to create fold: ${error.message}`, "red");
    if (error.stdout) log(`  ${error.stdout}`, "gray");
    return false;
  }
}

// Get mint price
function getMintPrice(lessAddress, rpcUrl) {
  try {
    const output = execSync(
      `cast call ${lessAddress} "mintPrice()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    const wei = BigInt(output.trim());
    return Number(wei) / 1e18;
  } catch (error) {
    log(`Error getting mint price: ${error.message}`, "yellow");
    return 0.01; // Default
  }
}

// Mint a token
function mintToken(lessAddress, minterAddress, mintPrice, rpcUrl) {
  try {
    const cmd = `cast send ${lessAddress} "mint()" --value ${mintPrice}ether --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --from ${minterAddress}`;
    execSync(cmd, { cwd: rootDir, stdio: "pipe" });
    return true;
  } catch (error) {
    // If --from doesn't work, use vm.prank via forge script
    return false;
  }
}

// Mint tokens using cast send with impersonation
function mintTokensViaScript(lessAddress, numMints, mintPrice, rpcUrl) {
  log(`Minting ${numMints} tokens...`, "blue");

  let successCount = 0;

  for (let i = 0; i < numMints; i++) {
    const minterAddress = `0x${(1000 + i).toString(16).padStart(40, "0")}`;

    try {
      // Fund minter
      execSync(
        `cast send ${minterAddress} --value 0.05ether --rpc-url ${rpcUrl} --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
        { cwd: rootDir, stdio: "pipe" }
      );

      // Impersonate and mint
      execSync(
        `cast rpc anvil_impersonateAccount ${minterAddress} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, stdio: "pipe" }
      );

      execSync(
        `cast send ${lessAddress} "mint()" --value ${mintPrice}ether --rpc-url ${rpcUrl} --unlocked --from ${minterAddress}`,
        { cwd: rootDir, stdio: "pipe" }
      );

      execSync(
        `cast rpc anvil_stopImpersonatingAccount ${minterAddress} --rpc-url ${rpcUrl}`,
        { cwd: rootDir, stdio: "pipe" }
      );

      successCount++;
    } catch (error) {
      // Stop impersonating if it was started
      try {
        execSync(
          `cast rpc anvil_stopImpersonatingAccount ${minterAddress} --rpc-url ${rpcUrl}`,
          { cwd: rootDir, stdio: "pipe" }
        );
      } catch (e) {
        // Ignore
      }
      log(`  ⚠ Failed to mint token ${i + 1}: ${error.message}`, "yellow");
    }
  }

  // Check total supply
  try {
    const totalSupplyOutput = execSync(
      `cast call ${lessAddress} "totalSupply()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    // Parse hex output (cast returns hex with 0x prefix)
    const totalSupplyHex = totalSupplyOutput.trim();
    // Handle empty response (contract doesn't exist)
    if (!totalSupplyHex || totalSupplyHex === "0x" || totalSupplyHex === "") {
      if (successCount > 0) {
        log(
          `  ✓ Minted ${successCount} tokens (could not verify totalSupply)`,
          "green"
        );
        return true;
      }
      log(
        `  ⚠ Could not verify totalSupply - contract may not exist on fork`,
        "yellow"
      );
      return successCount > 0;
    }
    const totalSupply = parseInt(totalSupplyHex, 16);
    if (isNaN(totalSupply)) {
      log(`Warning: Could not parse totalSupply: ${totalSupplyHex}`, "yellow");
      if (successCount > 0) {
        log(`  ✓ Minted ${successCount} tokens`, "green");
        return true;
      }
      return false;
    }

    if (successCount > 0 || totalSupply > 0) {
      log(
        `  ✓ Minted ${successCount} tokens (total supply: ${totalSupply})`,
        "green"
      );
      return true;
    } else {
      log(`  ✗ No tokens minted`, "red");
      return false;
    }
  } catch (error) {
    if (successCount > 0) {
      log(`  ✓ Minted ${successCount} tokens`, "green");
      return true;
    }
    return false;
  }
}

// Get window duration
function getWindowDuration(lessAddress, rpcUrl) {
  try {
    const output = execSync(
      `cast call ${lessAddress} "windowDuration()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    // Parse hex output (cast returns hex with 0x prefix)
    const durationHex = output.trim();
    // Handle empty response (contract doesn't exist)
    if (!durationHex || durationHex === "0x" || durationHex === "") {
      log(
        `Warning: Could not get windowDuration - contract may not exist on fork, using default`,
        "yellow"
      );
      return 30 * 60; // Default 30 minutes
    }
    const duration = parseInt(durationHex, 16);
    if (isNaN(duration)) {
      log(
        `Warning: Could not parse windowDuration: ${durationHex}, using default`,
        "yellow"
      );
      return 30 * 60; // Default 30 minutes
    }
    return duration;
  } catch (error) {
    log(
      `Error getting window duration: ${error.message}, using default`,
      "yellow"
    );
    return 30 * 60; // Default 30 minutes
  }
}

// Wait for window to close
function waitForWindowClose(rpcUrl, windowDuration) {
  log(
    `Waiting for window to close (${windowDuration / 60} minutes)...`,
    "gray"
  );
  execSync(
    `cast rpc evm_increaseTime ${windowDuration + 60} --rpc-url ${rpcUrl}`,
    { cwd: rootDir, stdio: "pipe" }
  );
  execSync(`cast rpc anvil_mine 1 --rpc-url ${rpcUrl}`, {
    cwd: rootDir,
    stdio: "pipe",
  });
}

// Main execution
async function main() {
  log("\n=== Create Folds and Mint NFTs ===\n", "blue");
  log(`Network: ${network}`, "gray");
  log(`Folds to create: ${numFolds}`, "gray");
  log(`Mints per fold: ${mintsPerFold}`, "gray");
  log(`ETH per fold: ${ethPerFold}\n`, "gray");

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

  // Get contract addresses
  const addresses = getContractAddresses();
  const lessAddress = addresses.less;

  // Verify contract exists on fork
  try {
    const contractCode = execSync(
      `cast code ${lessAddress} --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    ).trim();
    if (!contractCode || contractCode === "0x") {
      log(`Contract does not exist at ${lessAddress} on fork`, "red");
      log("The fork state may have been lost. Please redeploy:", "yellow");
      log("  npm run deploy:fork", "yellow");
      process.exit(1);
    }
  } catch (error) {
    log(
      `Warning: Could not verify contract existence: ${error.message}`,
      "yellow"
    );
  }
  log(`Less Contract: ${lessAddress}`, "gray");

  // Get strategy address
  const strategyAddress = getStrategyAddress(lessAddress, rpcUrl);
  log(`Strategy: ${strategyAddress}`, "gray");

  // Get hook address for funding
  const hookAddress = getHookAddress(strategyAddress, rpcUrl);
  if (
    hookAddress &&
    hookAddress !== "0x0000000000000000000000000000000000000000"
  ) {
    log(`Hook: ${hookAddress}`, "gray");
  } else {
    log(`Hook: Not found (strategy may already have ETH)`, "gray");
  }

  // Get mint price and window duration
  const mintPrice = getMintPrice(lessAddress, rpcUrl);
  const windowDuration = getWindowDuration(lessAddress, rpcUrl);
  log(`Mint Price: ${mintPrice} ETH`, "gray");
  log(`Window Duration: ${windowDuration / 60} minutes\n`, "gray");

  // Process each fold
  let successfulFolds = 0;
  let totalMinted = 0;

  for (let i = 0; i < numFolds; i++) {
    log(`\n--- Fold ${i + 1}/${numFolds} ---`, "blue");

    // 1. Fund strategy via addFees() (as the hook)
    fundStrategy(strategyAddress, hookAddress, ethPerFold, rpcUrl);

    // 2. Create fold (triggers buy and burn)
    const foldCreated = createFold(lessAddress, rpcUrl);
    if (!foldCreated) {
      log("  ⚠ Fold creation failed, skipping...", "yellow");
      continue;
    }
    successfulFolds++;

    // 3. Mint tokens during active window
    const minted = await mintTokensViaScript(
      lessAddress,
      mintsPerFold,
      mintPrice,
      rpcUrl
    );
    if (minted) {
      totalMinted += mintsPerFold;
    }

    // 4. Wait for window to close (unless last fold)
    if (i < numFolds - 1) {
      waitForWindowClose(rpcUrl, windowDuration);
    }
  }

  log(`\n=== Complete ===`, "blue");
  log(`Successfully created ${successfulFolds} folds`, "green");
  log(`Total tokens minted: ${totalMinted}`, "green");
  log(`\nYou can now generate outputs:`, "gray");
  log(`  node scripts/generate-outputs.js --network=${network}`, "gray");
}

main().catch((error) => {
  log(`\nError: ${error.message}`, "red");
  if (error.stack) {
    log(error.stack, "gray");
  }
  process.exit(1);
});
