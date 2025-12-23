# Signature

Generative art project using fold simulation to create unique visual outputs.

## Project Structure

- `web/` - Frontend application and core rendering logic
- `contracts/` - Solidity smart contracts
- `image-api/` - Image generation API
- `scripts/` - Utility scripts including Twitter bot

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## Secret Keyboard Shortcuts

When viewing an on-chain render (with `SEED` or `LESS_SEED` set), the following keyboard shortcuts are available:

| Shortcut | Action |
|----------|--------|
| `Shift+F` | Toggle fold lines overlay - shows crease lines on top of the render |
| `Shift+A` | Start full animation - animates from 0 folds to the current fold count with full cell rendering |
| `Shift+L` | Start lines-only animation - same animation but shows only the crease lines without cells |
| `Escape` | Cancel animation - stops any running animation |

These features are useful for:
- Understanding how the fold pattern builds up over iterations
- Debugging fold strategies (horizontal, vertical, grid, diagonal, radial, clustered)
- Creating interesting visual progressions

## Fold Strategies

The crease pattern is determined by one of seven strategies:

| Strategy | Description |
|----------|-------------|
| `horizontal` | Crease lines run left-to-right only |
| `vertical` | Crease lines run top-to-bottom only |
| `grid` | Alternates between horizontal and vertical creases |
| `diagonal` | Creases at 45° or 135° angles |
| `radial` | Creases radiate from a focal point |
| `clustered` | Creases cluster around a specific area |
| `random` | Mixed crease directions |

## Mint Windows & TWAP Sync

Mint windows open when the buy+burn balance reaches 0.25 ETH. However, there's a 30-minute "TWAP sync" delay enforced by the strategy contract to ensure fair token buybacks via time-weighted average pricing.

**How it works:**
- When a mint window opens, `processTokenTwap()` is called and sets `lastBurn = now`
- During the 90-minute window, trading activity can trigger `addFees()` which may reset `lastBurn` (if 30+ minutes have passed since the last reset)
- A new window can only open when `timeUntilFundsMoved() == 0` (i.e., 30 minutes after the last `lastBurn`)

**Edge case:** If trading activity resets the sync timer near the end of a window, the next window may be delayed by up to ~30 minutes after the current window closes—even if the ETH threshold is already met.

## Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed testing instructions.
