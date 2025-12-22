import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const animationHtml = readFileSync('/Users/dd/Sites/signature/image-api/test-animation.html', 'utf8');

// Encode the HTML as base64 data URI (exactly how it would be in the animation_url)
const base64Html = Buffer.from(animationHtml).toString('base64');
const dataUri = `data:text/html;base64,${base64Html}`;

// Create a wrapper that simulates how OpenSea embeds animation_url
// OpenSea uses src= with the data URI directly
const wrapperHtml = `<!DOCTYPE html>
<html>
<head>
  <title>OpenSea Simulation</title>
</head>
<body style="margin:0;padding:20px;">
<h1>OpenSea Animation URL Test</h1>
<p>This simulates how OpenSea embeds animation_url content</p>
<iframe
  id="animation"
  sandbox="allow-scripts"
  style="width:800px;height:600px;border:2px solid black;"
  src="${dataUri}"
></iframe>
</body>
</html>`;

writeFileSync('/Users/dd/Sites/signature/image-api/test-opensea-wrapper.html', wrapperHtml);
console.log('Saved test file to test-opensea-wrapper.html');
console.log('Data URI length:', dataUri.length);

console.log('\nLaunching browser...');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', err => {
  errors.push('pageerror: ' + err.message);
  console.log('Page error:', err.message);
});
page.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error') {
    errors.push('console.error: ' + text);
    console.log('Console error:', text);
  }
});

console.log('Loading wrapper...');
await page.goto('file:///Users/dd/Sites/signature/image-api/test-opensea-wrapper.html', {
  waitUntil: 'domcontentloaded',
  timeout: 15000
});

// Wait for iframe to load
await new Promise(r => setTimeout(r, 4000));

// Check parent page
const iframeElement = await page.$('iframe');
console.log('Iframe found:', !!iframeElement);

// Access the frame
const frames = page.frames();
console.log('Frames count:', frames.length);

for (const frame of frames) {
  if (frame !== page.mainFrame()) {
    console.log('\n--- Checking child frame ---');
    try {
      const canvas = await frame.$('canvas');
      console.log('Canvas in iframe:', !!canvas);

      if (canvas) {
        const dims = await canvas.evaluate(c => ({ w: c.width, h: c.height }));
        console.log('Canvas dimensions:', dims);
      }

      const renderComplete = await frame.evaluate(() => window.RENDER_COMPLETE);
      console.log('RENDER_COMPLETE:', renderComplete);

      // Check for any global errors
      const errorMsg = await frame.evaluate(() => window.__renderError || null);
      console.log('Render error:', errorMsg);
    } catch (e) {
      console.log('Frame access error:', e.message);
    }
  }
}

console.log('\n--- Summary ---');
console.log('Total errors:', errors.length);
errors.forEach(e => console.log(' -', e));

await browser.close();
