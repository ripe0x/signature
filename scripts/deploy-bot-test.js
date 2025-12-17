#!/usr/bin/env node

/**
 * Deploy MockLessBot for Twitter bot testing on Sepolia
 *
 * Usage:
 *   node scripts/deploy-bot-test.js
 *
 * This deploys:
 *   1. MockLessBot - test contract with toggleable mint windows
 *   2. LessRenderer - connected to MockLessBot
 *
 * Uses existing script uploaded to Sepolia ScriptyStorage.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Sepolia Scripty addresses
const SCRIPTY_STORAGE = "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699";
const SCRIPTY_BUILDER = "0xD7587F110E08F4D120A231bA97d3B577A81Df022";

const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const log = (msg, color = "reset") => console.log(`${c[color]}${msg}${c.reset}`);

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

async function main() {
  log("\n=== Deploy MockLessBot for Twitter Bot Testing ===\n", "cyan");

  const rpcUrl = env.SEPOLIA_RPC_URL;
  const privateKey = env.PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    log("Missing SEPOLIA_RPC_URL or PRIVATE_KEY in .env", "red");
    process.exit(1);
  }

  // Get deployer address
  const deployer = execSync(`cast wallet address --private-key ${privateKey}`, {
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();

  log(`Deployer: ${deployer}`, "gray");

  // Check balance
  const balanceWei = execSync(`cast balance ${deployer} --rpc-url "${rpcUrl}"`, {
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
  const balance = Number(BigInt(balanceWei)) / 1e18;
  log(`Balance: ${balance.toFixed(4)} ETH\n`, balance < 0.01 ? "yellow" : "gray");

  // Deploy MockLessBot
  log("Deploying MockLessBot...", "gray");
  const mockLessResult = execSync(
    `forge create contracts/test/MockLessBot.sol:MockLessBot --rpc-url "${rpcUrl}" --private-key ${privateKey} --broadcast --constructor-args ${deployer}`,
    { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
  );
  const mockLessMatch = mockLessResult.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
  const mockLessAddress = mockLessMatch ? mockLessMatch[1] : null;

  if (!mockLessAddress) {
    log("Failed to deploy MockLessBot", "red");
    console.log(mockLessResult);
    process.exit(1);
  }
  log(`MockLessBot: ${mockLessAddress}`, "green");

  // Deploy LessRenderer
  log("\nDeploying LessRenderer...", "gray");
  const scriptName = env.SCRIPT_NAME || "less-sepolia";
  const baseImageURL = env.BASE_IMAGE_URL || "https://less.art/images/";

  const rendererResult = execSync(
    `forge create contracts/LessRenderer.sol:LessRenderer --rpc-url "${rpcUrl}" --private-key ${privateKey} --broadcast --constructor-args ${mockLessAddress} ${SCRIPTY_BUILDER} ${SCRIPTY_STORAGE} "${scriptName}" "${baseImageURL}" ${deployer}`,
    { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
  );
  const rendererMatch = rendererResult.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
  const rendererAddress = rendererMatch ? rendererMatch[1] : null;

  if (!rendererAddress) {
    log("Failed to deploy LessRenderer", "red");
    console.log(rendererResult);
    process.exit(1);
  }
  log(`LessRenderer: ${rendererAddress}`, "green");

  // Set renderer on MockLessBot
  log("\nSetting renderer on MockLessBot...", "gray");
  execSync(
    `cast send --rpc-url "${rpcUrl}" --private-key ${privateKey} ${mockLessAddress} "setRenderer(address)" ${rendererAddress}`,
    { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
  );
  log("Renderer set", "green");

  // Save deployment info
  const deploymentInfo = {
    network: "sepolia",
    timestamp: new Date().toISOString(),
    contracts: {
      mockLessBot: mockLessAddress,
      lessRenderer: rendererAddress,
    },
    config: {
      scriptyStorage: SCRIPTY_STORAGE,
      scriptyBuilder: SCRIPTY_BUILDER,
      scriptName,
      owner: deployer,
    },
  };

  const infoPath = join(rootDir, "deployment-bot-test.json");
  writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));

  log("\n=== Deployment Complete ===\n", "cyan");
  log(`MockLessBot:  ${mockLessAddress}`, "green");
  log(`LessRenderer: ${rendererAddress}`, "green");
  log(`\nSaved to: ${infoPath}`, "gray");

  log("\n=== Usage ===\n", "cyan");
  log("Start a 3-minute mint window:", "gray");
  log(`  cast send --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY ${mockLessAddress} "startFold(uint256)" 180`, "gray");
  log("\nEnd mint window early:", "gray");
  log(`  cast send --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY ${mockLessAddress} "endFold()"`, "gray");
  log("\nCheck if window is active:", "gray");
  log(`  cast call --rpc-url $SEPOLIA_RPC_URL ${mockLessAddress} "isWindowActive()(bool)"`, "gray");
  log("\nMint a token:", "gray");
  log(`  cast send --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY ${mockLessAddress} "mint()"`, "gray");

  // Verify contracts
  log("\n=== Verifying Contracts ===\n", "cyan");

  try {
    log("Verifying MockLessBot...", "gray");
    execSync(
      `forge verify-contract ${mockLessAddress} contracts/test/MockLessBot.sol:MockLessBot --chain sepolia --constructor-args $(cast abi-encode "constructor(address)" ${deployer}) --watch`,
      { cwd: rootDir, encoding: "utf-8", stdio: "inherit" }
    );
    log("MockLessBot verified", "green");
  } catch {
    log("MockLessBot verification failed (may already be verified)", "yellow");
  }

  try {
    log("\nVerifying LessRenderer...", "gray");
    const constructorArgs = execSync(
      `cast abi-encode "constructor(address,address,address,string,string,address)" ${mockLessAddress} ${SCRIPTY_BUILDER} ${SCRIPTY_STORAGE} "${scriptName}" "${baseImageURL}" ${deployer}`,
      { encoding: "utf-8", cwd: rootDir }
    ).trim();
    execSync(
      `forge verify-contract ${rendererAddress} contracts/LessRenderer.sol:LessRenderer --chain sepolia --constructor-args ${constructorArgs} --watch`,
      { cwd: rootDir, encoding: "utf-8", stdio: "inherit" }
    );
    log("LessRenderer verified", "green");
  } catch {
    log("LessRenderer verification failed (may already be verified)", "yellow");
  }
}

main().catch(error => {
  log(`Error: ${error.message}`, "red");
  process.exit(1);
});
