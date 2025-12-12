# Script Upload Guide

This guide covers best practices for uploading JavaScript code to ScriptyStorage for on-chain generative art.

## Overview

The `UploadScript.s.sol` script uploads your image generation JavaScript to ScriptyStorage, making it available for on-chain rendering via the `LessRenderer` contract.

## Best Practices

### 1. **Separation of Concerns**

- ✅ **Separate upload from deployment** - This allows you to:
  - Upload scripts independently of contract deployment
  - Update scripts without redeploying contracts
  - Test script uploads separately
  - Reuse the same script across multiple deployments

### 2. **File Preparation**

Before uploading, ensure your JavaScript is:

- **Bundled/compiled** - All dependencies should be included
- **Minified** (optional) - Reduces gas costs for storage
- **Self-contained** - Should work when injected into HTML
- **Tested locally** - Verify it works with the expected globals (`window.LESS_SEED`, `window.LESS_TOKEN_ID`)

### 3. **Configuration Management**

- Use environment variables for:
  - ScriptyStorage address (different for mainnet/testnet)
  - Script name (identifier in storage)
  - Script file path
- This makes the script reusable across environments

### 4. **Verification**

- Always verify the upload succeeded by:
  - Reading the script back from storage
  - Comparing the retrieved content with what was uploaded
  - Checking the size matches

### 5. **Idempotency**

- The script can be run multiple times safely
- It will overwrite existing scripts with the same name
- Useful for updates and testing

### 6. **Large File Handling**

- ScriptyStorage can handle large files, but be aware of:
  - Gas costs increase with file size
  - Consider chunking for very large scripts (>100KB)
  - Test on testnet first to estimate costs

## Usage

### Prerequisites

1. **Build your JavaScript bundle**:

   ```bash
   # Example: If using a bundler
   npm run build:onchain
   # This should create a bundled version of web/onchain/index.js
   ```

2. **Set up environment variables** (in `.env`):

   ```bash
   # Required
   SCRIPTY_STORAGE=0x096451F43800f207FC32B4FF86F286EdaF736eE3  # Mainnet
   SCRIPT_NAME=less
   SCRIPT_PATH=web/onchain/index.js

   # Optional (for testnet)
   # SCRIPTY_STORAGE=0x...  # Testnet address
   ```

### Running the Upload Script

```bash
# Upload to mainnet (requires MAINNET_RPC_URL and private key)
forge script script/UploadScript.s.sol --tc UploadScript \
  --rpc-url $MAINNET_RPC_URL \
  --broadcast \
  -vvv

# Upload to testnet first (recommended)
forge script script/UploadScript.s.sol --tc UploadScript \
  --rpc-url $TESTNET_RPC_URL \
  --broadcast \
  -vvv

# Dry run (simulate without broadcasting)
forge script script/UploadScript.s.sol --tc UploadScript \
  --rpc-url $MAINNET_RPC_URL \
  -vvv
```

### Workflow

1. **Development**:

   ```bash
   # 1. Develop/test your JavaScript locally
   # 2. Build the bundle
   npm run build:onchain

   # 3. Upload to testnet
   forge script script/UploadScript.s.sol --tc UploadScript \
     --rpc-url $TESTNET_RPC_URL \
     --broadcast \
     -vvv

   # 4. Test the uploaded script
   # (Deploy test contracts that use it)
   ```

2. **Production**:

   ```bash
   # 1. Finalize your JavaScript
   # 2. Build production bundle
   npm run build:onchain:prod

   # 3. Upload to mainnet
   forge script script/UploadScript.s.sol --tc UploadScript \
     --rpc-url $MAINNET_RPC_URL \
     --broadcast \
     -vvv

   # 4. Deploy contracts (Deploy.s.sol)
   # Contracts will reference the uploaded script by name
   ```

## Integration with Deployment

The deployment script (`Deploy.s.sol`) expects the script to already be uploaded:

```solidity
// Deploy.s.sol references the script by name
string memory scriptName = vm.envOr("SCRIPT_NAME", string("less"));
// ...
LessRenderer renderer = new LessRenderer(
    // ...
    scriptName,  // This must match what you uploaded
    // ...
);
```

**Important**: Upload the script BEFORE deploying contracts, or update the renderer's script name after deployment.

## Troubleshooting

### Script too large

- Consider minification
- Remove unnecessary code
- Use scripty's compression features if available
- Split into multiple scripts if possible

### Upload fails

- Check you have sufficient ETH for gas
- Verify the ScriptyStorage address is correct
- Ensure the script file path is correct
- Check file permissions

### Verification fails

- The `getScript` function may not be available in all ScriptyStorage versions
- This is a warning, not necessarily an error
- Verify manually by checking the contract on Etherscan

### Script name mismatch

- Ensure `SCRIPT_NAME` in upload matches what's used in `Deploy.s.sol`
- The renderer contract uses this name to fetch the script

## Advanced: Chunking for Large Files

For very large scripts (>100KB), you may need to implement chunking. This requires:

1. Splitting the script into chunks
2. Uploading each chunk separately
3. Modifying the renderer to fetch and concatenate chunks

This is beyond the scope of the basic upload script but can be added if needed.

## Security Considerations

- ✅ Scripts stored on-chain are immutable (once uploaded)
- ✅ Anyone can read the script from storage
- ✅ Scripts cannot be deleted (only overwritten with same name)
- ⚠️ Verify script content before uploading to mainnet
- ⚠️ Test thoroughly on testnet first

## Cost Estimation

Upload costs depend on:

- Script size (bytes)
- Current gas prices
- Network (mainnet vs testnet)

Example: A 50KB script might cost:

- ~0.01-0.05 ETH on mainnet (depending on gas prices)
- Much less on testnet

Always test on testnet first!
