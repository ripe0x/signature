#!/usr/bin/env node

/**
 * Generate Outputs from Deployed Contracts
 *
 * Reads deployed contract addresses and generates tokenURIs, metadata, and previews
 * for minted tokens. Can optionally mint tokens if none exist.
 *
 * Usage:
 *   node scripts/generate-outputs.js [--network fork|mainnet] [--token-ids 1,2,3] [--output-dir ./outputs] [--auto-mint] [--mint=5]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Parse command line arguments
const args = process.argv.slice(2);
const network =
  args.find((arg) => arg.startsWith("--network"))?.split("=")[1] || "fork";
const tokenIdsArg = args
  .find((arg) => arg.startsWith("--token-ids"))
  ?.split("=")[1];
const outputDir =
  args.find((arg) => arg.startsWith("--output-dir"))?.split("=")[1] ||
  join(rootDir, "outputs");

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Load deployment info
function loadDeploymentInfo() {
  const deploymentPath = join(rootDir, `deployment-${network}.json`);
  if (!existsSync(deploymentPath)) {
    log(`Deployment file not found: ${deploymentPath}`, "yellow");
    log("Run the deployment script first: npm run deploy:fork", "yellow");
    process.exit(1);
  }

  const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));
  return deployment;
}

// Get RPC URL
function getRpcUrl() {
  const envPath = join(rootDir, ".env");
  let env = {};
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
  }

  if (network === "fork") {
    return env.FORK_RPC_URL || "http://127.0.0.1:8545";
  } else if (network === "mainnet") {
    return env.MAINNET_RPC_URL;
  }
  return null;
}

// Call tokenURI using Foundry script (more reliable)
function getTokenURIs(contractAddress, tokenIds, rpcUrl) {
  try {
    const tokenIdsStr = tokenIds.join(",");
    const cmd = `forge script script/GenerateOutputs.s.sol --tc GenerateOutputsScript --rpc-url ${rpcUrl} -vvv`;

    // Set environment variables for the script
    const env = {
      ...process.env,
      LESS_ADDRESS: contractAddress,
      TOKEN_IDS: tokenIdsStr,
    };

    const output = execSync(cmd, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
      env: env,
    });

    // Parse tokenURIs from output
    // Look for "TokenURI:" followed by the URI on next line
    const lines = output.split("\n");
    const uris = {};
    let currentTokenId = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match "--- Token X ---"
      const tokenMatch = line.match(/--- Token (\d+) ---/);
      if (tokenMatch) {
        currentTokenId = parseInt(tokenMatch[1]);
      }

      // Match "TokenURI:" followed by URI on same or next line
      if (line.includes("TokenURI:")) {
        // URI might be on same line or next line
        const uriMatch = line.match(/TokenURI:\s*(.+)/);
        if (uriMatch && currentTokenId) {
          uris[currentTokenId] = uriMatch[1].trim();
        } else if (i + 1 < lines.length && currentTokenId) {
          // Check next line
          const nextLine = lines[i + 1].trim();
          if (
            nextLine &&
            !nextLine.startsWith("---") &&
            !nextLine.startsWith("===")
          ) {
            uris[currentTokenId] = nextLine;
          }
        }
      }
    }

    return uris;
  } catch (error) {
    log(`Error getting tokenURIs: ${error.message}`, "yellow");
    if (error.stdout) {
      // Try to extract URIs from error output too
      const lines = error.stdout.split("\n");
      const uris = {};
      let currentTokenId = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const tokenMatch = line.match(/--- Token (\d+) ---/);
        if (tokenMatch) {
          currentTokenId = parseInt(tokenMatch[1]);
        }
        if (line.includes("TokenURI:") && currentTokenId) {
          const uriMatch = line.match(/TokenURI:\s*(.+)/);
          if (uriMatch) {
            uris[currentTokenId] = uriMatch[1].trim();
          } else if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine && !nextLine.startsWith("---")) {
              uris[currentTokenId] = nextLine;
            }
          }
        }
      }

      if (Object.keys(uris).length > 0) {
        return uris;
      }
    }
    return {};
  }
}

// Decode base64 data URI
function decodeDataURI(uri) {
  if (!uri.startsWith("data:application/json;base64,")) {
    return null;
  }

  const base64Data = uri.replace("data:application/json;base64,", "");
  const jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
  return JSON.parse(jsonString);
}

// Extract animation URL from metadata
function extractAnimationURL(metadata) {
  if (metadata.animation_url) {
    // If it's a data URI, decode it
    if (metadata.animation_url.startsWith("data:text/html;base64,")) {
      const base64Data = metadata.animation_url.replace(
        "data:text/html;base64,",
        ""
      );
      return Buffer.from(base64Data, "base64").toString("utf-8");
    }
    return metadata.animation_url;
  }
  return null;
}

// Main execution
async function main() {
  log("\n=== Generating Outputs from Deployed Contracts ===\n", "blue");

  // Load deployment info
  const deployment = loadDeploymentInfo();
  const lessAddress = deployment.addresses?.less;

  if (!lessAddress) {
    log("Less contract address not found in deployment info", "yellow");
    process.exit(1);
  }

  log(`Network: ${network}`, "blue");
  log(`Less Contract: ${lessAddress}`, "gray");
  log("");

  // Get RPC URL
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    log(
      "RPC URL not found. Set FORK_RPC_URL or MAINNET_RPC_URL in .env",
      "yellow"
    );
    process.exit(1);
  }

  // Check if we should auto-mint
  const autoMint = args.includes("--auto-mint");
  const numTokensToMint = args
    .find((arg) => arg.startsWith("--mint"))
    ?.split("=")[1];

  // Check RPC connection first
  try {
    const blockNumber = execSync(`cast block-number --rpc-url ${rpcUrl}`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    log(`Connected to RPC (block: ${blockNumber.trim()})`, "gray");
  } catch (error) {
    log(`Cannot connect to RPC at ${rpcUrl}`, "yellow");
    if (network === "fork") {
      log("Please start a fork node:", "yellow");
      log("  anvil --fork-url $MAINNET_RPC_URL", "gray");
    }
    process.exit(1);
  }

  // Verify contract exists
  try {
    const code = execSync(`cast code ${lessAddress} --rpc-url ${rpcUrl}`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (code.trim() === "0x" || code.trim() === "") {
      log(`Contract not found at ${lessAddress}`, "yellow");
      log(
        "The fork node may have been restarted or contracts not deployed.",
        "yellow"
      );
      log("Please deploy contracts first: npm run deploy:fork", "yellow");
      process.exit(1);
    }
  } catch (error) {
    log(`Error checking contract: ${error.message}`, "yellow");
    log("Please verify the contract address and RPC connection", "yellow");
    process.exit(1);
  }

  // Get total supply first
  let totalSupply = 0;
  try {
    const totalSupplyOutput = execSync(
      `cast call ${lessAddress} "totalSupply()" --rpc-url ${rpcUrl}`,
      { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
    );
    const hexOutput = totalSupplyOutput.trim();
    if (hexOutput.startsWith("0x")) {
      totalSupply = parseInt(hexOutput, 16);
    } else {
      totalSupply = parseInt(hexOutput, 10);
    }
    log(`Found ${totalSupply} minted tokens`, "gray");
  } catch (error) {
    log(`Error getting total supply: ${error.message}`, "yellow");
    totalSupply = 0;
  }

  // Auto-mint if needed
  if (totalSupply === 0 && (autoMint || numTokensToMint)) {
    const tokensToMint = numTokensToMint ? parseInt(numTokensToMint) : 5;
    log(`\nNo tokens minted. Minting ${tokensToMint} tokens...`, "blue");

    try {
      const mintCmd = `forge script script/GenerateOutputs.s.sol --tc GenerateOutputsScript --rpc-url ${rpcUrl} --broadcast -vvv`;
      const env = {
        ...process.env,
        LESS_ADDRESS: lessAddress,
        AUTO_MINT: "true",
        NUM_TOKENS_TO_MINT: tokensToMint.toString(),
      };

      const mintOutput = execSync(mintCmd, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: "pipe",
        env: env,
      });

      console.log(mintOutput);

      // Get new total supply
      const newSupplyOutput = execSync(
        `cast call ${lessAddress} "totalSupply()" --rpc-url ${rpcUrl}`,
        { cwd: rootDir, encoding: "utf-8", stdio: "pipe" }
      );
      totalSupply = parseInt(newSupplyOutput.trim(), 16);
      log(`✓ Minted ${totalSupply} tokens\n`, "green");
    } catch (error) {
      log(`Error minting tokens: ${error.message}`, "yellow");
      if (error.stdout) console.log(error.stdout);
      process.exit(1);
    }
  }

  // Determine which tokens to generate
  let tokenIds = [];
  if (tokenIdsArg) {
    tokenIds = tokenIdsArg.split(",").map((id) => parseInt(id.trim()));
  } else {
    if (totalSupply === 0) {
      log("No tokens minted yet.", "yellow");
      log("Options:", "yellow");
      log("  1. Auto-mint: --auto-mint (mints 5 tokens)", "gray");
      log("  2. Mint specific amount: --mint=10", "gray");
      log("  3. Specify token IDs: --token-ids=1,2,3", "gray");
      process.exit(0);
    }

    // Generate outputs for all minted tokens
    for (let i = 1; i <= totalSupply; i++) {
      tokenIds.push(i);
    }
  }

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  log(`Generating outputs for ${tokenIds.length} token(s)...\n`, "blue");

  // Get all tokenURIs at once using Foundry script
  log("Fetching tokenURIs from contract...", "gray");
  const tokenURIs = getTokenURIs(lessAddress, tokenIds, rpcUrl);

  if (Object.keys(tokenURIs).length === 0) {
    log(
      "No tokenURIs retrieved. Check contract address and RPC connection.",
      "yellow"
    );
    process.exit(1);
  }

  log(`Retrieved ${Object.keys(tokenURIs).length} tokenURI(s)\n`, "gray");

  const results = [];

  for (const tokenId of tokenIds) {
    log(`Processing token #${tokenId}...`, "gray");

    // Get tokenURI from retrieved map
    const tokenURI = tokenURIs[tokenId];
    if (!tokenURI) {
      log(`  ⚠ Skipping token ${tokenId} (tokenURI not found)`, "yellow");
      continue;
    }

    // Decode metadata
    const metadata = decodeDataURI(tokenURI);
    if (!metadata) {
      log(`  ⚠ Skipping token ${tokenId} (invalid metadata format)`, "yellow");
      continue;
    }

    // Extract animation HTML
    const animationHTML = extractAnimationURL(metadata);

    // Save files
    const tokenDir = join(outputDir, `token-${tokenId}`);
    if (!existsSync(tokenDir)) {
      mkdirSync(tokenDir, { recursive: true });
    }

    // Save tokenURI
    writeFileSync(join(tokenDir, "tokenURI.txt"), tokenURI);

    // Save metadata JSON
    writeFileSync(
      join(tokenDir, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

    // Save animation HTML
    if (animationHTML) {
      writeFileSync(join(tokenDir, "animation.html"), animationHTML);
    }

    // Save image URL (if available)
    if (metadata.image) {
      writeFileSync(join(tokenDir, "image-url.txt"), metadata.image);
    }

    results.push({
      tokenId,
      name: metadata.name,
      seed: metadata.attributes?.find((a) => a.trait_type === "Seed")?.value,
      foldId: metadata.attributes?.find((a) => a.trait_type === "Fold ID")
        ?.value,
    });

    log(`  ✓ Token #${tokenId} output generated`, "green");
  }

  // Generate index HTML
  const indexHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Less NFT Outputs - ${network}</title>
    <style>
        body { font-family: monospace; background: #111; color: #fff; padding: 20px; }
        h1 { margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #222; border-radius: 8px; overflow: hidden; }
        .card iframe { width: 100%; height: 200px; border: none; }
        .card-info { padding: 10px; font-size: 12px; }
        .card-info a { color: #0af; text-decoration: none; }
        .card-info a:hover { text-decoration: underline; }
        .seed { color: #666; word-break: break-all; font-size: 10px; }
    </style>
</head>
<body>
    <h1>Less NFT Outputs</h1>
    <p style="color:#666;margin-bottom:20px;">
        Network: ${network}<br>
        Contract: ${lessAddress}<br>
        Generated: ${new Date().toISOString()}
    </p>
    <div class="grid">
        ${results
          .map(
            (r) => `
        <div class="card">
            <iframe src="token-${r.tokenId}/animation.html"></iframe>
            <div class="card-info">
                <strong><a href="token-${r.tokenId}/animation.html" target="_blank">${r.name}</a></strong><br>
                Fold ID: ${r.foldId}<br>
                <span class="seed">Seed: ${r.seed}</span><br>
                <a href="token-${r.tokenId}/metadata.json" target="_blank">Metadata</a> |
                <a href="token-${r.tokenId}/tokenURI.txt" target="_blank">TokenURI</a>
            </div>
        </div>
        `
          )
          .join("")}
    </div>
</body>
</html>`;

  writeFileSync(join(outputDir, "index.html"), indexHTML);

  // Summary
  log("\n=== Summary ===", "blue");
  log(`Generated outputs for ${results.length} token(s)`, "green");
  log(`Output directory: ${outputDir}`, "gray");
  log(`\nOpen ${outputDir}/index.html to view all outputs`, "gray");
  log("");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
