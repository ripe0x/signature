#!/usr/bin/env node

// Warm the image cache overnight without overloading the server
// Run with: node scripts/warm-cache.mjs

import https from 'https';

const IMAGE_API_URL = 'https://fold-image-api.fly.dev';
const DELAY_MS = 3000; // 3 seconds between requests
const TOTAL_TOKENS = 1035;

function fetchImage(tokenId) {
  return new Promise((resolve) => {
    const url = `${IMAGE_API_URL}/images/${tokenId}`;
    const start = Date.now();

    https.get(url, (res) => {
      let size = 0;
      res.on('data', (chunk) => size += chunk.length);
      res.on('end', () => {
        const ms = Date.now() - start;
        const cached = res.headers['x-cache'] === 'HIT';
        console.log(`${tokenId}/${TOTAL_TOKENS}: ${cached ? 'cached' : 'rendered'} ${ms}ms`);
        resolve(res.statusCode);
      });
    }).on('error', (err) => {
      console.log(`${tokenId}: ERROR ${err.message}`);
      resolve(0);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Warming cache for ${TOTAL_TOKENS} tokens`);
  console.log(`~${Math.ceil(TOTAL_TOKENS * DELAY_MS / 60000)} minutes total\n`);

  for (let id = 1; id <= TOTAL_TOKENS; id++) {
    await fetchImage(id);
    if (id < TOTAL_TOKENS) await sleep(DELAY_MS);
  }

  console.log('\nDone!');
}

main().catch(console.error);
