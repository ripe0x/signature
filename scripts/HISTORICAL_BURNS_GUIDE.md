# Using Historical Burn Data for Testing

This guide explains how to use real mainnet burn transaction data to test your NFT minting flow on a fork.

## Overview

Instead of using mock strategies or manually funding strategies, you can use actual historical burn data from mainnet to create realistic test scenarios. This allows you to:

- Test with real ETH amounts that were actually used
- Simulate the exact timing and sequence of burns
- Validate your contract behavior against real-world data

## Setup

### 1. Prepare Burn Data

Create or edit `scripts/historical-burns.json` with your burn transaction data:

```json
{
  "burns": [
    {
      "date": "2025-12-02T13:01:00Z",
      "ethSpent": "0.995",
      "rstrBurned": "1.06M",
      "txHash": "0x3530...dff2",
      "fullTxHash": null,
      "note": "Optional note about this burn"
    },
    {
      "date": "2025-12-02T13:02:00Z",
      "ethSpent": "0.995",
      "rstrBurned": "2.15M",
      "txHash": "0x...",
      "fullTxHash": null
    }
  ]
}
```

**Fields:**

- `date`: ISO 8601 timestamp of the burn
- `ethSpent`: ETH amount as a string (e.g., "0.995")
- `rstrBurned`: Amount of RSTR burned (for reference)
- `txHash`: Transaction hash (truncated or full)
- `fullTxHash`: Full transaction hash if available (optional)
- `note`: Optional note about the burn

### 2. Extract Data from Block Explorer

You can extract this data from:

- Etherscan transaction logs
- Block explorer APIs
- Your own transaction monitoring

The key information needed is:

- **ETH amount spent** (used to fund the strategy)
- **Transaction hash** (for reference/verification)
- **Timestamp** (for realistic timing)

## Usage

### Basic Usage

```bash
# Use historical burns to create folds on fork
npm run use-historical-burns

# Or specify a custom burns file
node scripts/use-historical-burns.js --network=fork --burns-file=./my-burns.json
```

### Complete Workflow

```bash
# 1. Deploy contracts
npm run deploy:fork

# 2. Use historical burns to create folds
npm run use-historical-burns

# 3. Mint tokens and generate outputs
node scripts/generate-outputs.js --network=fork --mint=5
```

## How It Works

1. **Loads burn data** from the JSON file
2. **For each burn**:
   - Funds the strategy with the ETH amount from the burn
   - Advances blocks for unique blockhashes
   - Calls `createFold()` to trigger the burn
   - Waits for the window to close before the next fold
3. **Creates realistic test environment** with actual mainnet data

## Strategy Funding

The script attempts to fund the strategy in two ways:

1. **`addETH()` method** (for mock strategies):

   ```solidity
   strategy.addETH{value: ethAmount}()
   ```

2. **Direct ETH transfer** (for real strategies that accept ETH):
   ```solidity
   payable(strategy).transfer(ethAmount)
   ```

If both fail, the script will continue but the fold creation may fail if the strategy doesn't have ETH.

## Example: Extracting Data from Image

If you have a table/image of burn data like:

| Date               | ETH Spent | RSTR Burned | Transaction   |
| ------------------ | --------- | ----------- | ------------- |
| 12/2/2025 01:01 PM | 0.995 ETH | 1.06M $RSTR | 0x3530...dff2 |
| 12/2/2025 01:02 PM | 0.995 ETH | 2.15M $RSTR | 0x...         |

Convert it to JSON:

```json
{
  "burns": [
    {
      "date": "2025-12-02T13:01:00Z",
      "ethSpent": "0.995",
      "rstrBurned": "1.06M",
      "txHash": "0x3530...dff2"
    },
    {
      "date": "2025-12-02T13:02:00Z",
      "ethSpent": "0.995",
      "rstrBurned": "2.15M",
      "txHash": "0x..."
    }
  ]
}
```

## Advanced: Replaying Actual Transactions

If you have the full transaction hashes, you can potentially replay them on the fork:

```bash
# Replay a specific transaction
cast rpc anvil_impersonateAccount <tx_sender> --rpc-url http://127.0.0.1:8545
cast send <strategy_address> --value 0.995ether --rpc-url http://127.0.0.1:8545
```

However, the script's approach of simulating burns with the same ETH amounts is usually sufficient for testing.

## Troubleshooting

### "Strategy funding failed"

- **Mock strategy**: Ensure it implements `addETH()`
- **Real strategy**: It may not accept direct ETH transfers
- **Solution**: Use a mock strategy for testing, or ensure the real strategy has accumulated fees

### "Failed to create fold"

- Strategy may not have enough ETH
- Check that `ethToTwap` has sufficient balance
- Verify the strategy's `processTokenTwap()` can execute

### "No burn data found"

- Ensure `historical-burns.json` exists and has valid JSON
- Check that the `burns` array is not empty
- Verify file path is correct

## Benefits

✅ **Realistic testing** with actual mainnet data  
✅ **Reproducible** test scenarios  
✅ **Validates** contract behavior against real-world patterns  
✅ **No manual funding** required - script handles it automatically

## Next Steps

After using historical burns:

1. **Mint tokens** during the created windows
2. **Generate outputs** to see the results
3. **Compare** with mainnet behavior
4. **Iterate** on your contract logic if needed
