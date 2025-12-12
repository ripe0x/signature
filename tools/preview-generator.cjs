#!/usr/bin/env node

/**
 * Preview Generator for Less NFT
 *
 * This tool generates preview HTML files from mock token data
 * so you can view the artwork in a browser without deploying contracts.
 *
 * Usage:
 *   node tools/preview-generator.js [numTokens] [outputDir]
 *
 * Example:
 *   node tools/preview-generator.js 10 ./previews
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const numTokens = parseInt(process.argv[2]) || 10;
const outputDir = process.argv[3] || './previews';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Generate a deterministic seed similar to the contract
 */
function generateSeed(foldId, tokenId, blockHash, startTime) {
    const data = Buffer.concat([
        Buffer.from(blockHash.replace('0x', ''), 'hex'),
        Buffer.from(foldId.toString(16).padStart(64, '0'), 'hex'),
        Buffer.from(tokenId.toString(16).padStart(64, '0'), 'hex'),
        Buffer.from(startTime.toString(16).padStart(64, '0'), 'hex')
    ]);
    return '0x' + crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate mock fold data with random fold count (1-100)
 */
function generateFoldData(foldId, tokenId) {
    const startTime = Math.floor(Date.now() / 1000) - (foldId - 1) * 1800; // 30 min apart
    const endTime = startTime + 1800;
    const strategyBlock = 18000000 + foldId * 100 + tokenId;
    // Use tokenId to seed the random fold count so each token is different but deterministic
    const blockHash = '0x' + crypto.createHash('sha256').update(`block-${foldId}-${tokenId}-${Date.now()}`).digest('hex');
    // Random fold count between 1-100, seeded by tokenId for variety
    const foldCount = 1 + (Math.abs(parseInt(blockHash.slice(2, 10), 16)) % 100);

    return {
        foldId,
        foldCount,
        startTime,
        endTime,
        strategyBlock,
        blockHash
    };
}

/**
 * Convert ES module script to plain script by removing export keywords
 */
function stripESModuleExports(script) {
    return script
        // Remove "export " from "export const", "export function", "export class", etc.
        .replace(/^export\s+/gm, '')
        // Remove "export default"
        .replace(/^export\s+default\s+/gm, '')
        // Remove export blocks like "export { foo, bar }"
        .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

/**
 * Build the HTML for a token
 * This mirrors what LessRenderer does but lets us inject the actual fold-core.js
 */
function buildTokenHTML(tokenId, seed, foldData) {
    // Try to load the actual fold-core.js if it exists
    let foldScript = '';
    const foldCorePath = path.join(__dirname, '../web/fold-core.js');

    if (fs.existsSync(foldCorePath)) {
        let rawScript = fs.readFileSync(foldCorePath, 'utf8');
        // Strip ES module exports so it works as a plain script
        foldScript = stripESModuleExports(rawScript);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>less #${tokenId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        canvas {
            max-width: 100vw;
            max-height: 100vh;
            width: auto;
            height: auto;
            object-fit: contain;
        }
        #info {
            position: fixed;
            bottom: 10px;
            left: 10px;
            color: #444;
            font-family: monospace;
            font-size: 11px;
            z-index: 1000;
        }
    </style>
    <script>
        // Convert hex seed to number for fold-core.js (uses first 12 hex chars for safe integer)
        window.SEED = parseInt("${seed}".slice(2, 14), 16);
        window.FOLD_COUNT = ${foldData.foldCount};
        // Additional metadata for the contract
        window.LESS_TOKEN_ID = ${tokenId};
        window.LESS_SEED = "${seed}";
        window.LESS_FOLD_ID = ${foldData.foldId};
        window.LESS_FOLD_COUNT = ${foldData.foldCount};
        window.LESS_STRATEGY_BLOCK = ${foldData.strategyBlock};
    </script>
</head>
<body>
    <canvas id="c"></canvas>
    <div id="info">
        Token #${tokenId} | Folds: ${foldData.foldCount} | Seed: ${seed.slice(0, 18)}...
    </div>
    ${foldScript ? `<script>${foldScript}</script>` : getFallbackVisualization()}
</body>
</html>`;

    return html;
}

/**
 * Fallback visualization if fold-core.js isn't available
 */
function getFallbackVisualization() {
    return `
    <canvas id="c"></canvas>
    <script>
        const c = document.getElementById('c');
        c.width = window.innerWidth;
        c.height = window.innerHeight;
        const ctx = c.getContext('2d');

        // Parse seed for randomness
        const seed = window.LESS_SEED;
        let s = parseInt(seed.slice(2, 10), 16);
        const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

        // Use fold ID to influence the visualization
        const foldId = window.LESS_FOLD_ID || 1;
        const numFolds = 3 + foldId * 2; // More folds = more lines

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;

        // Draw fold lines
        const lines = [];
        for (let i = 0; i < numFolds; i++) {
            const angle = rand() * Math.PI;
            const cx = rand() * c.width;
            const cy = rand() * c.height;

            const len = Math.max(c.width, c.height);
            const x1 = cx - Math.cos(angle) * len;
            const y1 = cy - Math.sin(angle) * len;
            const x2 = cx + Math.cos(angle) * len;
            const y2 = cy + Math.sin(angle) * len;

            lines.push({x1, y1, x2, y2});

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Draw intersection points
        ctx.fillStyle = '#fff';
        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const intersection = getIntersection(lines[i], lines[j]);
                if (intersection &&
                    intersection.x > 0 && intersection.x < c.width &&
                    intersection.y > 0 && intersection.y < c.height) {
                    ctx.beginPath();
                    ctx.arc(intersection.x, intersection.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        function getIntersection(l1, l2) {
            const denom = (l1.x1 - l1.x2) * (l2.y1 - l2.y2) - (l1.y1 - l1.y2) * (l2.x1 - l2.x2);
            if (Math.abs(denom) < 0.0001) return null;

            const t = ((l1.x1 - l2.x1) * (l2.y1 - l2.y2) - (l1.y1 - l2.y1) * (l2.x1 - l2.x2)) / denom;

            return {
                x: l1.x1 + t * (l1.x2 - l1.x1),
                y: l1.y1 + t * (l1.y2 - l1.y1)
            };
        }
    </script>`;
}

/**
 * Build JSON metadata for a token
 */
function buildTokenMetadata(tokenId, seed, foldData, htmlBase64) {
    return {
        name: `less #${tokenId}`,
        description: "less is a generative art collection tied to a recursive strategy token. Each token represents a fold event - a moment when the strategy bought and burned its own supply. The visual is generated by simulating paper folding, drawing only where fold lines intersect.",
        image: `https://less.art/images/${tokenId}.png`,
        animation_url: `data:text/html;base64,${htmlBase64}`,
        attributes: [
            { trait_type: "Fold ID", value: foldData.foldId },
            { trait_type: "Seed", value: seed },
            { trait_type: "Strategy Block", value: foldData.strategyBlock },
            { trait_type: "Window Start", display_type: "date", value: foldData.startTime },
            { trait_type: "Window End", display_type: "date", value: foldData.endTime }
        ]
    };
}

// Generate previews
console.log(`Generating ${numTokens} preview tokens...`);
console.log(`Output directory: ${outputDir}`);
console.log('');

const index = [];

for (let i = 1; i <= numTokens; i++) {
    // Each token gets its own fold event
    const foldId = i;
    const foldData = generateFoldData(foldId, i);
    const seed = generateSeed(foldId, i, foldData.blockHash, foldData.startTime);

    // Build HTML
    const html = buildTokenHTML(i, seed, foldData);
    const htmlBase64 = Buffer.from(html).toString('base64');

    // Build metadata
    const metadata = buildTokenMetadata(i, seed, foldData, htmlBase64);
    const metadataBase64 = Buffer.from(JSON.stringify(metadata, null, 2)).toString('base64');

    // Save HTML file
    const htmlPath = path.join(outputDir, `token-${i}.html`);
    fs.writeFileSync(htmlPath, html);

    // Save metadata JSON
    const jsonPath = path.join(outputDir, `token-${i}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

    // Save tokenURI (as contract would return it)
    const uriPath = path.join(outputDir, `token-${i}.uri.txt`);
    fs.writeFileSync(uriPath, `data:application/json;base64,${metadataBase64}`);

    index.push({
        tokenId: i,
        foldCount: foldData.foldCount,
        seed: seed.slice(0, 18) + '...',
        htmlFile: `token-${i}.html`
    });

    console.log(`Token #${i} (${foldData.foldCount} folds): ${seed.slice(0, 18)}...`);
}

// Generate index HTML
const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Less NFT Previews</title>
    <style>
        body { font-family: monospace; background: #111; color: #fff; padding: 20px; }
        h1 { margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #222; border-radius: 8px; overflow: hidden; }
        .card iframe { width: 100%; height: 200px; border: none; }
        .card-info { padding: 10px; font-size: 12px; }
        .card-info a { color: #0af; }
        .seed { color: #666; word-break: break-all; }
    </style>
</head>
<body>
    <h1>Less NFT Previews</h1>
    <p style="color:#666;margin-bottom:20px;">Generated ${numTokens} tokens with varying fold counts (1-100)</p>
    <div class="grid">
        ${index.map(t => `
        <div class="card">
            <iframe src="${t.htmlFile}"></iframe>
            <div class="card-info">
                <strong><a href="${t.htmlFile}" target="_blank">Token #${t.tokenId}</a></strong> | ${t.foldCount} folds<br>
                <span class="seed">${t.seed}</span>
            </div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;

fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

console.log('');
console.log(`Done! Open ${outputDir}/index.html to view all previews.`);
console.log(`Or open individual token files like ${outputDir}/token-1.html`);
