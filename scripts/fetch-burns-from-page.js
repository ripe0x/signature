#!/usr/bin/env node

/**
 * Fetch Burn Data from NFT Strategy Page
 *
 * This script attempts to extract burn transaction data from the NFT Strategy page.
 * Since the page is dynamic, it uses Puppeteer to scrape the rendered content.
 *
 * Usage:
 *   node scripts/fetch-burns-from-page.js [--strategy-address 0x32f223e5c09878823934a8116f289bae2b657b8e] [--output historical-burns.json]
 */

import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, "..");

// Parse arguments
const args = process.argv.slice(2);
const strategyAddress =
  args.find((arg) => arg.startsWith("--strategy-address"))?.split("=")[1] ||
  "0x32f223e5c09878823934a8116f289bae2b657b8e";
const outputFile =
  args.find((arg) => arg.startsWith("--output"))?.split("=")[1] ||
  join(rootDir, "scripts", "historical-burns.json");

const pageUrl = `https://www.nftstrategy.fun/strategies/${strategyAddress}`;

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

// Check if puppeteer is installed
async function checkPuppeteer() {
  try {
    await import("puppeteer");
    return true;
  } catch (e) {
    return false;
  }
}

// Install puppeteer if needed
function installPuppeteer() {
  log("Installing puppeteer...", "yellow");
  try {
    execSync("npm install --save-dev puppeteer", {
      cwd: rootDir,
      stdio: "inherit",
    });
    log("✓ Puppeteer installed", "green");
    return true;
  } catch (error) {
    log(`✗ Failed to install puppeteer: ${error.message}`, "red");
    return false;
  }
}

// Try to fetch via API first
async function tryApiFetch() {
  log("Attempting to fetch via API...", "gray");

  // Common API patterns to try
  const apiEndpoints = [
    `https://api.nftstrategy.fun/strategies/${strategyAddress}/burns`,
    `https://www.nftstrategy.fun/api/strategies/${strategyAddress}/burns`,
    `https://api.nftstrategy.fun/v1/strategy/${strategyAddress}/transactions`,
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        log(`✓ Found API endpoint: ${endpoint}`, "green");
        return data;
      }
    } catch (error) {
      // Continue to next endpoint
    }
  }

  return null;
}

// Scrape page with Puppeteer
async function scrapeWithPuppeteer() {
  const hasPuppeteer = await checkPuppeteer();
  if (!hasPuppeteer) {
    const installed = installPuppeteer();
    if (!installed) {
      log("Puppeteer installation failed. Please install manually:", "red");
      log("  npm install --save-dev puppeteer", "gray");
      return null;
    }
  }

  const puppeteer = await import("puppeteer");

  log("Launching browser to scrape page...", "blue");
  log(`URL: ${pageUrl}`, "gray");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for content to load (adjust selector based on actual page structure)
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Give page time to render

    log("Extracting burn data from page...", "gray");

    // First, intercept network requests to find API calls
    const apiRequests = [];
    page.on("response", (response) => {
      const url = response.url();
      if (
        url.includes("api") ||
        url.includes("burn") ||
        url.includes("transaction")
      ) {
        apiRequests.push(url);
      }
    });

    // Try to extract burn data from the page
    // This will need to be adjusted based on the actual page structure
    const burns = await page.evaluate(() => {
      const burnData = [];

      // Look for burn transaction tables or lists
      // Common selectors to try:
      const selectors = [
        'table[data-testid="burns"]',
        "table tbody tr",
        '[class*="burn"]',
        '[class*="transaction"]',
        "table",
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // Found potential burn data container
          elements.forEach((row, index) => {
            try {
              const cells = row.querySelectorAll("td, th");
              if (cells.length >= 3) {
                // Try to extract data from table row
                const text = row.innerText || row.textContent;

                // Look for ETH amounts (pattern: number.ETH or number ETH)
                const ethMatch = text.match(/(\d+\.?\d*)\s*ETH/i);
                // Look for dates
                const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                // Look for transaction hashes
                const txMatch = text.match(/0x[a-fA-F0-9]{8,}/i);

                if (ethMatch || dateMatch || txMatch) {
                  burnData.push({
                    date: dateMatch ? dateMatch[1] : null,
                    ethSpent: ethMatch ? ethMatch[1] : null,
                    txHash: txMatch ? txMatch[0] : null,
                    rawText: text.substring(0, 200), // First 200 chars for debugging
                  });
                }
              }
            } catch (e) {
              // Skip this row
            }
          });

          if (burnData.length > 0) break;
        }
      }

      // Also try to find JSON data in script tags
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        if (content.includes("burn") || content.includes("transaction")) {
          try {
            // Try to extract JSON
            const jsonMatch = content.match(/\{[\s\S]*"burns"[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.burns) {
                return parsed.burns;
              }
            }
          } catch (e) {
            // Not valid JSON
          }
        }
      }

      return burnData;
    });

    // If we found API requests, log them
    if (apiRequests.length > 0) {
      log(`Found ${apiRequests.length} potential API endpoints:`, "gray");
      apiRequests.slice(0, 5).forEach((url) => log(`  ${url}`, "gray"));
    }

    await browser.close();

    if (burns && burns.length > 0) {
      log(`✓ Extracted ${burns.length} burn records`, "green");
      return burns;
    } else {
      log("⚠ No burn data found on page", "yellow");
      log(
        "The page structure may have changed or data loads differently",
        "gray"
      );
      return null;
    }
  } catch (error) {
    await browser.close();
    log(`✗ Scraping failed: ${error.message}`, "red");
    return null;
  }
}

// Alternative: Use Etherscan API to get transactions
async function fetchFromEtherscan() {
  log("Attempting to fetch from Etherscan API...", "gray");

  // You'll need an Etherscan API key for this
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    log("⚠ ETHERSCAN_API_KEY not set. Skipping Etherscan fetch.", "yellow");
    log("  Get a free API key at: https://etherscan.io/apis", "gray");
    return null;
  }

  try {
    const fetch = (await import("node-fetch")).default;

    // Get contract transactions
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${strategyAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "1" && data.result) {
      // Filter for burn-related transactions
      const burns = data.result
        .filter((tx) => {
          // Look for transactions that might be burns
          // This is a heuristic - adjust based on actual contract
          return (
            tx.value !== "0" ||
            tx.methodId === "0x..." || // Add actual method ID for processTokenTwap
            tx.functionName?.toLowerCase().includes("burn") ||
            tx.functionName?.toLowerCase().includes("twap")
          );
        })
        .map((tx) => ({
          date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
          ethSpent: (parseInt(tx.value) / 1e18).toFixed(6),
          txHash: tx.hash,
          fullTxHash: tx.hash,
          blockNumber: tx.blockNumber,
        }));

      if (burns.length > 0) {
        log(
          `✓ Found ${burns.length} potential burn transactions from Etherscan`,
          "green"
        );
        return burns;
      }
    }
  } catch (error) {
    log(`✗ Etherscan fetch failed: ${error.message}`, "yellow");
  }

  return null;
}

// Main function
async function main() {
  log("\n=== Fetching Burn Data from NFT Strategy Page ===\n", "blue");
  log(`Strategy: ${strategyAddress}`, "gray");
  log(`Page: ${pageUrl}\n`, "gray");

  let burns = null;

  // Try API first
  burns = await tryApiFetch();

  // Try Etherscan if API didn't work
  if (!burns || burns.length === 0) {
    burns = await fetchFromEtherscan();
  }

  // Try scraping if other methods didn't work
  if (!burns || burns.length === 0) {
    burns = await scrapeWithPuppeteer();
  }

  if (!burns || burns.length === 0) {
    log("\n✗ Could not fetch burn data", "red");
    log("\nAlternative: Manual extraction", "yellow");
    log("1. Open the page in your browser", "gray");
    log("2. Open browser DevTools (F12)", "gray");
    log("3. Go to Network tab and look for API calls", "gray");
    log("4. Or manually copy the burn data from the page", "gray");
    log("5. Add it to historical-burns.json", "gray");
    process.exit(1);
  }

  // Clean and format the data
  const formattedBurns = burns.map((burn) => ({
    date: burn.date || new Date().toISOString(),
    ethSpent: burn.ethSpent || burn.eth || "0",
    rstrBurned: burn.rstrBurned || burn.amount || null,
    txHash: burn.txHash || burn.hash || burn.fullTxHash || null,
    fullTxHash: burn.fullTxHash || burn.txHash || null,
  }));

  // Write to file
  const output = {
    burns: formattedBurns,
    notes: `Auto-generated from ${pageUrl} on ${new Date().toISOString()}`,
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  log(`\n✓ Saved ${formattedBurns.length} burns to: ${outputFile}`, "green");
  log("\nNext steps:", "blue");
  log(`  npm run use-historical-burns`, "gray");
}

main().catch((error) => {
  log(`\nError: ${error.message}`, "red");
  if (error.stack) {
    log(error.stack, "gray");
  }
  process.exit(1);
});
