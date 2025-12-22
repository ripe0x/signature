import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const animationHtml = readFileSync('/Users/dd/Sites/signature/image-api/test-animation.html', 'utf8');

// Create a test file that embeds the animation in a sandboxed iframe
const base64Html = Buffer.from(animationHtml).toString('base64');

const wrapperHtml = `<!DOCTYPE html>
<html>
<head>
  <title>OpenSea Sandbox Simulation</title>
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'; report-uri /csp-report">
</head>
<body>
<h1>Testing sandboxed iframe with CSP</h1>
<iframe
  id="animation"
  sandbox="allow-scripts"
  style="width:800px;height:600px;border:1px solid black;"
  src="data:text/html;base64,${base64Html}"
></iframe>
</body>
</html>`;

writeFileSync('/Users/dd/Sites/signature/image-api/test-wrapper.html', wrapperHtml);

console.log('Launching browser...');
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
  // Log CSP violations
  if (text.includes('Content Security Policy')) {
    console.log('CSP:', text);
  }
});

console.log('Loading wrapper with sandboxed iframe...');
await page.goto('file:///Users/dd/Sites/signature/image-api/test-wrapper.html', { waitUntil: 'domcontentloaded', timeout: 10000 });

// Wait for iframe to load
await new Promise(r => setTimeout(r, 3000));

// Check parent page
const iframeElement = await page.$('iframe');
console.log('Iframe found:', !!iframeElement);

// Access the frame
const frames = page.frames();
console.log('Frames count:', frames.length);

for (const frame of frames) {
  if (frame !== page.mainFrame()) {
    console.log('Checking child frame...');
    try {
      const canvas = await frame.$('canvas');
      console.log('Canvas in iframe:', !!canvas);

      if (canvas) {
        const dims = await canvas.evaluate(c => ({ w: c.width, h: c.height }));
        console.log('Canvas dimensions:', dims);
      }

      const renderComplete = await frame.evaluate(() => window.RENDER_COMPLETE);
      console.log('RENDER_COMPLETE:', renderComplete);
    } catch (e) {
      console.log('Frame access error:', e.message);
    }
  }
}

console.log('\nTotal errors:', errors.length);
errors.forEach(e => console.log(' -', e));

await browser.close();
