# Fixing ScriptyBuilder Interface Issue

## Problem

The `LessRenderer` contract calls `getEncodedHTMLString()` on ScriptyBuilderV2, but the actual deployed contract at `0x16b727a2Fc9322C724F4Bc562910c99a5edA5084` doesn't have this function, causing `tokenURI()` calls to revert.

## Root Cause

The interface definition in `LessRenderer.sol` doesn't match the actual ScriptyBuilderV2 contract deployed on mainnet. The contract may use different function names or signatures.

## Solution

The contract has been updated with a try-catch fallback mechanism that attempts multiple function signatures:

1. `getEncodedHTMLString()` - Preferred (if available)
2. `getEncodedHTML()` - Returns bytes instead of string
3. `getHTMLString()` - Get HTML and encode manually
4. `getHTML()` - Get HTML bytes and encode manually

## What Was Changed

**File: `contracts/LessRenderer.sol`**

1. **Updated interface** to include all possible function signatures:

   ```solidity
   function getHTML(HTMLRequest memory htmlRequest) external view returns (bytes memory);
   function getHTMLString(HTMLRequest memory htmlRequest) external view returns (string memory);
   function getEncodedHTML(HTMLRequest memory htmlRequest) external view returns (bytes memory);
   function getEncodedHTMLString(HTMLRequest memory htmlRequest) external view returns (string memory);
   ```

2. **Updated `_buildAnimationURL()`** to try multiple functions:
   ```solidity
   function _buildAnimationURL(...) {
       // Try getEncodedHTMLString first
       try IScriptyBuilderV2(scriptyBuilder).getEncodedHTMLString(request) returns (string memory result) {
           encodedHTML = result;
       } catch {
           // Try getEncodedHTML (returns bytes)
           try IScriptyBuilderV2(scriptyBuilder).getEncodedHTML(request) returns (bytes memory encodedBytes) {
               encodedHTML = string(encodedBytes);
           } catch {
               // Fallback: get HTML string and encode it ourselves
               try IScriptyBuilderV2(scriptyBuilder).getHTMLString(request) returns (string memory html) {
                   encodedHTML = Base64.encode(bytes(html));
               } catch {
                   // Last resort: get HTML bytes and encode
                   bytes memory htmlBytes = IScriptyBuilderV2(scriptyBuilder).getHTML(request);
                   encodedHTML = Base64.encode(htmlBytes);
               }
           }
       }
   }
   ```

## Next Steps

1. **Redeploy contracts** with the updated LessRenderer:

   ```bash
   npm run deploy:fork
   ```

2. **Test tokenURI generation**:

   ```bash
   npm run create-folds
   node scripts/generate-outputs.js --network=fork
   ```

3. **If still failing**, check the actual ScriptyBuilder contract source on Etherscan to identify the correct function signature:
   - Visit: https://etherscan.io/address/0x16b727a2Fc9322C724F4Bc562910c99a5edA5084
   - Check the "Contract" tab for verified source code
   - Look for HTML-related functions in `ScriptyHTML.sol` and `ScriptyHTMLURLSafe.sol`

## Alternative: Use Different ScriptyBuilder Address

If the mainnet ScriptyBuilder doesn't work, you may need to:

1. Deploy your own ScriptyBuilder contract that matches the interface
2. Or use a different ScriptyBuilder address that has the expected functions
3. Update `SCRIPTY_BUILDER` in `.env` and redeploy

## Verification

After redeploying, verify the fix works:

```bash
# 1. Deploy
npm run deploy:fork

# 2. Mint a token
node scripts/create-folds-and-mint.js --network=fork --folds=1 --mints-per-fold=1

# 3. Test tokenURI
LESS_ADDRESS=$(cat deployment-fork.json | jq -r '.addresses.less')
cast call $LESS_ADDRESS "tokenURI(uint256)" 1 --rpc-url http://127.0.0.1:8545

# 4. Generate outputs
node scripts/generate-outputs.js --network=fork
```

If `tokenURI()` still fails, check the trace to see which function signature (if any) worked, and update the interface accordingly.
