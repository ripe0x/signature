# Fold API Documentation

## Image API

**Production URL:** `https://fold-image-api.fly.dev`

The Image API renders token artwork as PNG images and provides collector data.

### Endpoints

#### Health Check
```
GET /health
```
Returns server status, browser pool stats, and cache stats.

#### Render by Seed
```
GET /api/render?seed=0x...
```
Renders artwork from a seed hash.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `seed` | string | required | Hex seed (with or without 0x prefix) |
| `width` | number | 1200 | Image width (100-4000) |
| `height` | number | 1697 | Image height (100-4000) |
| `format` | string | - | Set to `og` for social media format (1200x630) |

#### Render by Token ID
```
GET /images/:tokenId
GET /images/:tokenId.png
```
Renders artwork for a minted token by fetching its on-chain data.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | 1200 | Image width (100-4000) |
| `height` | number | 1697 | Image height (100-4000) |
| `format` | string | - | Set to `og` for social media format (1200x630) |

**Examples:**
```
/images/1
/images/42.png
/images/1?format=og
/images/1?width=600&height=848
```

#### Grid Image
```
GET /api/grid?tokenIds=1,2,3
```
Generates a grid composite of multiple tokens.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tokenIds` | string | required | Comma-separated token IDs |
| `cellWidth` | number | 300 | Width of each cell |
| `cellHeight` | number | 424 | Height of each cell |

#### Collector Grid
```
GET /api/collector-grid/:address
```
Generates a grid of all tokens owned by a collector, with optional highlighting.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `highlight` | string | - | Comma-separated token IDs to highlight (shown larger with gold border) |

**Example:**
```
/api/collector-grid/0x1234...?highlight=5,6,7
```

Output: 1200x675 PNG (Twitter card ratio)

#### Leaderboard
```
GET /api/leaderboard
```
Returns collector leaderboard data including token counts, windows collected, and full collector status.

#### Single Collector
```
GET /api/collector/:address
```
Returns data for a single collector including rank, tokens, and windows collected.

#### Clear Cache
```
POST /api/cache/clear
```
Clears the image cache. Returns count of cleared items.

#### Index Collectors (Admin)
```
POST /api/admin/index-collectors
Content-Type: application/json

{ "address": "0xCB43078C32423F5348Cab5885911C3B5faE217F9" }
```
Re-indexes all collector data from the blockchain. Requires admin address.

#### Index Status
```
GET /api/admin/index-status
```
Returns current indexing status and last result.

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Render-Time` | Render duration in ms |
| `X-Token-Id` | Token ID (for token endpoints) |
| `X-Grid-Time` | Grid generation time |
| `X-Token-Count` | Total tokens in grid |
| `X-Highlighted-Count` | Highlighted tokens in collector grid |

### Image Dimensions

| Format | Dimensions | Ratio | Use Case |
|--------|------------|-------|----------|
| Default | 1200x1697 | A4 (~0.707) | Full artwork |
| OG | 1200x630 | 1.9:1 | Twitter/OpenGraph cards |
| Twitter Card | 1200x675 | 16:9 | Collector grids |

---

## Twitter Bot

Monitors the Less contract for events and posts automated tweets.

### Usage

```bash
node scripts/twitter-bot.js [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--network=mainnet` | Network to monitor (mainnet or sepolia) |
| `--dry-run` | Log tweets without posting |
| `--interval=60` | Polling interval in seconds |
| `--rescan` | Force rescan from lookback, ignoring saved state |
| `--skip-catchup` | Skip catching up on missed events |

#### Test Modes
| Flag | Description |
|------|-------------|
| `--test` | General test mode |
| `--test-mint` | Test mint announcement |
| `--test-sale` | Test sale announcement |
| `--test-reminder` | Test reminder tweet |
| `--test-window-ready` | Test window ready tweet |
| `--test-balance-progress` | Test balance progress tweet |

#### Manual Posting
| Flag | Description |
|------|-------------|
| `--post-mint=TOKEN_ID` | Post mint tweet for specific token |
| `--post-window=WINDOW_ID` | Post window opened tweet |
| `--post-balance` | Post balance status tweet |
| `--preview-sale=1,2,3` | Preview sale tweet without posting |

#### Mock Values (for testing)
| Flag | Description |
|------|-------------|
| `--mock-balance=0.15` | Mock contract balance in ETH |
| `--mock-threshold=0.25` | Mock threshold in ETH |
| `--mock-window-id=5` | Mock window ID |
| `--mock-eth-price=2500` | Mock ETH price in USD |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `IMAGE_API_URL` | Image API base URL (default: `https://fold-image-api.fly.dev`) |
| `MAINNET_RPC_URL` | Mainnet RPC endpoint |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint |
| `TWITTER_API_KEY` | Twitter API key |
| `TWITTER_API_SECRET` | Twitter API secret |
| `TWITTER_ACCESS_TOKEN` | Twitter access token |
| `TWITTER_ACCESS_SECRET` | Twitter access token secret |
| `ADMIN_PORT` | Admin HTTP server port (default: 8080) |

### Examples

```bash
# Run on mainnet with 2-minute polling
node scripts/twitter-bot.js --network=mainnet --interval=120

# Test mint announcement without posting
node scripts/twitter-bot.js --test-mint --dry-run

# Preview what a sale tweet would look like
node scripts/twitter-bot.js --preview-sale=42

# Post a specific mint announcement
node scripts/twitter-bot.js --post-mint=123

# Force rescan from lookback period
node scripts/twitter-bot.js --rescan
```

### NPM Scripts

```bash
# Run bot in test mode
npm run twitter-bot:test

# Run with custom IMAGE_API_URL
IMAGE_API_URL=http://localhost:3001 npm run twitter-bot:test
```

---

## Data Architecture

### Leaderboard Data Flow

The collector leaderboard data has two synchronized sources for resilience:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Action  │────▶│   Image API      │────▶│    Frontend     │
│  (every 2 hrs)  │     │  /api/leaderboard│     │   (primary)     │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │                                                │
         │              ┌──────────────────┐              │
         └─────────────▶│   Static File    │◀─────────────┘
                        │  (fallback)      │    (if API unavailable)
                        └──────────────────┘
```

**How it works:**

1. **GitHub Action** (every 2 hours):
   - Triggers image-api indexer (`POST /api/admin/index-collectors`)
   - Runs local indexer script as backup
   - Commits updated static file to repo

2. **Frontend** fetches leaderboard:
   - Tries image-api first (`/api/leaderboard`)
   - Falls back to static file (`/data/leaderboard.json`) if API unavailable

3. **Admin Panel** can trigger manual re-index via image-api

**Data locations:**
| Location | Path | Updated By |
|----------|------|------------|
| Image API (fly.dev) | `/data/leaderboard.json` | Admin panel, GitHub Action |
| Static file (repo) | `frontend/public/data/leaderboard.json` | GitHub Action |

---

## Local Development

### Running the Image API locally

```bash
cd image-api
npm install
npm run dev
```

The API will start on `http://localhost:3001`.

### Testing with local Image API

```bash
IMAGE_API_URL=http://localhost:3001 node scripts/twitter-bot.js --test-mint --dry-run
```
