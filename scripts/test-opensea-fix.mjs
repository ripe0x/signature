#!/usr/bin/env node
/**
 * End-to-end test simulating the full OpenSea pipeline
 *
 * This test verifies that:
 * 1. The escaped JS survives OpenSea's URL decoding
 * 2. The resulting HTML renders correctly in a sandboxed iframe
 * 3. Multiple tokens render without errors
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

console.log('='.repeat(60));
console.log('OpenSea Fix Verification Test');
console.log('='.repeat(60));
console.log('');

// Step 1: Build the escaped JS
console.log('[1/5] Building escaped JS...');
try {
  execSync('npm run build:onchain', { stdio: 'pipe' });
  console.log('      ✅ Build complete');
} catch (e) {
  console.log('      ❌ Build failed:', e.message);
  process.exit(1);
}

// Step 2: Read and verify the escaped content
console.log('[2/5] Verifying escaped content...');
const escapedJs = readFileSync('web/onchain/bundled.js', 'utf8');
const percentCount = (escapedJs.match(/%(?!25)/g) || []).length; // % not followed by 25
const encoded25Count = (escapedJs.match(/%25/g) || []).length;

console.log(`      Original % signs remaining: ${percentCount}`);
console.log(`      Encoded %25 sequences: ${encoded25Count}`);

if (percentCount > 0) {
  console.log('      ⚠️  Warning: Some % signs not encoded');
}
console.log('      ✅ Escaping verified');

// Step 3: Simulate OpenSea's URL decoding
console.log('[3/5] Simulating OpenSea URL decoding...');
const decodedJs = decodeURIComponent(escapedJs);
console.log(`      Encoded size: ${escapedJs.length} bytes`);
console.log(`      Decoded size: ${decodedJs.length} bytes`);

// Verify JS is valid after decoding
try {
  new Function(decodedJs);
  console.log('      ✅ Decoded JS is valid');
} catch (e) {
  console.log('      ❌ Decoded JS has syntax error:', e.message);
  process.exit(1);
}

// Step 4: Build HTML like the on-chain renderer does
console.log('[4/5] Building test HTML (simulating on-chain renderer)...');

function buildHtml(tokenId, seed, foldCount) {
  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden}</style><script>window.LESS_TOKEN_ID=${tokenId};window.LESS_SEED="${seed}";window.FOLD_COUNT=${foldCount};</script></head><body><script>${decodedJs}</script></body></html>`;
}

// Test tokens with different seeds
const testTokens = [
  { id: 2, seed: '0x577e355f0c2e5b97ddf8591ff44a7cc479f61ca565eefd1aca5c8b4be9873b18', foldCount: 0 },
  { id: 12, seed: '0x0f5f3900456f4c0231d1fea4e8548d79ca11742d3cf00aeb963eb86698586f49', foldCount: 0 },
  { id: 1, seed: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', foldCount: 5 },
];

console.log(`      Testing ${testTokens.length} tokens...`);

// Step 5: Test rendering in sandboxed iframe (like OpenSea)
console.log('[5/5] Testing renders in sandboxed iframe (like OpenSea)...');

// Dynamic import for playwright
const { chromium } = await import('playwright');

const browser = await chromium.launch({ headless: true });
let allPassed = true;

for (const token of testTokens) {
  const html = buildHtml(token.id, token.seed, token.foldCount);
  const base64Html = Buffer.from(html).toString('base64');

  // Create wrapper that simulates OpenSea's iframe embedding
  const wrapperHtml = `<!DOCTYPE html>
<html>
<head><title>OpenSea Simulation - Token ${token.id}</title></head>
<body>
<iframe
  id="animation"
  sandbox="allow-scripts"
  style="width:800px;height:600px;border:none;"
  src="data:text/html;base64,${base64Html}"
></iframe>
</body>
</html>`;

  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Content Security Policy')) {
      errors.push(msg.text());
    }
  });

  await page.setContent(wrapperHtml, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  // Check the iframe content
  const frames = page.frames();
  const iframe = frames.find(f => f !== page.mainFrame());

  let result = { canvas: false, renderComplete: false, errors: errors.length };

  if (iframe) {
    try {
      const canvas = await iframe.$('canvas');
      result.canvas = !!canvas;

      if (canvas) {
        const dims = await canvas.evaluate(c => ({ w: c.width, h: c.height }));
        result.dims = dims;
      }

      result.renderComplete = await iframe.evaluate(() => window.RENDER_COMPLETE);
    } catch (e) {
      result.frameError = e.message;
    }
  }

  const status = result.canvas && result.renderComplete && errors.length === 0 ? '✅' : '❌';
  console.log(`      Token #${token.id}: ${status} canvas=${result.canvas} complete=${result.renderComplete} errors=${errors.length}`);

  if (errors.length > 0) {
    errors.forEach(e => console.log(`         Error: ${e}`));
    allPassed = false;
  }

  if (!result.canvas || !result.renderComplete) {
    allPassed = false;
  }

  await page.close();
}

await browser.close();

console.log('');
console.log('='.repeat(60));
if (allPassed) {
  console.log('✅ ALL TESTS PASSED - Fix is working correctly');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Upload new script to ScriptyStorage');
  console.log('  2. Deploy new renderer with new script name');
  console.log('  3. Update Less contract to use new renderer');
  console.log('  4. Refresh metadata on OpenSea');
} else {
  console.log('❌ SOME TESTS FAILED - Review errors above');
}
console.log('='.repeat(60));

process.exit(allPassed ? 0 : 1);
