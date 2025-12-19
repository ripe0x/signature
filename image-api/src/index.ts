import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, getContract } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import { PlaywrightRenderer } from './lib/renderer.js';
import { DiskCache } from './lib/cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const app = express();
app.use(express.json());

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
    const { seed, width, height } = req.query;

    // Validate seed
    if (!seed || typeof seed !== 'string') {
      return res.status(400).json({ error: 'Missing seed parameter' });
    }

    // Validate seed format (should be hex string)
    if (!/^0x[a-fA-F0-9]+$/.test(seed) && !/^[a-fA-F0-9]+$/.test(seed)) {
      return res.status(400).json({ error: 'Invalid seed format. Must be hex string.' });
    }

    const normalizedSeed = seed.startsWith('0x') ? seed : `0x${seed}`;
    const w = width ? parseInt(width as string, 10) : 1200;
    const h = height ? parseInt(height as string, 10) : 1200;

    // Validate dimensions
    if (w < 100 || w > 2000 || h < 100 || h > 2000) {
      return res.status(400).json({ error: 'Dimensions must be between 100 and 2000' });
    }

    // Check cache
    const cached = await cache.get(normalizedSeed, w, h);
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

    // Cache result
    await cache.set(normalizedSeed, w, h, imageBuffer);

    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'MISS');
    res.set('X-Render-Time', `${Date.now() - startTime}ms`);
    res.send(imageBuffer);
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

    // Parse optional dimensions
    const width = req.query.width ? parseInt(req.query.width as string, 10) : 1200;
    const height = req.query.height ? parseInt(req.query.height as string, 10) : 1200;

    if (width < 100 || width > 2000 || height < 100 || height > 2000) {
      return res.status(400).json({ error: 'Dimensions must be between 100 and 2000' });
    }

    // Create viem client
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Fetch seed from contract
    const seed = await client.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: LESS_ABI,
      functionName: 'getSeed',
      args: [BigInt(tokenId)],
    });

    if (!seed || seed === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return res.status(404).json({ error: 'Token not found or has no seed' });
    }

    // Check cache using seed
    const cached = await cache.get(seed, width, height);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('X-Cache', 'HIT');
      res.set('X-Token-Id', tokenId.toString());
      res.set('X-Seed', seed);
      res.set('X-Render-Time', `${Date.now() - startTime}ms`);
      return res.send(cached);
    }

    // Render image
    const imageBuffer = await renderer.render({
      seed,
      width,
      height,
    });

    // Cache result
    await cache.set(seed, width, height, imageBuffer);

    res.set('Content-Type', 'image/png');
    res.set('X-Cache', 'MISS');
    res.set('X-Token-Id', tokenId.toString());
    res.set('X-Seed', seed);
    res.set('X-Render-Time', `${Date.now() - startTime}ms`);
    res.send(imageBuffer);
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
