import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, getContract } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import { PlaywrightRenderer } from './lib/renderer.js';
import { DiskCache } from './lib/cache.js';
import sharp from 'sharp';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Social share image dimensions (Open Graph / Twitter)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const A4_RATIO = 1200 / 1697; // ~0.707

const PORT = process.env.PORT || 3001;
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const CACHE_DIR = process.env.CACHE_DIR || './cache';
const RPC_URL = process.env.RPC_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const CHAIN = process.env.CHAIN || 'sepolia';

const LESS_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getSeed',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getTokenData',
    outputs: [{ name: 'windowId', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files (preview page)
app.use(express.static(join(__dirname, '../public')));

let renderer: PlaywrightRenderer;
let cache: DiskCache;

// Health check
app.get('/health', (req, res) => {
  const poolStats = renderer?.getPoolStats() || { total: 0, available: 0, inUse: 0 };
  const cacheStats = cache?.getStats() || { enabled: false, fileCount: 0, totalSize: 0 };

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    pool: poolStats,
    cache: cacheStats,
  });
});

// Main render endpoint
app.get('/api/render', async (req, res) => {
  const startTime = Date.now();

  try {
    const { seed, width, height, format } = req.query;

    // Validate seed
    if (!seed || typeof seed !== 'string') {
      return res.status(400).json({ error: 'Missing seed parameter' });
    }

    // Validate seed format (should be hex string)
    if (!/^0x[a-fA-F0-9]+$/.test(seed) && !/^[a-fA-F0-9]+$/.test(seed)) {
      return res.status(400).json({ error: 'Invalid seed format. Must be hex string.' });
    }

    const normalizedSeed = seed.startsWith('0x') ? seed : `0x${seed}`;
    const isOgFormat = format === 'og';
    const w = width ? parseInt(width as string, 10) : 1200;
    const h = height ? parseInt(height as string, 10) : 1697;

    // Validate dimensions
    if (w < 100 || w > 4000 || h < 100 || h > 4000) {
      return res.status(400).json({ error: 'Dimensions must be between 100 and 4000' });
    }

    // Check cache
    const cacheKey = isOgFormat ? `${normalizedSeed}-og` : normalizedSeed;
    const cacheW = isOgFormat ? OG_WIDTH : w;
    const cacheH = isOgFormat ? OG_HEIGHT : h;
    const cached = await cache.get(cacheKey, cacheW, cacheH);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('X-Cache', 'HIT');
      res.set('X-Render-Time', `${Date.now() - startTime}ms`);
      return res.send(cached);
    }

    // Render image
    const imageBuffer = await renderer.render({
      seed: normalizedSeed,
      width: w,
      height: h,
    });

    let finalBuffer = imageBuffer;

    // For OG format, composite artwork centered on a background-colored canvas
    if (isOgFormat) {
      // Get background color from top-left corner pixel
      const { data } = await sharp(imageBuffer)
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];

      // Calculate artwork dimensions to fit within OG canvas while maintaining A4 ratio
      let artworkWidth: number;
      let artworkHeight: number;
      if (OG_WIDTH / OG_HEIGHT > A4_RATIO) {
        artworkHeight = OG_HEIGHT;
        artworkWidth = Math.round(artworkHeight * A4_RATIO);
      } else {
        artworkWidth = OG_WIDTH;
        artworkHeight = Math.round(artworkWidth / A4_RATIO);
      }

      // Resize the rendered image to fit
      const resizedArtwork = await sharp(imageBuffer)
        .resize(artworkWidth, artworkHeight, { fit: 'fill' })
        .toBuffer();

      // Create OG canvas with background color and composite artwork centered
      const offsetX = Math.round((OG_WIDTH - artworkWidth) / 2);
      const offsetY = Math.round((OG_HEIGHT - artworkHeight) / 2);

      finalBuffer = await sharp({
        create: {
          width: OG_WIDTH,
          height: OG_HEIGHT,
          channels: 4,
          background: { r: bgR, g: bgG, b: bgB, alpha: 255 },
        },
      })
        .composite([{ input: resizedArtwork, left: offsetX, top: offsetY }])
        .png()
        .toBuffer();
    }

    // Cache result
    await cache.set(cacheKey, cacheW, cacheH, finalBuffer);

    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'MISS');
    res.set('X-Render-Time', `${Date.now() - startTime}ms`);
    res.send(finalBuffer);
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({
      error: 'Render failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Clear cache
app.post('/api/cache/clear', async (req, res) => {
  try {
    const cleared = await cache.clear();
    res.json({ success: true, cleared });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Calculate optimal grid dimensions for social media
function calculateGridDimensions(count: number) {
  if (count === 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  if (count <= 16) return { cols: 4, rows: 4 };
  if (count <= 20) return { cols: 5, rows: 4 };
  if (count <= 25) return { cols: 5, rows: 5 };
  if (count <= 30) return { cols: 6, rows: 5 };
  if (count <= 36) return { cols: 6, rows: 6 };
  // For larger counts, use a reasonable max
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

// Grid endpoint - generates a grid image from multiple token IDs
app.get('/api/grid', async (req, res) => {
  const startTime = Date.now();

  try {
    const { tokenIds, cellWidth, cellHeight } = req.query;

    if (!tokenIds || typeof tokenIds !== 'string') {
      return res.status(400).json({ error: 'Missing tokenIds parameter (comma-separated)' });
    }

    // Parse token IDs
    const ids = tokenIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
    
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid token IDs provided' });
    }

    // Parse cell dimensions (default to A4 ratio: 300x424)
    const cw = cellWidth ? parseInt(cellWidth as string, 10) : 300;
    const ch = cellHeight ? parseInt(cellHeight as string, 10) : 424;
    const gap = 0; // No gap between images
    const padding = 0; // No padding around edges

    // Calculate grid dimensions
    const { cols, rows } = calculateGridDimensions(ids.length);
    const gridWidth = cols * cw + (cols - 1) * gap + padding * 2;
    const gridHeight = rows * ch + (rows - 1) * gap + padding * 2;

    // Check cache
    const cacheKey = `grid-${ids.join('-')}-${cw}-${ch}`;
    const cached = await cache.get(cacheKey, gridWidth, gridHeight);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('X-Cache', 'HIT');
      res.set('X-Grid-Time', `${Date.now() - startTime}ms`);
      return res.send(cached);
    }

    // Fetch all images in parallel
    // Use internal rendering instead of HTTP requests for better performance
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Process images in batches to avoid OOM (limit concurrency to pool size)
    const BATCH_SIZE = 4;
    const imageBuffers: (Buffer | null)[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (tokenId) => {
          try {
            // Fetch tokenURI and render directly (faster than HTTP request)
            const tokenURI = await client.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: LESS_ABI,
              functionName: 'tokenURI',
              args: [BigInt(tokenId)],
            });

            if (!tokenURI) {
              return null;
            }

            // Parse tokenURI
            const jsonMatch = tokenURI.match(/^data:application\/json;base64,(.+)$/);
            if (!jsonMatch) {
              return null;
            }

            const metadata = JSON.parse(Buffer.from(jsonMatch[1], 'base64').toString('utf-8'));
            const animationUrl = metadata.animation_url;

            if (!animationUrl) {
              return null;
            }

            // Extract HTML
            const htmlMatch = animationUrl.match(/^data:text\/html;base64,(.+)$/);
            if (!htmlMatch) {
              return null;
            }

            const onChainHtml = Buffer.from(htmlMatch[1], 'base64').toString('utf-8');

            // Render image directly
            return await renderer.renderHtml({
              html: onChainHtml,
              width: cw,
              height: ch,
            });
          } catch (error) {
            console.warn(`Error rendering image for token ${tokenId}:`, error);
            return null;
          }
        })
      );
      imageBuffers.push(...batchResults);
    }

    // Filter out failed fetches
    const validImages = imageBuffers.filter((img): img is Buffer => img !== null);
    if (validImages.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch any images' });
    }

    // Create base image with black background
    const gridImage = sharp({
      create: {
        width: gridWidth,
        height: gridHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    });

    // Composite images onto grid
    const composites = [];
    let imageIndex = 0;

    for (let row = 0; row < rows && imageIndex < validImages.length; row++) {
      for (let col = 0; col < cols && imageIndex < validImages.length; col++) {
        const x = padding + col * (cw + gap);
        const y = padding + row * (ch + gap);

        // Resize image to fit cell dimensions (maintain aspect ratio, center crop)
        const resized = await sharp(validImages[imageIndex])
          .resize(cw, ch, {
            fit: 'cover',
            position: 'center',
          })
          .toBuffer();

        composites.push({
          input: resized,
          left: x,
          top: y,
        });

        imageIndex++;
      }
    }

    // Composite all images onto the grid
    const finalImage = await gridImage.composite(composites).png().toBuffer();

    // Cache result
    await cache.set(cacheKey, gridWidth, gridHeight, finalImage);

    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Cache', 'MISS');
    res.set('X-Grid-Time', `${Date.now() - startTime}ms`);
    res.send(finalImage);
  } catch (error) {
    console.error('Grid generation error:', error);
    res.set('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Grid generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Image by token ID endpoint (e.g., /images/1 or /images/1.png)
app.get('/images/:tokenId', async (req, res) => {
  const startTime = Date.now();

  try {
    // Check if RPC is configured
    if (!RPC_URL || !CONTRACT_ADDRESS) {
      return res.status(503).json({
        error: 'Service not configured',
        message: 'RPC_URL and CONTRACT_ADDRESS must be set',
      });
    }

    // Parse token ID (strip .png extension if present)
    const tokenIdParam = req.params.tokenId.replace(/\.png$/i, '');
    const tokenId = parseInt(tokenIdParam, 10);

    if (isNaN(tokenId) || tokenId < 1) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    // Check for social share format
    const format = req.query.format as string | undefined;
    const isOgFormat = format === 'og';

    // Parse optional dimensions (default to A4 ratio: 1200x1697)
    const width = req.query.width ? parseInt(req.query.width as string, 10) : 1200;
    const height = req.query.height ? parseInt(req.query.height as string, 10) : 1697;

    if (width < 100 || width > 4000 || height < 100 || height > 4000) {
      return res.status(400).json({ error: 'Dimensions must be between 100 and 4000' });
    }

    // Create viem client
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Fetch tokenURI from contract (contains animation_url with on-chain HTML)
    const tokenURI = await client.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: LESS_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });

    if (!tokenURI) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Parse tokenURI (data:application/json;base64,...)
    const jsonMatch = tokenURI.match(/^data:application\/json;base64,(.+)$/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid tokenURI format' });
    }

    const metadata = JSON.parse(Buffer.from(jsonMatch[1], 'base64').toString('utf-8'));
    const animationUrl = metadata.animation_url;

    if (!animationUrl) {
      return res.status(500).json({ error: 'No animation_url in metadata' });
    }

    // Extract HTML from animation_url (data:text/html;base64,...)
    const htmlMatch = animationUrl.match(/^data:text\/html;base64,(.+)$/);
    if (!htmlMatch) {
      return res.status(500).json({ error: 'Invalid animation_url format' });
    }

    const onChainHtml = Buffer.from(htmlMatch[1], 'base64').toString('utf-8');

    // Check cache using tokenId + dimensions + format
    const cacheKey = isOgFormat ? `token-${tokenId}-og` : `token-${tokenId}`;
    const cacheWidth = isOgFormat ? OG_WIDTH : width;
    const cacheHeight = isOgFormat ? OG_HEIGHT : height;
    const cached = await cache.get(cacheKey, cacheWidth, cacheHeight);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('X-Cache', 'HIT');
      res.set('X-Token-Id', tokenId.toString());
      res.set('X-Render-Time', `${Date.now() - startTime}ms`);
      return res.send(cached);
    }

    // Render image using the on-chain HTML directly
    const imageBuffer = await renderer.renderHtml({
      html: onChainHtml,
      width,
      height,
    });

    let finalBuffer = imageBuffer;

    // For OG format, composite artwork centered on a background-colored canvas
    if (isOgFormat) {
      // Get background color from top-left corner pixel (always background color)
      const { data } = await sharp(imageBuffer)
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];

      // Calculate artwork dimensions to fit within OG canvas while maintaining A4 ratio
      let artworkWidth: number;
      let artworkHeight: number;
      if (OG_WIDTH / OG_HEIGHT > A4_RATIO) {
        // OG canvas is wider than A4 - fit to height
        artworkHeight = OG_HEIGHT;
        artworkWidth = Math.round(artworkHeight * A4_RATIO);
      } else {
        // OG canvas is taller than A4 - fit to width
        artworkWidth = OG_WIDTH;
        artworkHeight = Math.round(artworkWidth / A4_RATIO);
      }

      // Resize the rendered image to fit
      const resizedArtwork = await sharp(imageBuffer)
        .resize(artworkWidth, artworkHeight, { fit: 'fill' })
        .toBuffer();

      // Create OG canvas with background color and composite artwork centered
      const offsetX = Math.round((OG_WIDTH - artworkWidth) / 2);
      const offsetY = Math.round((OG_HEIGHT - artworkHeight) / 2);

      finalBuffer = await sharp({
        create: {
          width: OG_WIDTH,
          height: OG_HEIGHT,
          channels: 4,
          background: { r: bgR, g: bgG, b: bgB, alpha: 255 },
        },
      })
        .composite([{ input: resizedArtwork, left: offsetX, top: offsetY }])
        .png()
        .toBuffer();
    }

    // Cache result
    await cache.set(cacheKey, cacheWidth, cacheHeight, finalBuffer);

    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'MISS');
    res.set('X-Token-Id', tokenId.toString());
    res.set('X-Render-Time', `${Date.now() - startTime}ms`);
    res.send(finalBuffer);
  } catch (error) {
    console.error('Image fetch error:', error);

    // Check for contract revert (token doesn't exist)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('revert') || errorMessage.includes('nonexistent')) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.status(500).json({
      error: 'Failed to generate image',
      message: errorMessage,
    });
  }
});

// Start server
async function start() {
  console.log('Starting Fold Image API...');

  // Initialize cache
  cache = new DiskCache(CACHE_DIR, CACHE_ENABLED);
  console.log(`Cache ${CACHE_ENABLED ? 'enabled' : 'disabled'} at ${CACHE_DIR}`);

  // Initialize renderer
  console.log('Initializing Playwright renderer...');
  renderer = new PlaywrightRenderer();
  await renderer.initialize();
  console.log('Playwright renderer initialized');

  // Bind to 0.0.0.0 for Fly.io
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on 0.0.0.0:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Render endpoint: http://localhost:${PORT}/api/render?seed=0x...`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await renderer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
