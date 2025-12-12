// Quick analysis script for seed 94374
// Run with: node analyze-seed.js

// Simplified seeded random (same algorithm as fold-core.js)
function seededRandom(seed) {
  let state = Math.abs(seed) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function hashSeed(seed, str) {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

const seed = 94374;

console.log("=== Seed 94374 Analysis ===\n");

// 1. Render Mode
const renderRng = seededRandom(seed + 5555);
const renderRoll = renderRng();
let renderMode;
if (renderRoll < 0.35) renderMode = "normal";
else if (renderRoll < 0.5) renderMode = "binary";
else if (renderRoll < 0.65) renderMode = "inverted";
else if (renderRoll < 0.8) renderMode = "sparse";
else renderMode = "dense";
console.log(`Render Mode: ${renderMode} (roll: ${renderRoll.toFixed(4)})`);

// 2. Weight Range
const weightRng = seededRandom(seed + 7777);
const weightStyle = weightRng();
let weightRange;
if (weightStyle < 0.25) {
  const base = 0.2 + weightRng() * 0.2;
  weightRange = { min: base, max: base + 0.1 + weightRng() * 0.2 };
} else if (weightStyle < 0.5) {
  const base = 0.6 + weightRng() * 0.2;
  weightRange = { min: base, max: base + 0.1 + weightRng() * 0.1 };
} else if (weightStyle < 0.75) {
  weightRange = { min: 0.1 + weightRng() * 0.2, max: 0.7 + weightRng() * 0.3 };
} else {
  weightRange = { min: 0.3 + weightRng() * 0.2, max: 0.5 + weightRng() * 0.5 };
}
console.log(
  `Weight Range: ${weightRange.min.toFixed(3)} - ${weightRange.max.toFixed(
    3
  )} (style: ${weightStyle.toFixed(4)})`
);

// 3. Max Folds
const maxFoldsRng = seededRandom(seed + 2222);
const maxFolds = 5 + Math.floor(maxFoldsRng() * 20);
console.log(`Max Folds: ${maxFolds}`);

// 4. Fold Strategy
const strategyRng = seededRandom(seed + 6666);
const strategyRoll = strategyRng();
let strategyType;
if (strategyRoll < 0.4) strategyType = "uniform";
else if (strategyRoll < 0.7) strategyType = "weighted";
else strategyType = "cyclic";
console.log(
  `Fold Strategy: ${strategyType} (roll: ${strategyRoll.toFixed(4)})`
);

// 5. Multi-color
const multiColorRng = seededRandom(seed + 4444);
const multiColor = multiColorRng() < 0.3;
console.log(`Multi-Color: ${multiColor}`);

// 6. Fold count (if not specified)
const foldRng = seededRandom(seed + 9999);
const foldCount = Math.floor(1 + foldRng() * 500);
console.log(`Fold Count (auto): ${foldCount}`);

// 7. Frequency patterns (affects crease distribution)
const freqRng = seededRandom(seed + 3333);
const freqX = 0.05 + freqRng() * 0.15;
const freqY = 0.05 + freqRng() * 0.15;
const phaseX = freqRng() * Math.PI * 2;
const phaseY = freqRng() * Math.PI * 2;
console.log(`\nFrequency Patterns:`);
console.log(`  X: freq=${freqX.toFixed(4)}, phase=${phaseX.toFixed(4)}`);
console.log(`  Y: freq=${freqY.toFixed(4)}, phase=${phaseY.toFixed(4)}`);

// 8. Reduction multipliers (affects how crease weights reduce over cycles)
const reductionRng = seededRandom(seed + 1111);
const reductionMultipliers = [];
for (let i = 0; i < maxFolds; i++) {
  reductionMultipliers[i] = 0.001 + reductionRng() * 0.25;
}
console.log(`\nReduction Multipliers (first 5):`);
reductionMultipliers.slice(0, 5).forEach((m, i) => {
  console.log(`  Cycle ${i}: ${m.toFixed(4)}`);
});

console.log(`\n=== Pattern Explanation ===`);
console.log(`
The three patterns you see are likely:
1. Different render modes (normal/binary/inverted/sparse/dense)
2. Different fold counts showing progression
3. Or different visualizations of the same fold pattern

The seed determines:
- Where creases are placed (via fold simulation)
- How dense/sparse the pattern appears (via weight range)
- The visual style (via render mode)
- Color palette (via palette generation)

The horizontal/vertical density gradients you see are created by:
- The frequency patterns (freqX, freqY) that create sine wave offsets
- The weight range that determines how "heavy" each crease intersection is
- The render mode that maps weights to visual density levels
`);
