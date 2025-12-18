# Twitter Bot

Monitors the Less contract for `FoldCreated` and `Minted` events and tweets announcements.

## Sepolia Contract

```
0x417bbEa79283c9949B1aedF613D122bf773378e6
```

## Local Commands

### Watch logs (dry run mode)

```bash
node scripts/twitter-bot.js --network=sepolia --dry-run
```

### Test mode (simulate events without blockchain)

```bash
node scripts/twitter-bot.js --network=sepolia --test
node scripts/twitter-bot.js --network=sepolia --test-mint
```

### Test with mock burn amount

```bash
MOCK_LAST_BURN=1250000 node scripts/twitter-bot.js --network=sepolia --test
```

### Verify Twitter credentials

```bash
node scripts/twitter-bot.js --verify
```

### Run for real (Sepolia)

```bash
node scripts/twitter-bot.js --network=sepolia
```

### Rescan from lookback (ignores saved state)

```bash
node scripts/twitter-bot.js --network=sepolia --dry-run --rescan
```

## Environment Variables

Required in `.env`:

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Twitter OAuth 1.0a credentials
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_TOKEN_SECRET=

# Image API for mint tweets (production)
IMAGE_API_URL=https://fold-image-api.fly.dev

# $LESS token address (mainnet) - for burn data in tweets
# TODO: Update when real token is deployed
LESS_TOKEN_ADDRESS=0x32f223e5c09878823934a8116f289bae2b657b8e
```

## Fly.io Deployment

```bash
fly deploy
fly logs
```
