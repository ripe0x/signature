# Complete Deployment and Output Generation Workflow

This guide covers the end-to-end process: deploying contracts, uploading scripts, minting tokens, and generating outputs.

## Prerequisites

1. **Fork node running** (for testing):

   ```bash
   anvil --fork-url $MAINNET_RPC_URL
   ```

2. **Environment variables set** (`.env` file):
   ```bash
   STRATEGY_ADDRESS=0x...
   PAYOUT_RECIPIENT=0x...
   OWNER_ADDRESS=0x...
   FORK_RPC_URL=http://127.0.0.1:8545
   MAINNET_RPC_URL=https://...
   ```

## Complete Workflow

### Option 1: All-in-One (Recommended for Testing)

```bash
# 1. Deploy contracts and upload script
npm run deploy:fork

# 2. Mint tokens and generate outputs
node scripts/generate-outputs.js --network=fork --auto-mint

# 3. View results
open outputs/index.html
```

### Option 2: Step-by-Step

```bash
# Step 1: Deploy everything
npm run deploy:fork

# Step 2: Mint specific number of tokens and generate outputs
node scripts/generate-outputs.js --network=fork --mint=10

# Step 3: View results
open outputs/index.html
```

### Option 3: Manual Minting

```bash
# 1. Deploy
npm run deploy:fork

# 2. Mint tokens manually (using cast or a script)
# ... mint tokens ...

# 3. Generate outputs for existing tokens
npm run generate-outputs:fork
```

## What Each Step Does

### 1. Deployment (`npm run deploy:fork`)

1. **Bundles JavaScript** - Creates `web/onchain/bundled.js`
2. **Uploads to ScriptyStorage** - Stores script on-chain in chunks
3. **Deploys Contracts**:
   - `Less` NFT contract
   - `LessRenderer` contract
   - Sets renderer on Less contract
4. **Saves deployment info** - Creates `deployment-fork.json`

### 2. Output Generation (`generate-outputs.js`)

1. **Checks for tokens** - Reads `totalSupply()` from contract
2. **Mints if needed** (with `--auto-mint` or `--mint=N`):
   - Creates folds (triggers strategy burns)
   - Mints tokens during active windows
   - Handles window timing automatically
3. **Fetches tokenURIs** - Calls `tokenURI(tokenId)` for each token
4. **Decodes metadata** - Extracts JSON from base64 data URIs
5. **Generates files**:
   - `tokenURI.txt` - Full tokenURI
   - `metadata.json` - Decoded metadata
   - `animation.html` - Viewable HTML
   - `index.html` - Gallery view

## Output Files Structure

```
outputs/
├── index.html              # Gallery of all tokens
├── token-1/
│   ├── tokenURI.txt        # Full tokenURI from contract
│   ├── metadata.json       # Decoded JSON metadata
│   ├── animation.html      # HTML animation (viewable)
│   └── image-url.txt       # Static image URL
├── token-2/
│   └── ...
└── ...
```

## Common Commands

### Deployment

```bash
# Deploy to fork (testing)
npm run deploy:fork

# Deploy to mainnet (production)
npm run deploy:mainnet

# Skip steps
node scripts/deploy.js --skip-bundle    # Use existing bundle
node scripts/deploy.js --skip-upload    # Script already uploaded
node scripts/deploy.js --skip-deploy    # Only bundle and upload
```

### Output Generation

```bash
# Auto-mint 5 tokens and generate outputs
node scripts/generate-outputs.js --network=fork --auto-mint

# Mint 10 tokens and generate outputs
node scripts/generate-outputs.js --network=fork --mint=10

# Generate outputs for existing tokens
node scripts/generate-outputs.js --network=fork

# Generate outputs for specific tokens
node scripts/generate-outputs.js --network=fork --token-ids=1,2,3

# Custom output directory
node scripts/generate-outputs.js --network=fork --output-dir ./my-outputs
```

## Troubleshooting

### "Contract not found"

- Fork node was restarted (contracts are lost)
- Solution: Run `npm run deploy:fork` again

### "No tokens minted yet"

- Use `--auto-mint` to automatically mint tokens
- Or use `--mint=N` to mint N tokens
- Or mint manually first

### "Cannot connect to RPC"

- Fork node not running
- Solution: Start fork node: `anvil --fork-url $MAINNET_RPC_URL`
- Or check RPC URL in `.env`

### "Error minting tokens" / "NoETHToTwap"

- **Real strategy on fork**: The real RecursiveStrategy contract on mainnet may not have ETH available for TWAP
- **Solutions**:
  1. **Use a mock strategy** (recommended for testing):
     - Deploy a mock strategy that implements `addETH()`
     - Update `STRATEGY_ADDRESS` in `.env` to point to the mock
  2. **Fund the real strategy**: If testing with the real strategy, ensure it has accumulated ETH from fees
  3. **Manual minting**: Mint tokens manually through the contract interface after folds are created

## Production Workflow

```bash
# 1. Deploy to mainnet
npm run deploy:mainnet

# 2. Wait for tokens to be minted (by users)

# 3. Generate outputs for specific tokens
node scripts/generate-outputs.js \
  --network=mainnet \
  --token-ids=1,2,3,4,5 \
  --output-dir ./mainnet-outputs
```

## Next Steps

After generating outputs:

1. **Verify** - Check that animations render correctly
2. **Test** - View in different browsers
3. **Share** - Use HTML files for previews
4. **Archive** - Save outputs for record-keeping
