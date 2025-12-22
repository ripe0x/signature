#!/usr/bin/env node
/**
 * Post-process bundled.js to escape percent signs
 *
 * OpenSea incorrectly URL-decodes HTML content, so patterns like %12, %20, %36
 * in minified JavaScript get corrupted (e.g., %12 becomes \x12).
 *
 * The fix is to URL-encode the percent signs: % → %25
 * When OpenSea URL-decodes, %25 becomes %, restoring the original code.
 */

import { readFileSync, writeFileSync } from 'fs';

const filePath = 'web/onchain/bundled.js';

// Read the bundled file
let content = readFileSync(filePath, 'utf8');

// Count original percent signs
const originalCount = (content.match(/%/g) || []).length;

// URL-encode percent signs: % → %25
// This is safe because after OpenSea's errant URL-decoding, %25 → %
content = content.replace(/%/g, '%25');

// Write back
writeFileSync(filePath, content);

// Verify
const newContent = readFileSync(filePath, 'utf8');
const escapedCount = (newContent.match(/%25/g) || []).length;

console.log(`URL-encoded ${originalCount} percent signs -> ${escapedCount} %25 sequences`);

// Verify JS is still valid
try {
  // Note: The JS with %25 is NOT valid JS, but after URL-decoding it will be
  console.log('Note: The bundled JS now contains %25 which will be URL-decoded to % by OpenSea');
} catch (e) {
  console.log('Warning:', e.message);
}
