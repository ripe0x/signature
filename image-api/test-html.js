const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const html = fs.readFileSync('/tmp/test-animation.html', 'utf8');

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('Page error:', err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text());
    }
  });

  console.log('Setting content...');
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });

  // Wait a bit for JS to execute
  await new Promise(r => setTimeout(r, 2000));

  // Check if canvas exists
  const canvas = await page.$('canvas');
  console.log('Canvas found:', !!canvas);

  if (canvas) {
    const dims = await canvas.evaluate(c => ({ w: c.width, h: c.height }));
    console.log('Canvas dimensions:', dims);
  }

  // Check for RENDER_COMPLETE
  const renderComplete = await page.evaluate(() => window.RENDER_COMPLETE);
  console.log('RENDER_COMPLETE:', renderComplete);

  console.log('Errors count:', errors.length);

  await browser.close();
})();
