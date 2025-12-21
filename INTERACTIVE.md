# Fold Interactive Mode

The Fold artwork is rendered with interactive DOM-based text elements. Characters can be dragged and edited - an easter egg for viewers who try clicking or dragging.

## How It Works

- **Background layer**: Canvas with solid color + "░" texture pattern
- **Character layer**: Real DOM text elements positioned over the background
- **Interactivity**: Drag and edit are hidden features - no UI hints

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+S` | Download PNG of current state (includes edits) |
| `Escape` | Reset positions and text to original |

## Editing Text

| Action | How |
|--------|-----|
| Start editing | Double-click any character |
| Type | Replaces characters as you type (overwrite mode) |
| Navigate | Arrow keys move cursor left/right |
| Delete | Backspace/Delete restore original character |
| Stop editing | Escape or click outside |

## Dragging

Click and drag any character to reposition it.

## Testing Locally

### Standalone test:
```
open fold-interactive.html?seed=12345&folds=50
```

### On-chain bundle test:
```
open test-onchain-interactive.html
```

## Building

Rebuild the on-chain bundle after changes:
```bash
npm run build:onchain
```

## Files

- `web/fold-core.js` - Core module with `extractCharacterData()` and interactive rendering functions
- `web/onchain/index.js` - On-chain entry point
- `web/onchain/bundled.js` - Minified bundle for on-chain deployment
- `fold-interactive.html` - Standalone test page
- `test-onchain-interactive.html` - Bundle test page
