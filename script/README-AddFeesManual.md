# AddFeesManual Script

Manually add ETH fees to the RipeStrategy contract via the `addFeesManual()` function.

## Usage

### Dry Run (Simulation)

```bash
source .env && forge script script/AddFeesManual.s.sol --rpc-url "$MAINNET_RPC_URL" -vvvv
```

### Broadcast Transaction

**Default (0.001 ETH):**
```bash
source .env && forge script script/AddFeesManual.s.sol --rpc-url "$MAINNET_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast -vvvv
```

**0.1 ETH:**
```bash
source .env && AMOUNT=100000000000000000 forge script script/AddFeesManual.s.sol --rpc-url "$MAINNET_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast -vvvv
```

**0.25 ETH:**
```bash
source .env && AMOUNT=250000000000000000 forge script script/AddFeesManual.s.sol --rpc-url "$MAINNET_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast -vvvv
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AMOUNT` | Amount of ETH to send (in wei) | `1000000000000000` (0.001 ETH) |
| `STRATEGY_ADDRESS` | RipeStrategy contract address | `0x9C2CA573009F181EAc634C4d6e44A0977C24f335` |
| `MAINNET_RPC_URL` | Ethereum mainnet RPC endpoint | Required |
| `PRIVATE_KEY` | Wallet private key for signing | Required for broadcast |

## Common Amounts Reference

| ETH | Wei |
|-----|-----|
| 0.001 | `1000000000000000` |
| 0.01 | `10000000000000000` |
| 0.1 | `100000000000000000` |
| 0.25 | `250000000000000000` |
| 0.5 | `500000000000000000` |
| 1.0 | `1000000000000000000` |
