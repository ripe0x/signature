#!/usr/bin/env node

/**
 * Mint Window Simulation
 *
 * Simulates a full mint window by:
 * 1. Deleting cached images from the image API (requires fly CLI)
 * 2. Fetching images exactly as the twitter bot does
 * 3. Generating tweet text via the twitter bot preview API
 * 4. Saving results to a local folder for manual verification
 *
 * Usage:
 *   node scripts/mint-window-simulation.js
 *   node scripts/mint-window-simulation.js --tokens 1001,1002,1003
 *   node scripts/mint-window-simulation.js --skip-cache-clear
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const IMAGE_API_URL = process.env.IMAGE_API_URL || 'https://fold-image-api.fly.dev';
const TWITTER_BOT_URL = process.env.TWITTER_BOT_URL || 'https://fold-twitter-bot.fly.dev';
const IMAGE_API_APP = 'fold-image-api';
const RESULTS_DIR = path.join(__dirname, '../test-results/mint-simulation');
const TIMEOUT = 60000; // 60s timeout (matches twitter bot)

// Default tokens to test - recent mints
const DEFAULT_TOKENS = [1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 102, 103, 104];

// Parse args
const args = process.argv.slice(2);
let tokens = DEFAULT_TOKENS;
let skipCacheClear = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tokens' && args[i + 1]) {
    tokens = args[i + 1].split(',').map(t => parseInt(t.trim(), 10));
    i++;
  } else if (args[i] === '--skip-cache-clear') {
    skipCacheClear = true;
  } else if (args[i] === '--help') {
    console.log(`
Mint Window Simulation

Simulates a burst of mints exactly as the twitter bot handles them,
saving tweet text and images to a local folder for verification.

Usage:
  node scripts/mint-window-simulation.js [options]

Options:
  --tokens IDS        Comma-separated token IDs (default: 25 recent tokens)
  --skip-cache-clear  Skip deleting cached images (test with cache hits)
  --help              Show this help message

Output:
  test-results/mint-simulation/
    ├── summary.json        - Overall results and timing
    ├── 1001.png           - Token image
    ├── 1001.txt           - Tweet text
    └── ...
`);
    process.exit(0);
  }
}

// Ensure only 25 tokens max
if (tokens.length > 25) {
  console.log(`Limiting to 25 tokens (requested ${tokens.length})`);
  tokens = tokens.slice(0, 25);
}

// Delete cached images via fly ssh
function clearCache(tokenIds) {
  console.log(`\nClearing cache for ${tokenIds.length} tokens...`);

  const files = tokenIds.map(id => `token-${id}-1200x1697.png`).join(' ');
  const cmd = `fly ssh console -a ${IMAGE_API_APP} -C "sh -c 'cd /data/cache && rm -f ${files} 2>/dev/null && echo Done'"`;

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    console.log(`  Cleared ${tokenIds.length} cached images`);
    return true;
  } catch (err) {
    console.error(`  Warning: Cache clear failed - ${err.message}`);
    console.error(`  Make sure you're logged into fly CLI: fly auth login`);
    return false;
  }
}

// Fetch image exactly as twitter bot does (no width/height params)
function fetchImage(tokenId) {
  return new Promise((resolve) => {
    const url = `${IMAGE_API_URL}/images/${tokenId}`;
    const startTime = Date.now();

    const get = url.startsWith('https') ? https.get : http.get;
    const req = get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve({
          success: false,
          error: `HTTP ${res.statusCode}`,
          elapsed: Date.now() - startTime
        });
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const elapsed = Date.now() - startTime;
        const cacheStatus = res.headers['x-cache'] || 'UNKNOWN';
        resolve({
          success: true,
          buffer,
          elapsed,
          cacheStatus,
          size: buffer.length
        });
      });
      res.on('error', err => {
        resolve({
          success: false,
          error: err.message,
          elapsed: Date.now() - startTime
        });
      });
    });

    req.on('error', err => {
      resolve({
        success: false,
        error: err.message,
        elapsed: Date.now() - startTime
      });
    });

    req.setTimeout(TIMEOUT, () => {
      req.destroy();
      resolve({
        success: false,
        error: 'TIMEOUT',
        elapsed: Date.now() - startTime
      });
    });
  });
}

// Get tweet preview from twitter bot
async function getTweetPreview(tokenId) {
  const url = `${TWITTER_BOT_URL}/api/tweet/preview`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mint', tokenId }),
      signal: AbortSignal.timeout(TIMEOUT)
    });

    const data = await response.json();
    return {
      success: response.ok,
      text: data.preview || data.error,
      elapsed: Date.now() - startTime
    };
  } catch (err) {
    return {
      success: false,
      text: err.name === 'TimeoutError' ? 'TIMEOUT' : err.message,
      elapsed: Date.now() - startTime
    };
  }
}

// Process a single mint (image + tweet) - exactly like twitter bot
async function processMint(tokenId, onComplete) {
  const [imageResult, tweetResult] = await Promise.all([
    fetchImage(tokenId),
    getTweetPreview(tokenId)
  ]);

  const result = {
    tokenId,
    image: imageResult,
    tweet: tweetResult,
    success: imageResult.success && tweetResult.success
  };

  // Show "posted" tweet in real-time as each completes
  if (onComplete) onComplete(result);

  return result;
}

// Track post count for real-time display
let postCount = 0;

function showPostedTweet(result) {
  postCount++;
  const imgTime = (result.image.elapsed / 1000).toFixed(1) + 's';
  const status = result.success ? '✓' : '✗';
  const cacheInfo = result.image.cacheStatus === 'HIT' ? ' (cached)' : '';

  console.log(`\n┌─── Posted #${postCount} ───────────────────────────────────────────────┐`);
  console.log(`│ ${status} Token ${result.tokenId} - image rendered in ${imgTime}${cacheInfo}`);
  console.log(`├────────────────────────────────────────────────────────────┤`);

  // Show the actual tweet text
  const tweetLines = (result.tweet.text || 'ERROR').split('\n');
  for (const line of tweetLines) {
    console.log(`│  ${line.padEnd(56)}│`);
  }

  console.log(`└────────────────────────────────────────────────────────────┘`);

  // Save files immediately
  if (result.image.success && result.image.buffer) {
    fs.writeFileSync(path.join(RESULTS_DIR, `${result.tokenId}.png`), result.image.buffer);
  }
  fs.writeFileSync(path.join(RESULTS_DIR, `${result.tokenId}.txt`), result.tweet.text || 'ERROR');
}

async function run() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              MINT WINDOW SIMULATION                          ║
╠══════════════════════════════════════════════════════════════╣
║  Tokens: ${tokens.length.toString().padEnd(49)}║
║  Image API: ${IMAGE_API_URL.padEnd(46)}║
║  Twitter Bot: ${TWITTER_BOT_URL.padEnd(44)}║
║  Results: ${RESULTS_DIR.replace(process.cwd(), '.').padEnd(48)}║
╚══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Clear cache (unless skipped)
  if (!skipCacheClear) {
    const cleared = clearCache(tokens);
    if (!cleared) {
      console.log('\nContinuing without cache clear...\n');
    }
  } else {
    console.log('\nSkipping cache clear (--skip-cache-clear)\n');
  }

  // Step 2: Create results directory
  if (fs.existsSync(RESULTS_DIR)) {
    fs.rmSync(RESULTS_DIR, { recursive: true });
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Step 3: Fire all requests concurrently (simulating mint burst)
  console.log('Processing mints concurrently (tweets appear as they complete)...');
  const overallStart = Date.now();

  const results = await Promise.all(tokens.map(t => processMint(t, showPostedTweet)));

  const overallElapsed = Date.now() - overallStart;

  // Step 4: Print summary
  console.log('\n' + '═'.repeat(62));
  console.log('SUMMARY');
  console.log('═'.repeat(62));

  // Calculate stats
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const cacheHits = results.filter(r => r.image.cacheStatus === 'HIT').length;
  const cacheMisses = results.filter(r => r.image.cacheStatus === 'MISS').length;
  const imageTimes = results.filter(r => r.image.success).map(r => r.image.elapsed);
  const avgImageTime = imageTimes.length > 0
    ? imageTimes.reduce((a, b) => a + b, 0) / imageTimes.length
    : 0;

  // Build summary for JSON
  const summary = {
    timestamp: new Date().toISOString(),
    totalTime: overallElapsed,
    stats: { total: results.length, succeeded, failed, cacheHits, cacheMisses },
    tokens: results.map(r => ({
      tokenId: r.tokenId,
      success: r.success,
      image: {
        success: r.image.success,
        elapsed: r.image.elapsed,
        cacheStatus: r.image.cacheStatus,
        size: r.image.size,
        error: r.image.error
      },
      tweet: {
        success: r.tweet.success,
        elapsed: r.tweet.elapsed,
        text: r.tweet.text
      }
    }))
  };

  // Save summary JSON
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`
  Total wall time: ${(overallElapsed / 1000).toFixed(1)}s
  Succeeded: ${succeeded}/${results.length}
  Failed: ${failed}
  Cache hits: ${cacheHits}
  Cache misses: ${cacheMisses}
  Avg image time: ${(avgImageTime / 1000).toFixed(1)}s
  Max image time: ${(Math.max(...imageTimes) / 1000).toFixed(1)}s

Results saved to: ${RESULTS_DIR}
`);

  // Final verdict
  if (failed === 0) {
    console.log('✓ SIMULATION PASSED - All mints processed successfully\n');
    process.exit(0);
  } else {
    console.log('✗ SIMULATION FAILED - Some mints failed\n');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});
