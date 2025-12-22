import { readFileSync } from 'fs';
import { chromium } from 'playwright';
import { createHash } from 'crypto';

// Test with both original and encoded versions
const original = readFileSync('/tmp/original.js', 'utf8');
const encoded = readFileSync('../web/onchain/bundled.js', 'utf8');
const decoded = decodeURIComponent(encoded);

// Build test HTML with seed from token #12
const seed = '0x0f5f3900456f4c0231d1fea4e8548d79ca11742d3cf00aeb963eb86698586f49';
const makeHtml = (js) => `<html><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden}</style><script>window.LESS_TOKEN_ID=12;window.LESS_SEED="${seed}";window.FOLD_COUNT=0;</script></head><body><script>${js}</script></body></html>`;

const browser = await chromium.launch({ headless: true });

async function renderAndHash(html, label) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  const canvas = await page.$('canvas');
  if (!canvas) {
    console.log(label + ': No canvas found');
    await page.close();
    return null;
  }

  const screenshot = await canvas.screenshot({ type: 'png' });
  await page.close();

  const hash = createHash('md5').update(screenshot).digest('hex');
  console.log(label + ': Canvas rendered, hash=' + hash);
  return hash;
}

console.log('Testing that original and decoded JS produce identical renders...\n');

const origHash = await renderAndHash(makeHtml(original), 'Original');
const decodedHash = await renderAndHash(makeHtml(decoded), 'Decoded');

if (origHash === decodedHash) {
  console.log('\n✅ RENDERS MATCH: Outputs are identical');
} else {
  console.log('\n❌ RENDERS DIFFER!');
}

await browser.close();
