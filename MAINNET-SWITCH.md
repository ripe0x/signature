# Mainnet Switch Checklist

Tasks to complete when switching from Sepolia testnet to Ethereum mainnet.

## Pre-Deploy

- [ ] Deploy Less NFT contract to mainnet
- [ ] Create `deployment-mainnet.json` with contract addresses
- [ ] Verify contract on Etherscan

## Image API (fold-image-api)

```bash
cd image-api

# Update fly.toml
# - CHAIN = "mainnet"
# - CONTRACT_ADDRESS = "<mainnet-less-address>"

# Clear the cache (testnet images)
curl -X POST "https://fold-image-api.fly.dev/api/cache/clear"

# Deploy
npm run build && fly deploy

# Pre-warm cache for existing tokens
for i in $(seq 1 <total-supply>); do
  curl -s "https://fold-image-api.fly.dev/images/$i" > /dev/null && echo "Cached $i"
done
```

## Frontend

- [ ] Set `USE_TESTNET = false` in `frontend/src/lib/contracts.ts`
- [ ] Verify `deployment-mainnet.json` is being loaded correctly
- [ ] Test wallet connection on mainnet
- [ ] Deploy frontend

## Twitter Bot

- [ ] Update `.env` with `NETWORK=mainnet`
- [ ] Clear bot state file if needed: `rm .twitter-bot-state.json`
- [ ] Test with `--dry-run` before going live

## Post-Deploy

- [ ] Verify tokenURI returns correct metadata
- [ ] Verify images load on OpenSea
- [ ] Test minting flow end-to-end
- [ ] Monitor Twitter bot for first real mint
