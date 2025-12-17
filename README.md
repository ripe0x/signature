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

## Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed testing instructions.
