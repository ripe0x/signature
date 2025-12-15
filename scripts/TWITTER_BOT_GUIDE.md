# Twitter Bot Setup Guide

This guide explains how to set up and run the Twitter bot that automatically announces when new mint windows open for the Less NFT contract.

## Prerequisites

1. Node.js and npm installed
2. Twitter Developer Account with API access
3. Ethereum mainnet RPC endpoint (Alchemy, Infura, or similar)
4. Deployed Less contract address

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `viem` - Ethereum interaction library
- `twitter-api-v2` - Twitter API v2 client
- `dotenv` - Environment variable management

### 2. Configure Twitter API

#### Option A: Bearer Token (OAuth 2.0)

**Note:** Bearer tokens alone typically cannot post tweets. You need either:
- OAuth 2.0 with user context (requires additional setup), or
- Use Option B (OAuth 1.0a) which is simpler for posting

If you have a bearer token with write permissions:
1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new app or use an existing one
3. Navigate to "Keys and tokens"
4. Generate a Bearer Token
5. Copy the bearer token to your `.env` file

#### Option B: OAuth 1.0a (For User Context)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new app or use an existing one
3. Navigate to "Keys and tokens"
4. Generate API Key and API Secret
5. Generate Access Token and Access Token Secret
6. Copy all four values to your `.env` file

**Note:** You need elevated access (not just essential) to post tweets via API v2.

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

Or if using OAuth 1.0a:

```env
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret
```

### 4. Contract Address

The bot will automatically read the contract address from `deployment-mainnet.json` if it exists. Alternatively, you can set it explicitly in `.env`:

```env
LESS_CONTRACT_ADDRESS=0x...
```

## Running the Bot

### Start the Bot

```bash
npm run twitter-bot
```

The bot will:
1. Connect to Ethereum mainnet
2. Start monitoring for `FoldCreated` events
3. Post a tweet whenever a new mint window opens
4. Continue running until stopped (Ctrl+C)

### Development Mode

```bash
npm run twitter-bot:dev
```

Runs with verbose logging enabled.

## How It Works

1. **Event Monitoring**: The bot uses viem to watch for `FoldCreated` events emitted by the Less contract
2. **Event Processing**: When a new fold is created, the bot:
   - Extracts fold ID, start time, and end time
   - Fetches the current mint price from the contract
   - Calculates time remaining until window closes
   - Formats a tweet message
3. **Tweet Posting**: Posts the announcement via Twitter API v2
4. **Deduplication**: Tracks processed fold IDs to avoid duplicate tweets

## Tweet Format

Example tweet:

```
🪬 Fold #5 mint window is now open!

⏰ Window closes in 2 hours 30 minutes
💰 Mint price: 0.01 ETH
🔗 https://etherscan.io/address/0x...

Mint: 0x...
```

## Troubleshooting

### "MAINNET_RPC_URL environment variable not set"

Make sure your `.env` file exists and contains `MAINNET_RPC_URL`.

### "Contract address not found"

Either:
1. Deploy contracts first: `npm run deploy:mainnet`
2. Or set `LESS_CONTRACT_ADDRESS` in your `.env` file

### "Twitter API credentials not found"

Make sure you've set either:
- `TWITTER_BEARER_TOKEN`, or
- All four OAuth credentials (`TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`)

### "Tweet failed: duplicate content"

This means a tweet with the same content was already posted. The bot tracks processed folds to avoid this, but if you restart the bot, it may try to tweet about folds that occurred while it was offline.

### Rate Limits

Twitter API has rate limits:
- Bearer token: 300 requests per 15 minutes for posting tweets
- The bot only posts when events occur, so this should be sufficient unless there are many folds

### Network Issues

If the bot loses connection:
- It will log errors and continue trying to reconnect
- Events may be missed while disconnected
- Consider running the bot with a process manager like PM2 for automatic restarts

## Production Deployment

For production, consider:

1. **Process Manager**: Use PM2 or systemd to keep the bot running
2. **Logging**: Redirect logs to files
3. **Monitoring**: Set up alerts for errors
4. **Database**: Track processed events to handle restarts gracefully

Example PM2 configuration:

```bash
pm2 start scripts/twitter-bot.js --name mint-window-bot
pm2 save
pm2 startup
```

## Security Notes

- Never commit `.env` file to git
- Keep Twitter API credentials secure
- Use environment-specific RPC endpoints
- Consider using a dedicated Twitter account for the bot
