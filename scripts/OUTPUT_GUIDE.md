# Generating Outputs from Deployed Contracts

After deploying contracts and uploading scripts, you can generate tokenURIs, metadata, and preview HTML files for minted tokens.

## Quick Start

**Complete workflow (deploy + mint + generate):**

```bash
# 1. Deploy contracts and upload script
npm run deploy:fork

# 2. Mint tokens and generate outputs
node scripts/generate-outputs.js --network=fork --auto-mint

# 3. View results
open outputs/index.html
```

**Or step-by-step:**

```bash
# Auto-mint tokens and generate outputs (fork)
node scripts/generate-outputs.js --network=fork --auto-mint

# Mint specific number of tokens and generate outputs
node scripts/generate-outputs.js --network=fork --mint=10

# Generate outputs for existing tokens
npm run generate-outputs:fork

# Generate outputs for specific tokens
node scripts/generate-outputs.js --network=fork --token-ids=1,2,3

# Generate outputs for mainnet
npm run generate-outputs:mainnet --token-ids=1,2,3
```

## Usage

### Basic Usage

```bash
# Generate outputs for all minted tokens
node scripts/generate-outputs.js --network=fork

# Generate outputs for specific tokens
node scripts/generate-outputs.js --network=fork --token-ids=1,2,3,5,10

# Specify custom output directory
node scripts/generate-outputs.js --network=fork --output-dir ./my-outputs
```

### Options

- `--network=fork|mainnet` - Network to query (default: fork)
- `--token-ids=1,2,3` - Comma-separated list of token IDs (default: all minted tokens)
- `--output-dir=./outputs` - Output directory (default: ./outputs)
- `--auto-mint` - Automatically mint 5 tokens if none exist
- `--mint=N` - Mint N tokens before generating outputs

## What Gets Generated

For each token, the script generates:

1. **tokenURI.txt** - The full tokenURI as returned by the contract
2. **metadata.json** - Decoded JSON metadata with:
   - Name, description
   - Image URL
   - Animation URL (base64 encoded HTML)
   - Attributes (Fold ID, Seed, Strategy Block, etc.)
3. **animation.html** - The decoded HTML animation (viewable in browser)
4. **image-url.txt** - The static image URL (if available)
5. **index.html** - A gallery view of all generated tokens

## Output Structure

```
outputs/
├── index.html              # Gallery view
├── token-1/
│   ├── tokenURI.txt
│   ├── metadata.json
│   ├── animation.html
│   └── image-url.txt
├── token-2/
│   └── ...
└── ...
```

## Viewing Outputs

### Option 1: Open the Gallery

```bash
# Open the index HTML file
open outputs/index.html
# or
xdg-open outputs/index.html  # Linux
```

### Option 2: Open Individual Tokens

```bash
# Open a specific token's animation
open outputs/token-1/animation.html
```

### Option 3: View Metadata

```bash
# View metadata JSON
cat outputs/token-1/metadata.json | jq
```

## Workflow Examples

### Complete Workflow (Deploy + Mint + Generate)

```bash
# 1. Deploy contracts and upload script
npm run deploy:fork

# 2. Mint tokens and generate outputs in one step
node scripts/generate-outputs.js --network=fork --auto-mint

# 3. View results
open outputs/index.html
```

### Step-by-Step Workflow

```bash
# 1. Deploy contracts
npm run deploy:fork

# 2. Mint specific number of tokens and generate outputs
node scripts/generate-outputs.js --network=fork --mint=10

# 3. View results
open outputs/index.html
```

### Generate Outputs for Existing Tokens

```bash
# If tokens are already minted
npm run generate-outputs:fork

# Or for specific tokens
node scripts/generate-outputs.js --network=fork --token-ids=1,2,3
```

### Testing Specific Tokens

```bash
# Generate outputs for tokens 1, 5, and 10
node scripts/generate-outputs.js --network=fork --token-ids=1,5,10

# View token 1
open outputs/token-1/animation.html
```

### Production (Mainnet)

```bash
# Generate outputs from mainnet deployment
node scripts/generate-outputs.js \
  --network=mainnet \
  --token-ids=1,2,3 \
  --output-dir ./mainnet-outputs
```

## Understanding the Outputs

### tokenURI.txt

The full data URI returned by `tokenURI(tokenId)`. Format:

```
data:application/json;base64,eyJuYW1lIjoibGVzcyAjMSIs...
```

### metadata.json

Decoded JSON metadata:

```json
{
  "name": "less #1",
  "description": "...",
  "image": "https://less.art/images/1.png",
  "animation_url": "data:text/html;base64,...",
  "attributes": [
    { "trait_type": "Fold ID", "value": 1 },
    { "trait_type": "Seed", "value": "0x..." },
    ...
  ]
}
```

### animation.html

The HTML animation that will be displayed in NFT marketplaces. This is the same HTML that gets embedded in the `animation_url` field.

## Troubleshooting

### "No tokens minted yet"

- Use `--auto-mint` to automatically mint 5 tokens
- Or use `--mint=N` to mint N tokens
- Or specify token IDs manually: `--token-ids=1,2,3`

### "Contract not found"

- The fork node may have been restarted
- Deploy contracts first: `npm run deploy:fork`
- Then run the output generation script

### "Deployment file not found"

- Run the deployment script first: `npm run deploy:fork`
- Or specify contract address manually (requires script modification)

### "Error getting tokenURI"

- Check that the contract is deployed and accessible
- Verify RPC URL is correct
- Ensure token ID exists (has been minted)

### "Invalid metadata format"

- The tokenURI might not be in the expected format
- Check the contract's tokenURI implementation

## Integration with Other Tools

### Using with Preview Generator

The preview generator (`tools/preview-generator.cjs`) creates mock previews. The output generator reads from actual deployed contracts.

### Using with Tests

You can also generate outputs from test contracts:

```bash
# Run tests that generate outputs
forge test --match-test test_OutputSampleMetadata -vvv > test_output.txt
```

## Next Steps

After generating outputs:

1. **Verify** - Check that animations render correctly
2. **Test** - View in different browsers/marketplaces
3. **Share** - Use the HTML files for previews or documentation
4. **Archive** - Save outputs for record-keeping
