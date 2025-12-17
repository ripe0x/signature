#!/usr/bin/env node

/**
 * Sepolia Testnet Deployment Script
 *
 * Tests the Scripty chunk uploads and LessRenderer on Sepolia.
 * Uses MockLess contract since there's no real Less.sol on testnet.
 *
 * Prerequisites:
 *   - SEPOLIA_RPC_URL in .env (e.g., https://sepolia.infura.io/v3/YOUR_KEY)
 *   - PRIVATE_KEY in .env (deployer wallet with Sepolia ETH)
 *
 * Usage:
 *   node scripts/deploy-sepolia.js [options]
 *
 * Options:
 *   --skip-bundle    Skip JavaScript bundling
 *   --skip-upload    Skip uploading to ScriptyStorage
 *   --skip-deploy    Skip contract deployment
 *   --script-name    Custom script name (default: less-sepolia-test)
 *   --verify         Verify contracts on Etherscan after deployment
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Sepolia Scripty contract addresses
const SEPOLIA_SCRIPTY = {
  storage: "0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699",
  builder: "0xD7587F110E08F4D120A231bA97d3B577A81Df022",
  ethfs: "0x8FAA1AAb9DA8c75917C43Fb24fDdb513edDC3245",
};

// Colors for terminal output
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const log = (msg, color = "reset") => console.log(`${c[color]}${msg}${c.reset}`);
const logStep = (step, msg) => log(`\n[${step}] ${msg}`, "cyan");
const logSuccess = (msg) => log(`✓ ${msg}`, "green");
const logWarning = (msg) => log(`⚠ ${msg}`, "yellow");
const logError = (msg) => log(`✗ ${msg}`, "red");

// Parse command line arguments
const args = process.argv.slice(2);
const skipBundle = args.includes("--skip-bundle");
const skipUpload = args.includes("--skip-upload");
const skipDeploy = args.includes("--skip-deploy");
const shouldVerify = args.includes("--verify");
const scriptNameArg = args.find((a) => a.startsWith("--script-name="));
const scriptName = scriptNameArg?.split("=")[1] || "less-sepolia-test";

// Load environment
function loadEnv() {
  const envPath = join(rootDir, ".env");
  const env = { ...process.env };

  if (existsSync(envPath)) {
    readFileSync(envPath, "utf-8")
      .split("\n")
      .forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...rest] = trimmed.split("=");
          if (key && rest.length) {
            env[key.trim()] = rest.join("=").trim();
          }
        }
      });
  }
  return env;
}

const env = loadEnv();

// Validate required environment variables
function validateEnv() {
  const rpcUrl = env.SEPOLIA_RPC_URL;
  const privateKey = env.PRIVATE_KEY;

  if (!rpcUrl) {
    logError("SEPOLIA_RPC_URL not set in .env");
    logError("Example: SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY");
    process.exit(1);
  }

  if (!privateKey) {
    logError("PRIVATE_KEY not set in .env");
    logError("This should be the private key of a wallet with Sepolia ETH");
    process.exit(1);
  }

  return { rpcUrl, privateKey };
}

// Get deployer address from private key
function getDeployerAddress(privateKey) {
  try {
    const result = execSync(
      `cast wallet address --private-key ${privateKey}`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();
    return result;
  } catch (error) {
    logError("Failed to derive address from private key");
    process.exit(1);
  }
}

// Check deployer balance
async function checkBalance(rpcUrl, address) {
  try {
    const result = execSync(
      `cast balance ${address} --rpc-url ${rpcUrl}`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();
    const balanceWei = BigInt(result);
    const balanceEth = Number(balanceWei) / 1e18;
    return balanceEth;
  } catch (error) {
    return 0;
  }
}

// Bundle JavaScript
async function bundleScript() {
  if (skipBundle) {
    logWarning("Skipping bundle step");
    return;
  }

  logStep("1/4", "Bundling JavaScript");

  const entryPoint = join(rootDir, "web/onchain/index.js");
  const outputPath = join(rootDir, "web/onchain/bundled.js");

  if (!existsSync(entryPoint)) {
    logError(`Entry point not found: ${entryPoint}`);
    process.exit(1);
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
  } catch (error) {
    logError(`Bundle failed: ${error.message}`);
    process.exit(1);
  }
}

// Upload script to Sepolia ScriptyStorage
async function uploadScript(rpcUrl, privateKey) {
  if (skipUpload) {
    logWarning("Skipping upload step");
    return;
  }

  logStep("2/4", `Uploading script "${scriptName}" to Sepolia ScriptyStorage`);

  const scriptPath = join(rootDir, "web/onchain/bundled.js");
  if (!existsSync(scriptPath)) {
    logError("Bundled script not found. Run without --skip-bundle first.");
    process.exit(1);
  }

  const scriptContent = readFileSync(scriptPath, "utf-8");
  const scriptBytes = Buffer.from(scriptContent, "utf-8");
  log(`Script size: ${scriptBytes.length} bytes`, "gray");

  const storage = SEPOLIA_SCRIPTY.storage;

  // Step 1: Create content entry
  log("Creating content entry...", "gray");
  try {
    execSync(
      `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} ${storage} 'createContent(string,bytes)' "${scriptName}" "0x"`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    logSuccess("Content entry created");
  } catch (error) {
    // May fail if already exists
    logWarning("Content entry may already exist, continuing...");
  }

  // Step 2: Upload in chunks (max ~24KB per chunk)
  const maxChunkSize = 24000;
  const totalChunks = Math.ceil(scriptBytes.length / maxChunkSize);
  log(`Uploading in ${totalChunks} chunk(s)...`, "gray");

  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxChunkSize;
    const end = Math.min(start + maxChunkSize, scriptBytes.length);
    const chunk = scriptBytes.slice(start, end);
    const chunkHex = "0x" + chunk.toString("hex");

    log(`  Chunk ${i + 1}/${totalChunks} (${chunk.length} bytes)...`, "gray");

    try {
      execSync(
        `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} ${storage} 'addChunkToContent(string,bytes)' "${scriptName}" ${chunkHex}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );
    } catch (error) {
      logError(`Failed to upload chunk ${i + 1}: ${error.message}`);
      process.exit(1);
    }
  }

  logSuccess("Script uploaded to ScriptyStorage");

  // Verify
  log("Verifying upload...", "gray");
  try {
    const result = execSync(
      `cast call ${storage} 'getContent(string,bytes)(bytes)' "${scriptName}" "0x" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    ).trim();

    if (result && result !== "0x" && result.length > 10) {
      logSuccess(`Verified: Script stored (${(result.length - 2) / 2} bytes)`);
    } else {
      logWarning("Verification returned empty - check upload");
    }
  } catch (error) {
    logWarning(`Could not verify: ${error.message}`);
  }
}

// Deploy contracts to Sepolia
async function deployContracts(rpcUrl, privateKey, deployerAddress) {
  if (skipDeploy) {
    logWarning("Skipping deploy step");
    return null;
  }

  logStep("3/4", "Deploying contracts to Sepolia");

  const addresses = {};

  // Helper to extract address from forge create output
  const extractDeployedAddress = (output) => {
    // Try "Deployed to: 0x..." pattern
    const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/i);
    if (match) return match[1];
    // Try JSON format as fallback
    try {
      const json = JSON.parse(output);
      return json.deployedTo;
    } catch {}
    return null;
  };

  // Step 1: Deploy MockLess
  log("Deploying MockLess...", "gray");
  try {
    const result = execSync(
      `forge create contracts/test/MockLess.sol:MockLess --rpc-url ${rpcUrl} --private-key ${privateKey} --broadcast`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    addresses.mockLess = extractDeployedAddress(result);
    if (!addresses.mockLess) {
      logError("Could not extract MockLess address from output:");
      console.log(result);
      process.exit(1);
    }
    logSuccess(`MockLess deployed: ${addresses.mockLess}`);
  } catch (error) {
    logError(`MockLess deployment failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    process.exit(1);
  }

  // Step 2: Deploy LessRenderer
  log("Deploying LessRenderer...", "gray");
  const baseImageURL = env.BASE_IMAGE_URL || "https://less.art/images/";

  try {
    const result = execSync(
      `forge create contracts/LessRenderer.sol:LessRenderer --rpc-url ${rpcUrl} --private-key ${privateKey} --broadcast --constructor-args ${addresses.mockLess} ${SEPOLIA_SCRIPTY.builder} ${SEPOLIA_SCRIPTY.storage} "${scriptName}" "${baseImageURL}" ${deployerAddress}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    addresses.renderer = extractDeployedAddress(result);
    if (!addresses.renderer) {
      logError("Could not extract LessRenderer address from output:");
      console.log(result);
      process.exit(1);
    }
    logSuccess(`LessRenderer deployed: ${addresses.renderer}`);
  } catch (error) {
    logError(`LessRenderer deployment failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    process.exit(1);
  }

  // Verify on Etherscan if requested
  if (shouldVerify) {
    log("Verifying contracts on Etherscan...", "gray");
    try {
      execSync(
        `forge verify-contract ${addresses.mockLess} contracts/test/MockLess.sol:MockLess --chain sepolia --watch`,
        { cwd: rootDir, stdio: "inherit" }
      );
      execSync(
        `forge verify-contract ${addresses.renderer} contracts/LessRenderer.sol:LessRenderer --chain sepolia --constructor-args $(cast abi-encode "constructor(address,address,address,string,string,address)" ${addresses.mockLess} ${SEPOLIA_SCRIPTY.builder} ${SEPOLIA_SCRIPTY.storage} "${scriptName}" "${baseImageURL}" ${deployerAddress}) --watch`,
        { cwd: rootDir, stdio: "inherit" }
      );
      logSuccess("Contracts verified on Etherscan");
    } catch (error) {
      logWarning(`Verification failed: ${error.message}`);
    }
  }

  return addresses;
}

// Create test tokens and verify tokenURI
async function testRenderer(rpcUrl, privateKey, addresses) {
  logStep("4/4", "Testing renderer with mock tokens");

  const { mockLess, renderer } = addresses;

  // Create 3 test tokens with different seeds
  const testSeeds = [
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  ];

  for (let i = 0; i < testSeeds.length; i++) {
    const tokenId = i + 1;
    log(`Setting seed for token ${tokenId}...`, "gray");

    try {
      execSync(
        `cast send --rpc-url ${rpcUrl} --private-key ${privateKey} ${mockLess} 'setSeed(uint256,bytes32)' ${tokenId} ${testSeeds[i]}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );
    } catch (error) {
      logError(`Failed to set seed for token ${tokenId}`);
      continue;
    }
  }

  logSuccess("Test tokens created");

  // Test tokenURI for token 1
  log("\nTesting tokenURI(1)...", "gray");
  try {
    const result = execSync(
      `cast call --rpc-url ${rpcUrl} ${renderer} 'tokenURI(uint256)' 1`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    ).trim();

    // Decode the result (it's ABI-encoded string)
    const decoded = execSync(
      `cast --to-ascii ${result}`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();

    // Check if it's a valid data URI
    if (decoded.startsWith("data:application/json;base64,")) {
      logSuccess("tokenURI returns valid data URI");

      // Decode the base64 JSON
      const base64 = decoded.replace("data:application/json;base64,", "");
      const json = Buffer.from(base64, "base64").toString("utf-8");
      const metadata = JSON.parse(json);

      log("\nMetadata preview:", "cyan");
      log(`  Name: ${metadata.name}`, "gray");
      log(`  Image: ${metadata.image}`, "gray");
      log(`  Attributes: ${metadata.attributes?.length || 0} traits`, "gray");

      if (metadata.animation_url?.startsWith("data:text/html;base64,")) {
        logSuccess("animation_url contains valid HTML data URI");

        // Check that the HTML contains the seed
        const htmlBase64 = metadata.animation_url.replace("data:text/html;base64,", "");
        const html = Buffer.from(htmlBase64, "base64").toString("utf-8");

        if (html.includes("LESS_SEED") && html.includes("LESS_TOKEN_ID")) {
          logSuccess("HTML contains seed injection script");
        } else {
          logWarning("HTML may be missing seed injection");
        }

        // Save HTML for manual inspection
        const htmlPath = join(rootDir, "test-output.html");
        writeFileSync(htmlPath, html);
        log(`  Full HTML saved to: ${htmlPath}`, "gray");
      } else {
        logWarning("animation_url may not be correctly formatted");
      }

      // Save full metadata
      const metadataPath = join(rootDir, "test-metadata.json");
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      log(`  Full metadata saved to: ${metadataPath}`, "gray");

    } else {
      logWarning("tokenURI result may not be correctly formatted");
      log(`Result: ${decoded.substring(0, 100)}...`, "gray");
    }
  } catch (error) {
    logError(`tokenURI call failed: ${error.message}`);
  }

  // Test contractURI
  log("\nTesting contractURI()...", "gray");
  try {
    const result = execSync(
      `cast call --rpc-url ${rpcUrl} ${renderer} 'contractURI()'`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    ).trim();

    const decoded = execSync(
      `cast --to-ascii ${result}`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();

    if (decoded.startsWith("data:application/json;base64,")) {
      logSuccess("contractURI returns valid data URI");
    }
  } catch (error) {
    logWarning(`contractURI call failed: ${error.message}`);
  }
}

// Save deployment info
function saveDeploymentInfo(addresses, scriptName) {
  const info = {
    network: "sepolia",
    timestamp: new Date().toISOString(),
    scriptName,
    scripty: SEPOLIA_SCRIPTY,
    addresses,
  };

  const infoPath = join(rootDir, "deployment-sepolia.json");
  writeFileSync(infoPath, JSON.stringify(info, null, 2));
  log(`\nDeployment info saved to: ${infoPath}`, "gray");
}

// Main
async function main() {
  log("\n" + "=".repeat(60), "bright");
  log("  Less NFT - Sepolia Testnet Deployment", "bright");
  log("=".repeat(60) + "\n", "bright");

  const { rpcUrl, privateKey } = validateEnv();
  const deployerAddress = getDeployerAddress(privateKey);

  log(`Deployer: ${deployerAddress}`, "gray");

  const balance = await checkBalance(rpcUrl, deployerAddress);
  log(`Balance: ${balance.toFixed(4)} ETH`, "gray");

  if (balance < 0.01) {
    logError("Insufficient Sepolia ETH. Get some from a faucet:");
    logError("  - https://sepoliafaucet.com");
    logError("  - https://www.alchemy.com/faucets/ethereum-sepolia");
    process.exit(1);
  }

  log(`Script name: ${scriptName}`, "gray");
  log(`ScriptyStorage: ${SEPOLIA_SCRIPTY.storage}`, "gray");
  log(`ScriptyBuilder: ${SEPOLIA_SCRIPTY.builder}`, "gray");
  log("");

  await bundleScript();
  await uploadScript(rpcUrl, privateKey);
  const addresses = await deployContracts(rpcUrl, privateKey, deployerAddress);

  if (addresses) {
    await testRenderer(rpcUrl, privateKey, addresses);
    saveDeploymentInfo(addresses, scriptName);
  }

  log("\n" + "=".repeat(60), "green");
  log("  Sepolia Deployment Complete!", "green");
  log("=".repeat(60), "green");

  if (addresses) {
    log("\nContract Addresses:", "cyan");
    log(`  MockLess:     ${addresses.mockLess}`, "green");
    log(`  LessRenderer: ${addresses.renderer}`, "green");
    log("\nTest with:", "cyan");
    log(`  cast call --rpc-url ${rpcUrl} ${addresses.renderer} 'tokenURI(uint256)' 1`, "gray");
  }
}

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
