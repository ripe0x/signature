#!/bin/bash
#
# Deploy OpenSea Fix
# This script uploads the escaped JS and deploys a new renderer
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
    esac
done

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "Loaded .env file"
fi

# Configuration (use .env vars with fallbacks)
RPC_URL="${MAINNET_RPC_URL:-$RPC_URL}"
PK="${PRIVATE_KEY:-$PK}"
ETHERSCAN_API_KEY="${ETHERSCAN_API_KEY:-}"
SCRIPT_NAME="lessFolds.js-v$(date +%s)"

# Dry run mode
if [ "$DRY_RUN" = true ]; then
    BROADCAST_FLAG=""
    echo -e "${YELLOW}>>> DRY RUN MODE - No transactions will be sent <<<${NC}"
else
    BROADCAST_FLAG="--broadcast"
fi

echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}       Deploy OpenSea Fix - Escaped JavaScript${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# Check for private key
if [ -z "$PK" ]; then
    echo -e "${RED}Error: PRIVATE_KEY not set in .env${NC}"
    echo "Add PRIVATE_KEY=your_key to .env file"
    exit 1
fi

# Check for RPC URL
if [ -z "$RPC_URL" ]; then
    echo -e "${RED}Error: MAINNET_RPC_URL not set in .env${NC}"
    exit 1
fi

# Get deployer address
DEPLOYER=$(cast wallet address "$PK" 2>/dev/null)
echo -e "Deployer address: ${GREEN}$DEPLOYER${NC}"

# Check balance
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL" 2>/dev/null)
BALANCE_ETH=$(cast from-wei "$BALANCE" 2>/dev/null)
echo -e "Balance: ${GREEN}$BALANCE_ETH ETH${NC}"
echo ""

# Estimate costs
echo -e "${YELLOW}Estimated costs:${NC}"
echo "  - Upload script (3 chunks): ~0.0024 ETH"
echo "  - Deploy renderer + set:    ~0.0007 ETH"
echo "  - Total:                    ~0.003 ETH"
echo ""

echo -e "Script name: ${GREEN}$SCRIPT_NAME${NC}"
echo ""

# ============================================================
# Step 0: Confirm bundled.js is ready
# ============================================================
echo -e "${BLUE}[Step 0/5] Checking bundled.js...${NC}"

BUNDLED_SIZE=$(wc -c < web/onchain/bundled.js 2>/dev/null || echo "0")
PERCENT_COUNT=$(grep -o '%25' web/onchain/bundled.js 2>/dev/null | wc -l | tr -d ' ')

echo "  Bundled.js size: $BUNDLED_SIZE bytes"
echo "  Escaped %25 sequences: $PERCENT_COUNT"

if [ "$PERCENT_COUNT" -lt "60" ]; then
    echo -e "${YELLOW}  Warning: Expected ~66 escaped sequences. Running build...${NC}"
    npm run build:onchain
    PERCENT_COUNT=$(grep -o '%25' web/onchain/bundled.js 2>/dev/null | wc -l | tr -d ' ')
    echo "  After build: $PERCENT_COUNT escaped sequences"
fi

echo -e "${GREEN}  ✓ Bundled.js ready${NC}"
echo ""

# ============================================================
# Step 1: Confirm upload
# ============================================================
echo -e "${BLUE}[Step 1/5] Upload script to ScriptyStorage${NC}"
echo ""
read -p "Proceed with upload? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo "Uploading..."
SCRIPT_NAME="$SCRIPT_NAME" forge script script/UploadScript.s.sol:UploadScript \
    --rpc-url "$RPC_URL" \
    --private-key "$PK" \
    $BROADCAST_FLAG \
    -vvv

echo ""
echo -e "${GREEN}  ✓ Script uploaded${NC}"
echo ""

# ============================================================
# Step 2: Verify upload
# ============================================================
echo -e "${BLUE}[Step 2/5] Verifying upload on ScriptyStorage...${NC}"

# Try to read the script back
SCRIPT_CHECK=$(cast call 0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699 \
    "getContent(string,bytes)(bytes)" \
    "$SCRIPT_NAME" \
    "0x" \
    --rpc-url "$RPC_URL" 2>/dev/null | head -c 100)

if [ -n "$SCRIPT_CHECK" ] && [ "$SCRIPT_CHECK" != "0x" ]; then
    echo -e "${GREEN}  ✓ Script verified on ScriptyStorage${NC}"
else
    echo -e "${RED}  ✗ Could not verify script on ScriptyStorage${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# ============================================================
# Step 3: Deploy renderer
# ============================================================
echo -e "${BLUE}[Step 3/5] Deploy new LessRenderer${NC}"
echo ""
read -p "Proceed with renderer deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo "Deploying renderer..."
DEPLOY_OUTPUT=$(SCRIPT_NAME="$SCRIPT_NAME" forge script script/DeployNewRenderer.s.sol:DeployNewRenderer \
    --rpc-url "$RPC_URL" \
    --private-key "$PK" \
    $BROADCAST_FLAG \
    -vvv 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract renderer address from output
RENDERER_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -o "New LessRenderer deployed at: 0x[a-fA-F0-9]\{40\}" | grep -o "0x[a-fA-F0-9]\{40\}" | head -1)

if [ -z "$RENDERER_ADDRESS" ]; then
    echo -e "${RED}  ✗ Could not extract renderer address${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}  ✓ Renderer deployed at: $RENDERER_ADDRESS${NC}"
echo ""

# ============================================================
# Step 4: Verify renderer contract on Etherscan
# ============================================================
echo -e "${BLUE}[Step 4/5] Verify contract on Etherscan${NC}"

if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo -e "${YELLOW}  Skipping: ETHERSCAN_API_KEY not set${NC}"
    echo "  You can verify manually later with:"
    echo "  forge verify-contract $RENDERER_ADDRESS LessRenderer --chain mainnet"
else
    echo "Verifying on Etherscan..."
    forge verify-contract "$RENDERER_ADDRESS" \
        contracts/LessRenderer.sol:LessRenderer \
        --chain mainnet \
        --etherscan-api-key "$ETHERSCAN_API_KEY" \
        --watch || echo -e "${YELLOW}  Verification may take a few minutes${NC}"
fi
echo ""

# ============================================================
# Step 5: Final verification
# ============================================================
echo -e "${BLUE}[Step 5/5] Final verification${NC}"

# Check renderer is set on Less contract
CURRENT_RENDERER=$(cast call 0x008B66385ed2346E6895031E250B2ac8dc14605C \
    "renderer()(address)" \
    --rpc-url "$RPC_URL" 2>/dev/null)

echo "  Less contract: 0x008B66385ed2346E6895031E250B2ac8dc14605C"
echo "  Current renderer: $CURRENT_RENDERER"
echo "  New renderer: $RENDERER_ADDRESS"

if [ "$CURRENT_RENDERER" = "$RENDERER_ADDRESS" ]; then
    echo -e "${GREEN}  ✓ Renderer correctly set on Less contract${NC}"
else
    echo -e "${RED}  ✗ Renderer mismatch! Check the deployment logs.${NC}"
    exit 1
fi

# Test tokenURI
echo ""
echo "  Testing tokenURI for token #12..."
TOKEN_URI=$(cast call 0x008B66385ed2346E6895031E250B2ac8dc14605C \
    "tokenURI(uint256)(string)" \
    12 \
    --rpc-url "$RPC_URL" 2>/dev/null | head -c 100)

if [[ "$TOKEN_URI" == *"data:application/json;base64"* ]]; then
    echo -e "${GREEN}  ✓ tokenURI returns valid data${NC}"
else
    echo -e "${YELLOW}  ⚠ Could not verify tokenURI${NC}"
fi

echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}           DEPLOYMENT COMPLETE${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "  Script name:     $SCRIPT_NAME"
echo "  Renderer:        $RENDERER_ADDRESS"
echo "  Less contract:   0x008B66385ed2346E6895031E250B2ac8dc14605C"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Wait a few minutes for Etherscan indexing"
echo "  2. Refresh metadata on OpenSea for your tokens"
echo "  3. Test that animation renders correctly"
echo ""
echo "  OpenSea refresh URL:"
echo "  https://opensea.io/assets/ethereum/0x008b66385ed2346e6895031e250b2ac8dc14605c/12"
echo "  (Click '...' menu -> 'Refresh metadata')"
echo ""
