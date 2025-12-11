// On-chain entry point for Fold generative art
// This file is bundled standalone for scripty.sol deployment
// Expects window.SEED, window.FOLD_COUNT, and window.FONT_DATA_URI to be set

import {
  initOnChain,
  generateAllParams,
  renderToCanvas,
  generateMetadata,
  ONCHAIN_FONT_NAME,
  ONCHAIN_FONT_DATA_URI,
  FONT_STACK,
} from '../fold-core.js';

// Re-export for use by contracts that need to generate metadata
export {
  generateAllParams,
  renderToCanvas,
  generateMetadata,
  ONCHAIN_FONT_NAME,
  ONCHAIN_FONT_DATA_URI,
  FONT_STACK,
};

// Auto-init is already handled by fold-core.js when globals are present
// But we can also manually trigger if needed
export { initOnChain };
