#!/usr/bin/env node
/**
 * Generates test fixtures for Solidity trait tests by importing directly from fold-core.js
 * This ensures the test expectations always match the actual JS implementation.
 *
 * Run: node script/generate-trait-fixtures.mjs
 * Output: test/fixtures/trait-expectations.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Import directly from the source of truth
import {
  seededRandom,
  generatePalette,
  generateRenderMode,
  generateFoldStrategy,
  generatePaperProperties,
  generateRareCreaseLines,
  generateRareHitCounts,
  generateRareAnalyticsMode,
  generateDrawDirection,
  generateMarginSize,
} from '../../web/fold-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ SEED CONVERSION ============
// Matches Solidity _seedToNumber: takes upper 64 bits, mods by 0x7fffffff

const MASK_31 = BigInt(0x7fffffff);

function hexSeedToNumber(hexSeed) {
  const hex = hexSeed.startsWith('0x') ? hexSeed.slice(2) : hexSeed;
  const bigNum = BigInt('0x' + hex.slice(0, 16));
  return Number(bigNum % MASK_31);
}

// ============ TRAIT DERIVATION WRAPPERS ============
// These match the Solidity function outputs

function getFoldStrategy(seedNum) {
  const result = generateFoldStrategy(seedNum);
  // Map to Title Case to match Solidity
  const map = {
    'horizontal': 'Horizontal',
    'vertical': 'Vertical',
    'diagonal': 'Diagonal',
    'radial': 'Radial',
    'grid': 'Grid',
    'clustered': 'Clustered',
    'random': 'Random',
  };
  return map[result.type] || result.type;
}

function getRenderMode(seedNum) {
  const result = generateRenderMode(seedNum);
  // Map to Title Case
  const map = {
    'normal': 'Normal',
    'binary': 'Binary',
    'inverted': 'Inverted',
    'sparse': 'Sparse',
    'dense': 'Dense',
  };
  return map[result] || result;
}

function getDrawDirection(seedNum) {
  const result = generateDrawDirection(seedNum);
  // Map to readable format to match Solidity
  const map = {
    'ltr': 'Left to Right',
    'rtl': 'Right to Left',
    'center': 'Center',
    'alternate': 'Alternate',
    'diagonal': 'Diagonal',
    'randomMid': 'Random Mid',
    'checkerboard': 'Checkerboard',
  };
  return map[result] || result;
}

function getPalette(seedNum) {
  const result = generatePalette(seedNum);
  // Map strategy to Title Case
  const strategyMap = {
    'value': 'Value',
    'temperature': 'Temperature',
    'complement': 'Complement',
    'clash': 'Clash',
  };

  // Check for monochrome (strategy starts with "monochrome/")
  const isMonochrome = result.strategy.startsWith('monochrome');
  const strategy = isMonochrome ? 'Monochrome' : (strategyMap[result.strategy] || result.strategy);

  return {
    strategy,
    colorCount: result.colorCount,
    isMonochrome,
  };
}

function getPaperType(seedNum) {
  const props = generatePaperProperties(seedNum);
  if (props.absorbency < 0.35) return 'Resistant';
  if (props.absorbency < 0.65) return 'Standard';
  return 'Absorbent';
}

function hasPaperGrain(seedNum) {
  const props = generatePaperProperties(seedNum);
  return props.angleAffinity !== null;
}

function hasCreaseLines(seedNum) {
  return generateRareCreaseLines(seedNum);
}

function hasHitCounts(seedNum) {
  return generateRareHitCounts(seedNum);
}

function hasAnalyticsMode(seedNum) {
  return generateRareAnalyticsMode(seedNum);
}

// ============ TEST SEEDS ============
// Standard test seeds (full 256-bit hex strings like from keccak256)

const standardSeeds = [
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  '0xdeadbeefcafebabe0000000000000000ffffffffffffffffffffffffffffffff',
  '0xa5a5a5a5a5a5a5a5b6b6b6b6b6b6b6b6c7c7c7c7c7c7c7c7d8d8d8d8d8d8d8d8',
  '0x0000000000000001ffffffffffffffffffffffffffffffffffffffffffffffff',
  '0x7fffffffffffffffaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0',
  '0x8000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0',
  '0xffffffffffffffff000000000000000000000000000000000000000000000000',
  '0x0fedcba987654321111111111111111122222222222222223333333333333333',
];

// Generate additional random seeds for broader coverage
function generateRandomSeeds(count) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    let hex = '0x';
    for (let j = 0; j < 64; j++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    seeds.push(hex);
  }
  return seeds;
}

// Find special seeds for rare traits
function findSpecialSeeds() {
  const special = {
    monochrome: null,
    creaseLines: null,
    hitCounts: null,
    analyticsMode: null,
    paperGrain: null,
  };

  for (let i = 0; i < 1000; i++) {
    const upper = (0x1000000000000000n + BigInt(i) * 0x100000000000000n).toString(16).padStart(16, '0');
    const hexSeed = `0x${upper}${'0'.repeat(48)}`;
    const seedNum = hexSeedToNumber(hexSeed);

    if (!special.monochrome && getPalette(seedNum).isMonochrome) {
      special.monochrome = hexSeed;
    }
    if (!special.creaseLines && hasCreaseLines(seedNum)) {
      special.creaseLines = hexSeed;
    }
    if (!special.hitCounts && hasHitCounts(seedNum)) {
      special.hitCounts = hexSeed;
    }
    if (!special.analyticsMode && hasAnalyticsMode(seedNum)) {
      special.analyticsMode = hexSeed;
    }
    if (!special.paperGrain && hasPaperGrain(seedNum)) {
      special.paperGrain = hexSeed;
    }

    if (Object.values(special).every(v => v !== null)) break;
  }

  return special;
}

// ============ GENERATE FIXTURES ============

function generateFixtures() {
  const fixtures = {
    generated: new Date().toISOString(),
    description: 'Auto-generated trait expectations from fold-core.js',
    seeds: [],
    specialSeeds: {},
  };

  // Process standard seeds
  for (const hexSeed of standardSeeds) {
    const seedNum = hexSeedToNumber(hexSeed);
    const palette = getPalette(seedNum);

    fixtures.seeds.push({
      hex: hexSeed,
      seedNum,
      traits: {
        foldStrategy: getFoldStrategy(seedNum),
        renderMode: getRenderMode(seedNum),
        drawDirection: getDrawDirection(seedNum),
        paletteStrategy: palette.strategy,
        colorCount: palette.colorCount,
        isMonochrome: palette.isMonochrome,
        paperType: getPaperType(seedNum),
        hasPaperGrain: hasPaperGrain(seedNum),
        hasCreaseLines: hasCreaseLines(seedNum),
        hasHitCounts: hasHitCounts(seedNum),
        hasAnalyticsMode: hasAnalyticsMode(seedNum),
      },
    });
  }

  // Add random seeds for broader coverage (200 seeds for comprehensive testing)
  const randomSeeds = generateRandomSeeds(200);
  for (const hexSeed of randomSeeds) {
    const seedNum = hexSeedToNumber(hexSeed);
    const palette = getPalette(seedNum);

    fixtures.seeds.push({
      hex: hexSeed,
      seedNum,
      traits: {
        foldStrategy: getFoldStrategy(seedNum),
        renderMode: getRenderMode(seedNum),
        drawDirection: getDrawDirection(seedNum),
        paletteStrategy: palette.strategy,
        colorCount: palette.colorCount,
        isMonochrome: palette.isMonochrome,
        paperType: getPaperType(seedNum),
        hasPaperGrain: hasPaperGrain(seedNum),
        hasCreaseLines: hasCreaseLines(seedNum),
        hasHitCounts: hasHitCounts(seedNum),
        hasAnalyticsMode: hasAnalyticsMode(seedNum),
      },
    });
  }

  // Find and add special seeds
  fixtures.specialSeeds = findSpecialSeeds();

  return fixtures;
}

// ============ SOLIDITY CODE GENERATION ============

function generateSolidityTest(fixtures) {
  const lines = [];

  lines.push('// SPDX-License-Identifier: MIT');
  lines.push('// AUTO-GENERATED - DO NOT EDIT');
  lines.push('// Run: node script/generate-trait-fixtures.mjs');
  lines.push(`// Generated: ${fixtures.generated}`);
  lines.push('pragma solidity ^0.8.26;');
  lines.push('');
  lines.push('import {Test} from "forge-std/Test.sol";');
  lines.push('import {LessRenderer} from "../LessRenderer.sol";');
  lines.push('');
  lines.push('contract LessRendererTraitsHarness is LessRenderer {');
  lines.push('    constructor()');
  lines.push('        LessRenderer(');
  lines.push('            RendererConfig({');
  lines.push('                less: address(1),');
  lines.push('                scriptyBuilder: address(2),');
  lines.push('                scriptyStorage: address(3),');
  lines.push('                scriptName: "test",');
  lines.push('                baseImageURL: "https://test.com/",');
  lines.push('                collectionName: "LESS",');
  lines.push('                description: "Test",');
  lines.push('                collectionImage: "https://test.com/collection.png",');
  lines.push('                externalLink: "https://test.com",');
  lines.push('                owner: address(this)');
  lines.push('            })');
  lines.push('        )');
  lines.push('    {}');
  lines.push('');
  lines.push('    function seedToNumber(bytes32 seed) external pure returns (uint256) {');
  lines.push('        return _seedToNumber(seed);');
  lines.push('    }');
  lines.push('    function getFoldStrategy(bytes32 seed) external pure returns (string memory) {');
  lines.push('        return _getFoldStrategy(seed);');
  lines.push('    }');
  lines.push('    function getRenderMode(bytes32 seed) external pure returns (string memory) {');
  lines.push('        return _getRenderMode(seed);');
  lines.push('    }');
  lines.push('    function getDrawDirection(bytes32 seed) external pure returns (string memory) {');
  lines.push('        return _getDrawDirection(seed);');
  lines.push('    }');
  lines.push('    function getPaperType(bytes32 seed) external pure returns (string memory) {');
  lines.push('        return _getPaperType(seed);');
  lines.push('    }');
  lines.push('    function hasPaperGrain(bytes32 seed) external pure returns (bool) {');
  lines.push('        return _hasPaperGrain(seed);');
  lines.push('    }');
  lines.push('    function hasCreaseLines(bytes32 seed) external pure returns (bool) {');
  lines.push('        return _hasCreaseLines(seed);');
  lines.push('    }');
  lines.push('    function hasHitCounts(bytes32 seed) external pure returns (bool) {');
  lines.push('        return _hasHitCounts(seed);');
  lines.push('    }');
  lines.push('    function hasAnalyticsMode(bytes32 seed) external pure returns (bool) {');
  lines.push('        return _hasAnalyticsMode(seed);');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push('contract LessRendererTraitsTest is Test {');
  lines.push('    LessRendererTraitsHarness public harness;');
  lines.push('');
  lines.push('    function setUp() public {');
  lines.push('        harness = new LessRendererTraitsHarness();');
  lines.push('    }');
  lines.push('');

  // Generate test for seedToNumber
  lines.push('    function test_SeedToNumber() public view {');
  for (const fixture of fixtures.seeds.slice(0, 8)) {
    lines.push(`        assertEq(harness.seedToNumber(${fixture.hex}), ${fixture.seedNum});`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for foldStrategy
  lines.push('    function test_FoldStrategy() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.getFoldStrategy(${fixture.hex}), "${fixture.traits.foldStrategy}");`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for renderMode
  lines.push('    function test_RenderMode() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.getRenderMode(${fixture.hex}), "${fixture.traits.renderMode}");`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for drawDirection
  lines.push('    function test_DrawDirection() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.getDrawDirection(${fixture.hex}), "${fixture.traits.drawDirection}");`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for paperType
  lines.push('    function test_PaperType() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.getPaperType(${fixture.hex}), "${fixture.traits.paperType}");`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for paperGrain
  lines.push('    function test_PaperGrain() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.hasPaperGrain(${fixture.hex}), ${fixture.traits.hasPaperGrain});`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for creaseLines
  lines.push('    function test_CreaseLines() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.hasCreaseLines(${fixture.hex}), ${fixture.traits.hasCreaseLines});`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for hitCounts
  lines.push('    function test_HitCounts() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.hasHitCounts(${fixture.hex}), ${fixture.traits.hasHitCounts});`);
  }
  lines.push('    }');
  lines.push('');

  // Generate test for analyticsMode
  lines.push('    function test_AnalyticsMode() public view {');
  for (const fixture of fixtures.seeds) {
    lines.push(`        assertEq(harness.hasAnalyticsMode(${fixture.hex}), ${fixture.traits.hasAnalyticsMode});`);
  }
  lines.push('    }');
  lines.push('');

  // Special seeds tests
  if (fixtures.specialSeeds.creaseLines) {
    lines.push('    function test_SpecialSeed_CreaseLines() public view {');
    lines.push(`        assertTrue(harness.hasCreaseLines(${fixtures.specialSeeds.creaseLines}));`);
    lines.push('    }');
    lines.push('');
  }

  if (fixtures.specialSeeds.hitCounts) {
    lines.push('    function test_SpecialSeed_HitCounts() public view {');
    lines.push(`        assertTrue(harness.hasHitCounts(${fixtures.specialSeeds.hitCounts}));`);
    lines.push('    }');
    lines.push('');
  }

  if (fixtures.specialSeeds.analyticsMode) {
    lines.push('    function test_SpecialSeed_AnalyticsMode() public view {');
    lines.push(`        assertTrue(harness.hasAnalyticsMode(${fixtures.specialSeeds.analyticsMode}));`);
    lines.push('    }');
    lines.push('');
  }

  if (fixtures.specialSeeds.paperGrain) {
    lines.push('    function test_SpecialSeed_PaperGrain() public view {');
    lines.push(`        assertTrue(harness.hasPaperGrain(${fixtures.specialSeeds.paperGrain}));`);
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  return lines.join('\n');
}

// ============ MAIN ============

const fixtures = generateFixtures();

// Ensure output directories exist
const fixtureDir = join(__dirname, '../test/fixtures');
mkdirSync(fixtureDir, { recursive: true });

// Write JSON fixture file
const jsonPath = join(fixtureDir, 'trait-expectations.json');
writeFileSync(jsonPath, JSON.stringify(fixtures, null, 2));

// Write Solidity test file
const solidityCode = generateSolidityTest(fixtures);
const solidityPath = join(__dirname, '../test/LessRendererTraits.t.sol');
writeFileSync(solidityPath, solidityCode);

console.log(`Generated ${fixtures.seeds.length} test fixtures`);
console.log(`JSON: ${jsonPath}`);
console.log(`Solidity: ${solidityPath}`);
console.log('');
console.log('Special seeds found:');
for (const [trait, seed] of Object.entries(fixtures.specialSeeds)) {
  console.log(`  ${trait}: ${seed || 'NOT FOUND'}`);
}
