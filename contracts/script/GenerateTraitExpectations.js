#!/usr/bin/env node
// Generates expected trait values for test seeds
// Run with: node script/GenerateTraitExpectations.js
//
// IMPORTANT: Uses BigInt for precise arithmetic matching Solidity

// ============ CONSTANTS ============
const MASK_31 = BigInt(0x7fffffff); // 2^31 - 1

// ============ SEEDED RANDOM (BigInt version to match Solidity) ============
function seededRandom(seed) {
  let state = BigInt(seed);
  if (state === 0n) state = 1n;
  return () => {
    state = (state * 1103515245n + 12345n) & MASK_31;
    // Return as JS number for comparison
    return Number(state) / Number(MASK_31);
  };
}

// ============ HEX SEED TO NUMBER (same as fold-core.js) ============
// Converts a hex seed to a number that can be used with seededRandom
// Takes the first 16 hex chars (64 bits) and mods by 0x7fffffff
function hexSeedToNumber(hexSeed) {
  // Remove 0x prefix if present
  const hex = hexSeed.startsWith('0x') ? hexSeed.slice(2) : hexSeed;
  // Take first 16 hex chars (64 bits) and convert
  const bigNum = BigInt('0x' + hex.slice(0, 16));
  return Number(bigNum % MASK_31);
}

// ============ TRAIT DERIVATION FUNCTIONS ============

function getFoldStrategy(seedNum) {
  const rng = seededRandom(seedNum + 6666);
  const roll = rng();
  if (roll < 0.16) return "horizontal";
  if (roll < 0.32) return "vertical";
  if (roll < 0.44) return "diagonal";
  if (roll < 0.56) return "radial";
  if (roll < 0.68) return "grid";
  if (roll < 0.80) return "clustered";
  return "random";
}

function getRenderMode(seedNum) {
  const rng = seededRandom(seedNum + 5555);
  const roll = rng();
  if (roll < 0.35) return "normal";
  if (roll < 0.40) return "binary";
  if (roll < 0.65) return "inverted";
  if (roll < 0.825) return "sparse";
  return "dense";
}

function getDrawDirection(seedNum) {
  const rng = seededRandom(seedNum + 33333);
  const roll = rng();
  if (roll < 0.22) return "ltr";
  if (roll < 0.44) return "rtl";
  if (roll < 0.65) return "center";
  if (roll < 0.80) return "alternate";
  if (roll < 0.90) return "diagonal";
  if (roll < 0.96) return "randomMid";
  return "checkerboard";
}

function getPalette(seedNum) {
  const rng = seededRandom(seedNum);
  let roll = rng();

  if (roll < 0.12) {
    return { strategy: "monochrome", colorCount: 2, isMonochrome: true };
  }

  roll = rng();
  let strategy;
  if (roll < 0.40) strategy = "value";
  else if (roll < 0.68) strategy = "temperature";
  else if (roll < 0.90) strategy = "complement";
  else strategy = "clash";

  roll = rng();
  const colorCount = roll < 0.40 ? 2 : 3;

  return { strategy, colorCount, isMonochrome: false };
}

function getPaperType(seedNum) {
  const rng = seededRandom(seedNum + 5555);
  const absorbency = 0.1 + rng() * 0.8;
  if (absorbency < 0.35) return "Resistant";
  if (absorbency < 0.65) return "Standard";
  return "Absorbent";
}

function hasPaperGrain(seedNum) {
  const rng = seededRandom(seedNum + 5555);
  rng(); // absorbency
  rng(); // intersectionThreshold (disabled but advances)
  const roll = rng();
  return roll < 0.40;
}

function hasCreaseLines(seedNum) {
  const rng = seededRandom(seedNum + 9191);
  return rng() < 0.008;
}

function hasHitCounts(seedNum) {
  const rng = seededRandom(seedNum + 8888);
  return rng() < 0.008;
}

// ============ TEST SEEDS ============
// Using full 256-bit hex seeds (like from keccak256)
// These represent realistic seed values from the contract

const testSeeds = [
  // Simulated keccak256 outputs (full 64-char hex strings)
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "0xdeadbeefcafebabe0000000000000000ffffffffffffffffffffffffffffffff",
  "0xa5a5a5a5a5a5a5a5b6b6b6b6b6b6b6b6c7c7c7c7c7c7c7c7d8d8d8d8d8d8d8d8",
  "0x0000000000000001ffffffffffffffffffffffffffffffffffffffffffffffff",
  "0x7fffffffffffffffaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "0x8000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0",
  "0xffffffffffffffff000000000000000000000000000000000000000000000000",
  "0x0fedcba987654321111111111111111122222222222222223333333333333333",
];

// ============ GENERATE OUTPUT ============

console.log("// Auto-generated trait expectations for full 256-bit seeds");
console.log("// Run: node script/GenerateTraitExpectations.js");
console.log("// NOTE: Uses BigInt RNG for precise Solidity matching");
console.log("");

for (const seed of testSeeds) {
  const seedNum = hexSeedToNumber(seed);
  const palette = getPalette(seedNum);

  console.log(`// Seed: ${seed}`);
  console.log(`// seedToNumber: ${seedNum}`);
  console.log(`// Fold Strategy: ${getFoldStrategy(seedNum)}`);
  console.log(`// Render Mode: ${getRenderMode(seedNum)}`);
  console.log(`// Draw Direction: ${getDrawDirection(seedNum)}`);
  console.log(`// Palette: ${palette.strategy}, colorCount: ${palette.colorCount}, mono: ${palette.isMonochrome}`);
  console.log(`// Paper Type: ${getPaperType(seedNum)}`);
  console.log(`// Paper Grain: ${hasPaperGrain(seedNum)}`);
  console.log(`// Crease Lines: ${hasCreaseLines(seedNum)}`);
  console.log(`// Hit Counts: ${hasHitCounts(seedNum)}`);
  console.log("");
}

// Find special seeds (monochrome, crease lines, hit counts)
console.log("// ============ SPECIAL SEED SEARCH ============");

// Search for monochrome (12% chance)
console.log("// Searching for monochrome seeds...");
for (let i = 0; i < 100; i++) {
  // Generate test seed with varying upper bits
  const upper = (0x1000000000000000n + BigInt(i) * 0x100000000000000n).toString(16).padStart(16, '0');
  const hexSeed = `0x${upper}${'0'.repeat(48)}`;
  const seedNum = hexSeedToNumber(hexSeed);
  const palette = getPalette(seedNum);
  if (palette.isMonochrome) {
    console.log(`// Found monochrome: ${hexSeed} (seedNum: ${seedNum})`);
    break;
  }
}

// Search for crease lines (0.8% chance)
console.log("// Searching for crease lines seeds...");
for (let i = 0; i < 500; i++) {
  const upper = (0x1000000000000000n + BigInt(i) * 0x100000000000000n).toString(16).padStart(16, '0');
  const hexSeed = `0x${upper}${'0'.repeat(48)}`;
  const seedNum = hexSeedToNumber(hexSeed);
  if (hasCreaseLines(seedNum)) {
    console.log(`// Found crease lines: ${hexSeed} (seedNum: ${seedNum})`);
    break;
  }
}

// Search for hit counts (0.8% chance)
console.log("// Searching for hit counts seeds...");
for (let i = 0; i < 500; i++) {
  const upper = (0x1000000000000000n + BigInt(i) * 0x100000000000000n).toString(16).padStart(16, '0');
  const hexSeed = `0x${upper}${'0'.repeat(48)}`;
  const seedNum = hexSeedToNumber(hexSeed);
  if (hasHitCounts(seedNum)) {
    console.log(`// Found hit counts: ${hexSeed} (seedNum: ${seedNum})`);
    break;
  }
}

// Search for paper grain (40% chance)
console.log("// Searching for paper grain seeds...");
for (let i = 0; i < 100; i++) {
  const upper = (0x1000000000000000n + BigInt(i) * 0x100000000000000n).toString(16).padStart(16, '0');
  const hexSeed = `0x${upper}${'0'.repeat(48)}`;
  const seedNum = hexSeedToNumber(hexSeed);
  if (hasPaperGrain(seedNum)) {
    console.log(`// Found paper grain: ${hexSeed} (seedNum: ${seedNum})`);
    break;
  }
}
