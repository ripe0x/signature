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
import { readFileSync, existsSync } from 'fs';

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

// Leaderboard data file - use persistent storage on fly.dev, fallback to local
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../data');
const LEADERBOARD_FILE = join(DATA_DIR, 'leaderboard.json');

// Event topic hashes for window events
const WINDOW_CREATED_TOPIC = '0xe06ce442afd483033ce0a251188ca4c4d1c81a74bf69c6d3699cede668afda47';
const WINDOW_0_STARTED_TOPIC = '0xcd075a155ea16f406de513a02424429933bc404c9ce85800b7700c185e54df9c';

// Admin address for protected endpoints
const ADMIN_ADDRESS = '0xCB43078C32423F5348Cab5885911C3B5faE217F9'.toLowerCase();

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
    inputs: [],
    name: 'windowCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
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

// Leaderboard endpoint - serves cached collector data
app.get('/api/leaderboard', (req, res) => {
  try {
    if (!existsSync(LEADERBOARD_FILE)) {
      return res.status(503).json({
        error: 'Leaderboard data not available',
        message: 'Run the indexer script to generate collector data',
      });
    }

    const data = readFileSync(LEADERBOARD_FILE, 'utf-8');
    const leaderboard = JSON.parse(data);

    res.set('Cache-Control', 'public, max-age=300');
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Windows endpoint - serves window timestamps
app.get('/api/windows', (req, res) => {
  try {
    if (!existsSync(LEADERBOARD_FILE)) {
      return res.status(503).json({
        error: 'Window data not available',
        message: 'Run the indexer to generate data',
      });
    }

    const data = readFileSync(LEADERBOARD_FILE, 'utf-8');
    const leaderboard = JSON.parse(data);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      totalWindows: leaderboard.totalWindows,
      windows: leaderboard.windowTimestamps || [],
      generatedAt: leaderboard.generatedAt,
    });
  } catch (error) {
    console.error('Windows fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch windows',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Single collector endpoint
app.get('/api/collector/:address', (req, res) => {
  try {
    if (!existsSync(LEADERBOARD_FILE)) {
      return res.status(503).json({
        error: 'Leaderboard data not available',
        message: 'Run the indexer script to generate collector data',
      });
    }

    const address = req.params.address.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    const data = readFileSync(LEADERBOARD_FILE, 'utf-8');
    const leaderboard = JSON.parse(data);

    const collector = leaderboard.collectors.find(
      (c: any) => c.address.toLowerCase() === address
    );

    if (!collector) {
      return res.status(404).json({ error: 'Collector not found' });
    }

    const rank = leaderboard.collectors.findIndex(
      (c: any) => c.address.toLowerCase() === address
    ) + 1;

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      ...collector,
      rank,
      totalWindows: leaderboard.totalWindows,
      generatedAt: leaderboard.generatedAt,
    });
  } catch (error) {
    console.error('Collector fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch collector',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
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

// Index collectors endpoint - runs the collector indexer
// Protected by admin address check
let isIndexingInProgress = false;
let lastIndexResult: {
  success: boolean;
  totalTokens?: number;
  totalCollectors?: number;
  fullCollectors?: number;
  duration?: number;
  error?: string;
  completedAt?: string;
} | null = null;

app.post('/api/admin/index-collectors', async (req, res) => {
  try {
    // Validate admin address
    const { address } = req.body;
    if (!address || address.toLowerCase() !== ADMIN_ADDRESS) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Prevent concurrent indexing
    if (isIndexingInProgress) {
      return res.status(409).json({ error: 'Indexing already in progress' });
    }

    isIndexingInProgress = true;
    const startTime = Date.now();

    // Create viem client
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Get total supply and window count
    const [totalSupply, windowCount] = await Promise.all([
      client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: LESS_ABI,
        functionName: 'totalSupply',
      }),
      client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: LESS_ABI,
        functionName: 'windowCount',
      }),
    ]);

    const total = Number(totalSupply);
    const windows = Number(windowCount) + 1; // +1 to include Window 0

    // Fetch window timestamps from events
    const windowTimestamps: { windowId: number; startTime: number; endTime: number }[] = [];

    // Fetch Window0Started event
    const window0Logs = await client.getLogs({
      address: CONTRACT_ADDRESS as `0x${string}`,
      event: {
        type: 'event',
        name: 'Window0Started',
        inputs: [
          { name: 'startTime', type: 'uint64', indexed: false },
          { name: 'endTime', type: 'uint64', indexed: false },
        ],
      },
      fromBlock: 0n,
      toBlock: 'latest',
    });

    if (window0Logs.length > 0) {
      const log = window0Logs[0];
      windowTimestamps.push({
        windowId: 0,
        startTime: Number(log.args.startTime),
        endTime: Number(log.args.endTime),
      });
    }

    // Fetch WindowCreated events (windows 1+)
    const windowCreatedLogs = await client.getLogs({
      address: CONTRACT_ADDRESS as `0x${string}`,
      event: {
        type: 'event',
        name: 'WindowCreated',
        inputs: [
          { name: 'windowId', type: 'uint256', indexed: true },
          { name: 'startTime', type: 'uint64', indexed: false },
          { name: 'endTime', type: 'uint64', indexed: false },
        ],
      },
      fromBlock: 0n,
      toBlock: 'latest',
    });

    for (const log of windowCreatedLogs) {
      windowTimestamps.push({
        windowId: Number(log.args.windowId),
        startTime: Number(log.args.startTime),
        endTime: Number(log.args.endTime),
      });
    }

    // Sort by windowId
    windowTimestamps.sort((a, b) => a.windowId - b.windowId);

    if (total === 0) {
      isIndexingInProgress = false;
      lastIndexResult = { success: true, totalTokens: 0, totalCollectors: 0, fullCollectors: 0, duration: Date.now() - startTime, completedAt: new Date().toISOString() };
      return res.json({ message: 'No tokens minted yet', ...lastIndexResult });
    }

    // Fetch all token data in batches
    const BATCH_SIZE = 100;
    const tokenData: { tokenId: number; owner: string; windowId: number; seed: string }[] = [];

    for (let start = 1; start <= total; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, total);
      const tokenIds: number[] = [];
      for (let i = start; i <= end; i++) {
        tokenIds.push(i);
      }

      // Batch fetch owner, windowId, and seed for each token
      const calls = tokenIds.flatMap(tokenId => [
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: LESS_ABI,
          functionName: 'ownerOf' as const,
          args: [BigInt(tokenId)],
        },
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: LESS_ABI,
          functionName: 'getTokenData' as const,
          args: [BigInt(tokenId)],
        },
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: LESS_ABI,
          functionName: 'getSeed' as const,
          args: [BigInt(tokenId)],
        },
      ]);

      const results = await client.multicall({ contracts: calls });

      // Process results (3 results per token: owner, windowId, seed)
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        const ownerResult = results[i * 3];
        const windowResult = results[i * 3 + 1];
        const seedResult = results[i * 3 + 2];

        if (ownerResult.status === 'success' && windowResult.status === 'success' && seedResult.status === 'success') {
          tokenData.push({
            tokenId,
            owner: (ownerResult.result as string).toLowerCase(),
            windowId: Number(windowResult.result),
            seed: seedResult.result as string,
          });
        }
      }
    }

    // Group by collector
    const collectorMap = new Map<string, { address: string; tokens: { tokenId: number; windowId: number; seed: string }[]; windowsSet: Set<number> }>();

    for (const token of tokenData) {
      const existing = collectorMap.get(token.owner) || {
        address: token.owner,
        tokens: [],
        windowsSet: new Set<number>(),
      };

      existing.tokens.push({
        tokenId: token.tokenId,
        windowId: token.windowId,
        seed: token.seed,
      });
      existing.windowsSet.add(token.windowId);

      collectorMap.set(token.owner, existing);
    }

    // Convert to array and calculate stats
    const collectors = Array.from(collectorMap.values()).map(c => ({
      address: c.address,
      tokenCount: c.tokens.length,
      windowsCollected: Array.from(c.windowsSet).sort((a, b) => a - b),
      windowCount: c.windowsSet.size,
      isFullCollector: c.windowsSet.size === windows,
      tokens: c.tokens.sort((a, b) => a.tokenId - b.tokenId),
    }));

    // Sort by token count descending, then by window count
    collectors.sort((a, b) => {
      if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
      return b.windowCount - a.windowCount;
    });

    // Build final leaderboard object
    const leaderboard = {
      totalWindows: windows,
      totalTokens: total,
      totalCollectors: collectors.length,
      fullCollectors: collectors.filter(c => c.isFullCollector).map(c => c.address),
      collectors,
      windowTimestamps,
      generatedAt: Date.now(),
      generatedAtISO: new Date().toISOString(),
    };

    // Ensure data directory exists
    const { mkdirSync } = await import('fs');
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Write to file
    const { writeFileSync } = await import('fs');
    writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));

    const duration = Date.now() - startTime;
    lastIndexResult = {
      success: true,
      totalTokens: total,
      totalCollectors: collectors.length,
      fullCollectors: leaderboard.fullCollectors.length,
      duration,
      completedAt: new Date().toISOString(),
    };
    isIndexingInProgress = false;

    res.json(lastIndexResult);
  } catch (error) {
    isIndexingInProgress = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    lastIndexResult = { success: false, error: errorMessage, completedAt: new Date().toISOString() };
    console.error('Indexer error:', error);
    res.status(500).json({
      error: 'Indexing failed',
      message: errorMessage,
    });
  }
});

// Get indexer status
app.get('/api/admin/index-status', (req, res) => {
  res.json({
    isIndexing: isIndexingInProgress,
    lastResult: lastIndexResult,
  });
});

// Calculate optimal grid dimensions for social media
// Minimizes empty cells while preferring reasonable aspect ratios (not too wide or tall)
function calculateGridDimensions(count: number) {
  if (count <= 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };

  let best = { cols: count, rows: 1, score: Infinity };

  // Try all possible row counts
  const maxRows = count;

  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(count / rows);
    if (cols < rows) break; // Only consider landscape or square (cols >= rows)

    const waste = (cols * rows) - count;
    const ratio = cols / rows;

    // Ideal ratio is around 1.5-2 (mild landscape). Penalize extremes.
    // Single row (ratio=10) or near-square with lots of waste are both bad.
    const idealRatio = 1.5;
    const ratioPenalty = Math.abs(ratio - idealRatio) * 2;
    const wastePenalty = waste * 1.5;
    const score = wastePenalty + ratioPenalty;

    if (score < best.score) {
      best = { cols, rows, score };
    }
  }

  return { cols: best.cols, rows: best.rows };
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

    // Recalculate grid dimensions based on actually rendered images (not requested count)
    // This prevents black cells when some images fail to render
    const actualCount = validImages.length;
    const actualDimensions = calculateGridDimensions(actualCount);
    const actualCols = actualDimensions.cols;
    const actualRows = actualDimensions.rows;
    const actualGridWidth = actualCols * cw + (actualCols - 1) * gap + padding * 2;
    const actualGridHeight = actualRows * ch + (actualRows - 1) * gap + padding * 2;

    // Create base image with black background
    const gridImage = sharp({
      create: {
        width: actualGridWidth,
        height: actualGridHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    });

    // Composite images onto grid
    const composites = [];
    let imageIndex = 0;

    for (let row = 0; row < actualRows && imageIndex < validImages.length; row++) {
      for (let col = 0; col < actualCols && imageIndex < validImages.length; col++) {
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

    // Cache result (use actual dimensions since grid may be smaller due to failed renders)
    await cache.set(cacheKey, actualGridWidth, actualGridHeight, finalImage);

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

// Collector grid endpoint - generates a grid of a collector's owned pieces
// Left 1/3: black panel with collector label and ENS/address
// Right 2/3: token grid preserving A4 ratio
app.get('/api/collector-grid/:address', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate address
    const address = req.params.address.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Load leaderboard data
    if (!existsSync(LEADERBOARD_FILE)) {
      return res.status(503).json({
        error: 'Leaderboard data not available',
        message: 'Run the indexer script to generate collector data',
      });
    }

    const data = readFileSync(LEADERBOARD_FILE, 'utf-8');
    const leaderboard = JSON.parse(data);

    // Find collector
    const collector = leaderboard.collectors.find(
      (c: any) => c.address.toLowerCase() === address
    );

    if (!collector || !collector.tokens || collector.tokens.length === 0) {
      return res.status(404).json({ error: 'Collector not found or has no tokens' });
    }

    const tokenCount = collector.tokens.length;
    const windowCount = collector.windowsCollected?.length || 0;
    const totalWindows = leaderboard.totalWindows || 18;
    const rank = leaderboard.collectors.indexOf(collector) + 1;

    // Twitter card dimensions
    const CANVAS_WIDTH = 1200;
    const CANVAS_HEIGHT = 675;

    // Layout: left 1/3 for info panel, right 2/3 for grid
    const INFO_PANEL_WIDTH = Math.floor(CANVAS_WIDTH / 3);
    const GRID_WIDTH = CANVAS_WIDTH - INFO_PANEL_WIDTH;

    // Check cache
    const cacheKey = `collector-grid-v9-${address}-${tokenCount}-${windowCount}-${rank}`;
    const cached = await cache.get(cacheKey, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('X-Cache', 'HIT');
      res.set('X-Grid-Time', `${Date.now() - startTime}ms`);
      res.set('X-Token-Count', tokenCount.toString());
      return res.send(cached);
    }

    // Create viem client
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Try to resolve ENS name
    let displayName: string;
    try {
      const ensName = await client.getEnsName({ address: address as `0x${string}` });
      displayName = ensName || `${address.slice(0, 6)}...${address.slice(-4)}`;
    } catch {
      displayName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    // Calculate optimal grid dimensions (matches twitter-bot approach)
    function getGridDimensions(count: number) {
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
      if (count <= 42) return { cols: 7, rows: 6 };
      if (count <= 49) return { cols: 7, rows: 7 };
      if (count <= 56) return { cols: 8, rows: 7 };
      if (count <= 64) return { cols: 8, rows: 8 };
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      return { cols, rows };
    }

    const { cols, rows } = getGridDimensions(tokenCount);

    // Calculate cell dimensions to fill the grid area completely (no margins)
    // Cells maintain A4 ratio
    const cellWidthByWidth = Math.floor(GRID_WIDTH / cols);
    const cellHeightByHeight = Math.floor(CANVAS_HEIGHT / rows);
    // Determine which dimension is the constraint
    const cellHeightFromWidth = Math.floor(cellWidthByWidth / A4_RATIO);
    const cellWidthFromHeight = Math.floor(cellHeightByHeight * A4_RATIO);

    let cellWidth: number;
    let cellHeight: number;
    if (cellHeightFromWidth <= cellHeightByHeight) {
      // Width is the constraint
      cellWidth = cellWidthByWidth;
      cellHeight = cellHeightFromWidth;
    } else {
      // Height is the constraint
      cellWidth = cellWidthFromHeight;
      cellHeight = cellHeightByHeight;
    }

    const grid = { cols, rows, cellWidth, cellHeight };

    // Render function for a single token
    async function renderToken(tokenId: number, width: number, height: number): Promise<Buffer | null> {
      try {
        const tokenURI = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: LESS_ABI,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        });

        if (!tokenURI) return null;

        const jsonMatch = tokenURI.match(/^data:application\/json;base64,(.+)$/);
        if (!jsonMatch) return null;

        const metadata = JSON.parse(Buffer.from(jsonMatch[1], 'base64').toString('utf-8'));
        const animationUrl = metadata.animation_url;
        if (!animationUrl) return null;

        const htmlMatch = animationUrl.match(/^data:text\/html;base64,(.+)$/);
        if (!htmlMatch) return null;

        const onChainHtml = Buffer.from(htmlMatch[1], 'base64').toString('utf-8');

        return await renderer.renderHtml({
          html: onChainHtml,
          width,
          height,
        });
      } catch (error) {
        console.warn(`Error rendering token ${tokenId}:`, error);
        return null;
      }
    }

    // Render all tokens in batches
    const BATCH_SIZE = 4;
    const tokenImages: { tokenId: number; buffer: Buffer }[] = [];

    for (let i = 0; i < collector.tokens.length; i += BATCH_SIZE) {
      const batch = collector.tokens.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (token: any) => {
          const buffer = await renderToken(token.tokenId, grid.cellWidth, grid.cellHeight);
          return buffer ? { tokenId: token.tokenId, buffer } : null;
        })
      );
      tokenImages.push(...results.filter((r): r is { tokenId: number; buffer: Buffer } => r !== null));
    }

    if (tokenImages.length === 0) {
      return res.status(500).json({ error: 'Failed to render any tokens' });
    }

    // Build composite array
    const composites: { input: Buffer; left: number; top: number }[] = [];

    // Calculate grid positioning - align to top-right (right edge flush with canvas edge)
    const gridTotalWidth = grid.cols * grid.cellWidth;
    const gridOffsetX = CANVAS_WIDTH - gridTotalWidth;
    const gridOffsetY = 0; // No top margin - align to top

    // Position tokens in grid
    for (let i = 0; i < tokenImages.length; i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gridOffsetX + col * grid.cellWidth;
      const y = gridOffsetY + row * grid.cellHeight;

      // Resize to exact cell dimensions (already rendered at correct ratio)
      const resized = await sharp(tokenImages[i].buffer)
        .resize(grid.cellWidth, grid.cellHeight, { fit: 'fill' })
        .toBuffer();

      composites.push({ input: resized, left: x, top: y });
    }

    // Create info panel using Playwright (to use system fonts properly)
    const PANEL_PADDING = 40;
    const infoPanelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: ${INFO_PANEL_WIDTH}px;
            height: ${CANVAS_HEIGHT}px;
            background: black;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding-left: ${PANEL_PADDING}px;
            font-family: 'IBM Plex Mono', 'Courier New', monospace;
          }
          .label {
            font-size: 14px;
            font-weight: 400;
            color: #666666;
            letter-spacing: 0.15em;
            margin-bottom: 12px;
          }
          .name {
            font-size: 32px;
            font-weight: 500;
            color: white;
            margin-bottom: 32px;
          }
          .stats {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .stat {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .stat-label {
            font-size: 11px;
            font-weight: 400;
            color: #666666;
            letter-spacing: 0.15em;
          }
          .stat-value {
            font-size: 24px;
            font-weight: 500;
            color: white;
          }
        </style>
      </head>
      <body>
        <div class="label">COLLECTOR</div>
        <div class="name">${displayName}</div>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">RANK</div>
            <div class="stat-value">#${rank}</div>
          </div>
          <div class="stat">
            <div class="stat-label">TOKENS</div>
            <div class="stat-value">${tokenCount}</div>
          </div>
          <div class="stat">
            <div class="stat-label">WINDOWS</div>
            <div class="stat-value">${windowCount}/${totalWindows}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const infoPanelBuffer = await renderer.renderHtml({
      html: infoPanelHtml,
      width: INFO_PANEL_WIDTH,
      height: CANVAS_HEIGHT,
    });

    composites.unshift({ input: infoPanelBuffer, left: 0, top: 0 });

    // Create final canvas and composite all images
    const finalImage = await sharp({
      create: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    // Cache result
    await cache.set(cacheKey, CANVAS_WIDTH, CANVAS_HEIGHT, finalImage);

    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Cache', 'MISS');
    res.set('X-Grid-Time', `${Date.now() - startTime}ms`);
    res.set('X-Token-Count', tokenCount.toString());
    res.send(finalImage);
  } catch (error) {
    console.error('Collector grid error:', error);
    res.status(500).json({
      error: 'Collector grid generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Collector profile Twitter card - generates an OG image for collector profiles
// Shows a grid of tokens with collector stats overlay
app.get('/api/collector-card/:address', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate address
    const address = req.params.address.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Load leaderboard data
    if (!existsSync(LEADERBOARD_FILE)) {
      return res.status(503).json({
        error: 'Leaderboard data not available',
        message: 'Run the indexer script to generate collector data',
      });
    }

    const data = readFileSync(LEADERBOARD_FILE, 'utf-8');
    const leaderboard = JSON.parse(data);

    // Find collector
    const collectorIndex = leaderboard.collectors.findIndex(
      (c: any) => c.address.toLowerCase() === address
    );

    if (collectorIndex === -1) {
      return res.status(404).json({ error: 'Collector not found' });
    }

    const collector = leaderboard.collectors[collectorIndex];
    const rank = collectorIndex + 1;

    if (!collector.tokens || collector.tokens.length === 0) {
      return res.status(404).json({ error: 'Collector has no tokens' });
    }

    // Twitter card dimensions (16:9 ratio for summary_large_image)
    const CANVAS_WIDTH = 1200;
    const CANVAS_HEIGHT = 630;

    // Check cache
    const cacheKey = `collector-card-${address}-${collector.tokenCount}`;
    const cached = await cache.get(cacheKey, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('X-Cache', 'HIT');
      res.set('X-Render-Time', `${Date.now() - startTime}ms`);
      return res.send(cached);
    }

    // Create viem client for fetching token data
    const chain = CHAIN === 'mainnet' ? mainnet : sepolia;
    const client = createPublicClient({
      chain,
      transport: http(RPC_URL),
    });

    // Render function for a single token
    async function renderToken(tokenId: number, size: number): Promise<Buffer | null> {
      try {
        const tokenURI = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: LESS_ABI,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        });

        if (!tokenURI) return null;

        const jsonMatch = tokenURI.match(/^data:application\/json;base64,(.+)$/);
        if (!jsonMatch) return null;

        const metadata = JSON.parse(Buffer.from(jsonMatch[1], 'base64').toString('utf-8'));
        const animationUrl = metadata.animation_url;
        if (!animationUrl) return null;

        const htmlMatch = animationUrl.match(/^data:text\/html;base64,(.+)$/);
        if (!htmlMatch) return null;

        const onChainHtml = Buffer.from(htmlMatch[1], 'base64').toString('utf-8');

        // Render at A4 ratio for the cell
        const renderHeight = Math.round(size / A4_RATIO);
        return await renderer.renderHtml({
          html: onChainHtml,
          width: size,
          height: renderHeight,
        });
      } catch (error) {
        console.warn(`Error rendering token ${tokenId}:`, error);
        return null;
      }
    }

    // Layout: tokens on left (70%), stats panel on right (30%)
    const GRID_WIDTH = Math.floor(CANVAS_WIDTH * 0.7);
    const STATS_WIDTH = CANVAS_WIDTH - GRID_WIDTH;

    // Calculate grid layout for tokens
    const tokenCount = collector.tokens.length;
    const maxTokensToShow = Math.min(tokenCount, 16); // Limit to 16 for performance
    const tokensToRender = collector.tokens.slice(0, maxTokensToShow);

    // Calculate optimal grid
    const { cols, rows } = calculateGridDimensions(maxTokensToShow);
    const cellWidth = Math.floor(GRID_WIDTH / cols);
    const cellHeight = Math.floor(CANVAS_HEIGHT / rows);
    const cellSize = Math.min(cellWidth, cellHeight);

    // Render tokens in batches
    const BATCH_SIZE = 4;
    const tokenImages: { tokenId: number; buffer: Buffer }[] = [];

    for (let i = 0; i < tokensToRender.length; i += BATCH_SIZE) {
      const batch = tokensToRender.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (token: any) => {
          const buffer = await renderToken(token.tokenId, cellSize);
          return buffer ? { tokenId: token.tokenId, buffer } : null;
        })
      );
      tokenImages.push(...results.filter((r): r is { tokenId: number; buffer: Buffer } => r !== null));
    }

    if (tokenImages.length === 0) {
      return res.status(500).json({ error: 'Failed to render any tokens' });
    }

    // Build composites for token grid
    const composites: { input: Buffer; left: number; top: number }[] = [];

    // Center the grid vertically
    const gridHeight = rows * cellSize;
    const gridOffsetY = Math.floor((CANVAS_HEIGHT - gridHeight) / 2);

    for (let i = 0; i < tokenImages.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellSize;
      const y = gridOffsetY + row * cellSize;

      // Resize to square cell
      const resized = await sharp(tokenImages[i].buffer)
        .resize(cellSize, cellSize, {
          fit: 'cover',
          position: 'center',
        })
        .toBuffer();

      composites.push({ input: resized, left: x, top: y });
    }

    // Create stats panel as SVG overlay
    const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const completionPercent = Math.round((collector.windowCount / leaderboard.totalWindows) * 100);

    const statsPanelSvg = `
      <svg width="${STATS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @font-face {
              font-family: 'Inter';
              src: local('Inter'), local('Arial'), local('sans-serif');
            }
            .title { font-family: 'Inter', Arial, sans-serif; font-size: 24px; fill: white; font-weight: 600; }
            .address { font-family: monospace; font-size: 14px; fill: #888888; }
            .stat-value { font-family: 'Inter', Arial, sans-serif; font-size: 48px; fill: white; font-weight: 700; }
            .stat-label { font-family: 'Inter', Arial, sans-serif; font-size: 14px; fill: #888888; text-transform: uppercase; letter-spacing: 0.1em; }
            .badge { font-family: 'Inter', Arial, sans-serif; font-size: 12px; fill: black; font-weight: 600; }
          </style>
        </defs>

        <!-- Background -->
        <rect width="${STATS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#0a0a0a"/>

        <!-- Left border -->
        <rect x="0" y="0" width="1" height="${CANVAS_HEIGHT}" fill="#333333"/>

        <!-- Content -->
        <g transform="translate(40, 80)">
          <!-- Title -->
          <text class="title" y="0">LESS Collector</text>
          <text class="address" y="30">${truncatedAddress}</text>

          ${collector.isFullCollector ? `
          <!-- Full Collector Badge -->
          <g transform="translate(0, 50)">
            <rect width="120" height="24" fill="white" rx="2"/>
            <text class="badge" x="10" y="16">FULL COLLECTOR</text>
          </g>
          ` : ''}

          <!-- Stats -->
          <g transform="translate(0, ${collector.isFullCollector ? 120 : 80})">
            <!-- Rank -->
            <text class="stat-value" y="0">#${rank}</text>
            <text class="stat-label" y="30">Rank</text>

            <!-- Tokens -->
            <text class="stat-value" y="100">${collector.tokenCount}</text>
            <text class="stat-label" y="130">Tokens</text>

            <!-- Windows -->
            <text class="stat-value" y="200">${collector.windowCount}/${leaderboard.totalWindows}</text>
            <text class="stat-label" y="230">Windows</text>

            <!-- Completion -->
            <text class="stat-value" y="300">${completionPercent}%</text>
            <text class="stat-label" y="330">Complete</text>
          </g>
        </g>

        <!-- LESS branding -->
        <text x="${STATS_WIDTH - 40}" y="${CANVAS_HEIGHT - 30}"
              font-family="'Inter', Arial, sans-serif" font-size="14px" fill="#444444"
              text-anchor="end">less.ripe.wtf</text>
      </svg>
    `;

    const statsPanelBuffer = await sharp(Buffer.from(statsPanelSvg))
      .png()
      .toBuffer();

    composites.push({ input: statsPanelBuffer, left: GRID_WIDTH, top: 0 });

    // Create final canvas and composite all elements
    const finalImage = await sharp({
      create: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 255 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    // Cache result
    await cache.set(cacheKey, CANVAS_WIDTH, CANVAS_HEIGHT, finalImage);

    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Cache', 'MISS');
    res.set('X-Render-Time', `${Date.now() - startTime}ms`);
    res.set('X-Token-Count', collector.tokenCount.toString());
    res.send(finalImage);
  } catch (error) {
    console.error('Collector card error:', error);
    res.status(500).json({
      error: 'Collector card generation failed',
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
