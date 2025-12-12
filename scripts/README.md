# Deployment Scripts

This directory contains deployment automation scripts for the Less NFT project.

## Main Deployment Script

`deploy.js` - Comprehensive deployment script that:

1. Bundles JavaScript for on-chain deployment
2. Uploads script to ScriptyStorage
3. Deploys contracts (Less NFT and LessRenderer)
4. Waits for transaction confirmations
5. Saves deployment information

## Prerequisites

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment variables** (`.env` file):

   ```bash
   # Required for deployment
   STRATEGY_ADDRESS=0x...
   PAYOUT_RECIPIENT=0x...
   OWNER_ADDRESS=0x...

   # Scripty addresses
   SCRIPTY_BUILDER=0x16b727a2Fc9322C724F4Bc562910c99a5edA5084  # Mainnet
   SCRIPTY_STORAGE=0x096451F43800f207FC32B4FF86F286EdaF736eE3  # Mainnet
   SCRIPT_NAME=less

   # RPC URLs
   MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
   FORK_RPC_URL=http://127.0.0.1:8545  # For local fork

   # Optional
   MINT_PRICE=10000000000000000  # 0.01 ETH in wei
   BASE_IMAGE_URL=https://less.art/images/
   ```

3. **For local fork testing**:
   ```bash
   # Start a local fork node (in another terminal)
   anvil --fork-url $MAINNET_RPC_URL
   ```

## Usage

### Basic Usage

```bash
# Deploy to local fork (default)
npm run deploy
# or
node scripts/deploy.js

# Deploy to mainnet
npm run deploy:mainnet
# or
node scripts/deploy.js --network=mainnet

# Deploy to fork
npm run deploy:fork
# or
node scripts/deploy.js --network=fork
```

### Advanced Options

```bash
# Skip bundling (use existing bundle)
node scripts/deploy.js --skip-bundle

# Skip upload (script already uploaded)
node scripts/deploy.js --skip-upload

# Skip deployment (only bundle and upload)
node scripts/deploy.js --skip-deploy

# Combine options
node scripts/deploy.js --network=mainnet --skip-bundle
```

## What the Script Does

### Step 1: Bundle JavaScript

- Uses `esbuild` to bundle `web/onchain/index.js` and dependencies
- Creates `web/onchain/bundled.js`
- Minifies for smaller size (reduces gas costs)
- Outputs bundle size

### Step 2: Upload to ScriptyStorage

- Reads the bundled JavaScript file
- Uploads to ScriptyStorage using `UploadScript.s.sol`
- Waits for transaction confirmation (mainnet only)
- Verifies upload success

### Step 3: Deploy Contracts

- Deploys `Less` NFT contract
- Deploys `LessRenderer` contract
- Sets renderer on Less contract
- Waits for transaction confirmation (mainnet only)
- Saves deployment info to `deployment-{network}.json`

## Transaction Confirmation

The script automatically:

- **On fork**: Transactions are instant, no waiting needed
- **On mainnet**: Waits up to 5 minutes for confirmation
- Shows transaction hashes
- Displays block numbers when confirmed

## Deployment Output

After successful deployment, you'll get:

- Contract addresses (Less NFT and LessRenderer)
- Deployment info saved to `deployment-{network}.json`
- Transaction hashes and confirmations

Example `deployment-mainnet.json`:

```json
{
  "network": "mainnet",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "addresses": {
    "less": "0x...",
    "renderer": "0x..."
  },
  "scriptName": "less",
  "scriptyStorage": "0x...",
  "scriptyBuilder": "0x..."
}
```

## Safety Features

1. **Confirmation prompts**: On mainnet, you'll be asked to confirm before:

   - Uploading script (costs gas)
   - Deploying contracts (costs gas)

2. **Transaction verification**:

   - Extracts transaction hashes from forge output
   - Waits for confirmations
   - Verifies transaction success

3. **Error handling**:
   - Validates environment variables
   - Checks file existence
   - Provides clear error messages

## Troubleshooting

### "esbuild not found"

```bash
npm install --save-dev esbuild
```

### "Bundled script not found"

Run without `--skip-bundle` first, or manually create the bundle.

### "Missing required environment variables"

Check your `.env` file has all required variables.

### "Transaction confirmation timeout"

- Check your RPC connection
- Verify transaction on Etherscan manually
- Transaction may still succeed even if timeout occurs

### "Upload failed"

- Check you have sufficient ETH for gas
- Verify ScriptyStorage address is correct
- Ensure script file exists and is readable

## Workflow Examples

### Development (Local Fork)

```bash
# 1. Start fork node
anvil --fork-url $MAINNET_RPC_URL

# 2. Deploy to fork
npm run deploy:fork

# 3. Test contracts
# ... run tests or interact with contracts
```

### Production (Mainnet)

```bash
# 1. Double-check .env file
cat .env

# 2. Deploy to mainnet
npm run deploy:mainnet

# 3. Verify on Etherscan
# Check the addresses in deployment-mainnet.json
```

### Update Script Only

```bash
# If you only changed the JavaScript:
node scripts/deploy.js --network=mainnet --skip-deploy
```

### Update Contracts Only

```bash
# If script is already uploaded:
node scripts/deploy.js --network=mainnet --skip-bundle --skip-upload
```

## Notes

- The script uses Foundry's `forge script` under the hood
- Make sure you have Foundry installed and configured
- Private key should be set in `.env` or via `--private-key` flag to forge
- Gas prices are determined by the network automatically
