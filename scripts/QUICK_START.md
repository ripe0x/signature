# Quick Start Guide

Complete workflow commands to deploy, create folds, mint NFTs, and generate outputs.

## Prerequisites

1. **Fork node running**:

   ```bash
   anvil --fork-url $MAINNET_RPC_URL
   ```

2. **Environment variables** (`.env` file):
   ```bash
   STRATEGY_ADDRESS=0x32f223e5c09878823934a8116f289bae2b657b8e
   PAYOUT_RECIPIENT=0x...
   OWNER_ADDRESS=0x...
   FORK_RPC_URL=http://127.0.0.1:8545
   MAINNET_RPC_URL=https://...
   ```

## Complete Workflow

### Step 1: Deploy Contracts

Deploys contracts and uploads the JavaScript bundle to ScriptyStorage:

```bash
npm run deploy:fork
```

This will:

- Bundle JavaScript from `web/onchain/index.js`
- Upload to ScriptyStorage
- Deploy `Less` and `LessRenderer` contracts
- Set renderer on Less contract
- Save deployment info to `deployment-fork.json`

### Step 2: Create Folds and Mint NFTs

Creates folds (triggers buy and burn) and mints NFTs:

```bash
# Default: 5 folds, 3 mints per fold, 1 ETH per fold
npm run create-folds

# Or customize:
node scripts/create-folds-and-mint.js \
  --network=fork \
  --folds=5 \
  --mints-per-fold=3 \
  --eth-per-fold=1
```

**Options:**

- `--folds=N` - Number of folds to create (default: 5)
- `--mints-per-fold=N` - NFTs to mint per fold window (default: 3)
- `--eth-per-fold=N` - ETH to fund strategy per fold (default: 1)

This will:

- Fund strategy with ETH via `addFees()` (impersonating hook)
- Create folds (triggers `processTokenTwap()` buy and burn)
- Mint NFTs during active windows
- Wait for windows to close between folds

### Step 3: Generate Outputs

Generate tokenURIs, metadata, and preview files:

```bash
# Generate for all minted tokens
npm run generate-outputs:fork

# Or for specific tokens:
node scripts/generate-outputs.js --network=fork --token-ids=1,2,3
```

This creates:

- `outputs/token-{id}/tokenURI.txt` - Full tokenURI
- `outputs/token-{id}/metadata.json` - Decoded metadata
- `outputs/token-{id}/animation.html` - Viewable HTML
- `outputs/index.html` - Gallery view

## One-Liner (All Steps)

```bash
npm run deploy:fork && \
npm run create-folds && \
npm run generate-outputs:fork
```

## Common Commands

### Deployment

```bash
npm run deploy:fork          # Deploy to fork
npm run deploy:mainnet       # Deploy to mainnet
```

### Create Folds & Mint

```bash
npm run create-folds                              # Default (5 folds, 3 mints each)
node scripts/create-folds-and-mint.js --folds=10  # 10 folds
node scripts/create-folds-and-mint.js --mints-per-fold=5  # 5 mints per fold
```

### Generate Outputs

```bash
npm run generate-outputs:fork                    # All tokens
npm run generate-outputs:mainnet --token-ids=1,2,3  # Specific tokens
```

## Troubleshooting

### "Contract not found"

- Fork node was restarted → Run `npm run deploy:fork` again

### "NoETHToTwap"

- Strategy needs ETH → The script funds it automatically via `addFees()`
- If it fails, check hook address is correct

### "MintWindowActive"

- Window already active → Script handles this automatically

### "No tokens minted"

- Check that folds were created successfully
- Verify mint price is correct
- Ensure window is active when minting

### "Renderer not set" / "call to non-contract address 0x0"

- Renderer address is zero → Set it manually:
  ```bash
  OWNER=$(cast call $LESS_ADDRESS "owner()" --rpc-url $RPC_URL | tail -1 | sed 's/0x000000000000000000000000/0x/')
  cast rpc anvil_impersonateAccount $OWNER --rpc-url $RPC_URL
  cast send $LESS_ADDRESS "setRenderer(address)" $RENDERER_ADDRESS --rpc-url $RPC_URL --unlocked --from $OWNER
  ```

### "unrecognized function selector" for ScriptyBuilder

- ScriptyBuilder interface mismatch → This is a contract-level issue
- The deployed ScriptyBuilder may use a different interface than expected
- Check `deployment-fork.json` for the renderer address
- May need to update `LessRenderer.sol` to match the actual ScriptyBuilder interface

## View Results

After generating outputs:

```bash
open outputs/index.html
```

This opens a gallery view of all minted NFTs with their metadata and animations.
