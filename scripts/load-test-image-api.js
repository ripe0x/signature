#!/usr/bin/env node

/**
 * Load Test for Image API
 *
 * Simulates burst of concurrent image render requests to verify
 * the image API can handle mint window traffic without timing out.
 *
 * Usage:
 *   node scripts/load-test-image-api.js
 *   node scripts/load-test-image-api.js --concurrency 20
 *   node scripts/load-test-image-api.js --url http://localhost:3001
 */

const TIMEOUT_THRESHOLD = 60000; // 60 seconds (matches twitter bot)
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_URL = 'https://fold-image-api.fly.dev';

// Parse command line args
const args = process.argv.slice(2);
let concurrency = DEFAULT_CONCURRENCY;
let baseUrl = DEFAULT_URL;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--concurrency' && args[i + 1]) {
    concurrency = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    console.log(`
Load Test for Image API

Usage:
  node scripts/load-test-image-api.js [options]

Options:
  --concurrency N   Number of concurrent requests (default: 10)
  --url URL         Base URL for image API (default: https://fold-image-api.fly.dev)
  --help            Show this help message
`);
    process.exit(0);
  }
}

// Generate random seed for uncached requests
function randomSeed() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Make a single request and measure time
async function makeRequest(index) {
  const seed = randomSeed();
  const url = `${baseUrl}/api/render?seed=${seed}&width=800&height=1131`;
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

    return {
      index,
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
      index,
      elapsed,
      success: false,
      status: 0,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
      overThreshold: elapsed > TIMEOUT_THRESHOLD,
    };
  }
}

async function runLoadTest() {
  console.log(`
Load Test: Image API
====================
Concurrent requests: ${concurrency}
Target: ${baseUrl}
Timeout threshold: ${TIMEOUT_THRESHOLD / 1000}s
`);

  console.log('Starting requests...\n');
  const overallStart = Date.now();

  // Fire all requests concurrently
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(makeRequest(i + 1));
  }

  const results = await Promise.all(promises);
  const overallElapsed = Date.now() - overallStart;

  // Print individual results
  console.log('Results:');
  results.sort((a, b) => a.index - b.index);

  for (const r of results) {
    const timeStr = (r.elapsed / 1000).toFixed(1).padStart(5) + 's';
    const status = r.success ? '✓' : '✗';
    const extra = r.error ? ` (${r.error})` : r.overThreshold ? ' (OVER THRESHOLD!)' : '';
    console.log(`  Request ${r.index.toString().padStart(2)}: ${timeStr} ${status}${extra}`);
  }

  // Calculate stats
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const overThreshold = results.filter(r => r.overThreshold);
  const times = successful.map(r => r.elapsed);
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;
  const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  console.log(`
Summary:
  Total time: ${(overallElapsed / 1000).toFixed(1)}s (parallel)
  Min: ${(minTime / 1000).toFixed(1)}s
  Max: ${(maxTime / 1000).toFixed(1)}s
  Avg: ${(avgTime / 1000).toFixed(1)}s
  Succeeded: ${successful.length}/${concurrency}
  Failed: ${failed.length}
  Over ${TIMEOUT_THRESHOLD / 1000}s threshold: ${overThreshold.length}
`);

  // Final verdict
  if (failed.length === 0 && overThreshold.length === 0) {
    console.log('✓ PASS - All requests completed within timeout\n');
    process.exit(0);
  } else {
    console.log('✗ FAIL - Some requests failed or exceeded timeout\n');
    process.exit(1);
  }
}

runLoadTest().catch(err => {
  console.error('Load test error:', err);
  process.exit(1);
});
