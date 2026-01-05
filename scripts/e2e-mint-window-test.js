#!/usr/bin/env node

/**
 * End-to-End Mint Window Test
 *
 * Simulates a mint window burst by concurrently:
 * 1. Fetching images from the image API (uncached tokens)
 * 2. Generating tweet previews from the twitter bot
 *
 * This tests the full flow without actually posting to Twitter.
 *
 * Usage:
 *   node scripts/e2e-mint-window-test.js
 *   node scripts/e2e-mint-window-test.js --tokens 964,965,966,969,970
 */

const IMAGE_API_URL = process.env.IMAGE_API_URL || 'https://fold-image-api.fly.dev';
const TWITTER_BOT_URL = process.env.TWITTER_BOT_URL || 'https://fold-twitter-bot.fly.dev';
const TIMEOUT_THRESHOLD = 60000; // 60 seconds (matches twitter bot)

// Tokens that were just uncached - use these for realistic test
const DEFAULT_TOKENS = [964, 965, 966, 969, 970, 980, 985, 986, 988, 991, 997, 998, 999, 1001, 1002, 1004, 1005, 1006];

// Parse command line args
const args = process.argv.slice(2);
let tokens = DEFAULT_TOKENS;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tokens' && args[i + 1]) {
    tokens = args[i + 1].split(',').map(t => parseInt(t.trim(), 10));
    i++;
  } else if (args[i] === '--help') {
    console.log(`
End-to-End Mint Window Test

Usage:
  node scripts/e2e-mint-window-test.js [options]

Options:
  --tokens IDS    Comma-separated token IDs (default: recently uncached tokens)
  --help          Show this help message

This test simulates a burst of mints by concurrently:
- Fetching images from image API (like twitter bot does)
- Generating tweet previews (without posting)
`);
    process.exit(0);
  }
}

// Fetch image from image API (matches twitter bot: no width/height = 1200x1697 default)
async function fetchImage(tokenId) {
  const url = `${IMAGE_API_URL}/images/${tokenId}`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_THRESHOLD + 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    const success = response.ok;
    const cacheStatus = response.headers.get('x-cache') || 'N/A';
    const renderTime = response.headers.get('x-render-time') || 'N/A';

    // Consume body to complete the request
    if (response.ok) await response.arrayBuffer();

    return {
      type: 'image',
      tokenId,
      elapsed,
      success,
      status: response.status,
      cacheStatus,
      renderTime,
      overThreshold: elapsed > TIMEOUT_THRESHOLD,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return {
      type: 'image',
      tokenId,
      elapsed,
      success: false,
      status: 0,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
      overThreshold: elapsed > TIMEOUT_THRESHOLD,
    };
  }
}

// Generate tweet preview from twitter bot
async function generatePreview(tokenId) {
  const url = `${TWITTER_BOT_URL}/api/tweet/preview`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_THRESHOLD + 5000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mint', tokenId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    const data = await response.json();

    return {
      type: 'preview',
      tokenId,
      elapsed,
      success: response.ok,
      status: response.status,
      preview: data.preview?.substring(0, 50) + '...',
      overThreshold: elapsed > TIMEOUT_THRESHOLD,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return {
      type: 'preview',
      tokenId,
      elapsed,
      success: false,
      status: 0,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
      overThreshold: elapsed > TIMEOUT_THRESHOLD,
    };
  }
}

// Simulate full mint flow for a token
async function simulateMint(tokenId) {
  // In real flow, twitter bot does: generateTweet + fetchImage concurrently
  const [imageResult, previewResult] = await Promise.all([
    fetchImage(tokenId),
    generatePreview(tokenId),
  ]);

  return {
    tokenId,
    image: imageResult,
    preview: previewResult,
    totalTime: Math.max(imageResult.elapsed, previewResult.elapsed),
    success: imageResult.success && previewResult.success,
    overThreshold: imageResult.overThreshold || previewResult.overThreshold,
  };
}

async function runTest() {
  console.log(`
End-to-End Mint Window Test
============================
Tokens: ${tokens.length} (${tokens.slice(0, 5).join(', ')}${tokens.length > 5 ? '...' : ''})
Image API: ${IMAGE_API_URL}
Twitter Bot: ${TWITTER_BOT_URL}
Timeout threshold: ${TIMEOUT_THRESHOLD / 1000}s
`);

  console.log('Firing all requests concurrently (simulating mint burst)...\n');
  const overallStart = Date.now();

  // Fire all mint simulations concurrently
  const results = await Promise.all(tokens.map(simulateMint));
  const overallElapsed = Date.now() - overallStart;

  // Print individual results
  console.log('Results:');
  results.sort((a, b) => a.tokenId - b.tokenId);

  for (const r of results) {
    const imgTime = (r.image.elapsed / 1000).toFixed(1).padStart(5) + 's';
    const prevTime = (r.preview.elapsed / 1000).toFixed(1).padStart(5) + 's';
    const imgStatus = r.image.success ? (r.image.cacheStatus === 'HIT' ? 'HIT' : 'OK ') : 'ERR';
    const prevStatus = r.preview.success ? 'OK ' : 'ERR';
    const warning = r.overThreshold ? ' OVER THRESHOLD!' : '';
    const error = r.image.error || r.preview.error ? ` (${r.image.error || r.preview.error})` : '';

    console.log(`  Token ${r.tokenId.toString().padStart(4)}: img=${imgTime} [${imgStatus}]  tweet=${prevTime} [${prevStatus}]${warning}${error}`);
  }

  // Calculate stats
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const overThreshold = results.filter(r => r.overThreshold);
  const cacheHits = results.filter(r => r.image.cacheStatus === 'HIT');
  const cacheMisses = results.filter(r => r.image.cacheStatus === 'MISS');

  const imageTimes = results.filter(r => r.image.success).map(r => r.image.elapsed);
  const minImageTime = imageTimes.length > 0 ? Math.min(...imageTimes) : 0;
  const maxImageTime = imageTimes.length > 0 ? Math.max(...imageTimes) : 0;
  const avgImageTime = imageTimes.length > 0 ? imageTimes.reduce((a, b) => a + b, 0) / imageTimes.length : 0;

  const previewTimes = results.filter(r => r.preview.success).map(r => r.preview.elapsed);
  const minPreviewTime = previewTimes.length > 0 ? Math.min(...previewTimes) : 0;
  const maxPreviewTime = previewTimes.length > 0 ? Math.max(...previewTimes) : 0;
  const avgPreviewTime = previewTimes.length > 0 ? previewTimes.reduce((a, b) => a + b, 0) / previewTimes.length : 0;

  console.log(`
Summary:
  Total wall time: ${(overallElapsed / 1000).toFixed(1)}s (parallel)

  Image API:
    Min: ${(minImageTime / 1000).toFixed(1)}s
    Max: ${(maxImageTime / 1000).toFixed(1)}s
    Avg: ${(avgImageTime / 1000).toFixed(1)}s
    Cache hits: ${cacheHits.length}
    Cache misses: ${cacheMisses.length}

  Tweet Preview:
    Min: ${(minPreviewTime / 1000).toFixed(1)}s
    Max: ${(maxPreviewTime / 1000).toFixed(1)}s
    Avg: ${(avgPreviewTime / 1000).toFixed(1)}s

  Overall:
    Succeeded: ${successful.length}/${results.length}
    Failed: ${failed.length}
    Over ${TIMEOUT_THRESHOLD / 1000}s threshold: ${overThreshold.length}
`);

  // Final verdict
  if (failed.length === 0 && overThreshold.length === 0) {
    console.log('PASS - All requests completed within timeout\n');
    process.exit(0);
  } else {
    console.log('FAIL - Some requests failed or exceeded timeout\n');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
