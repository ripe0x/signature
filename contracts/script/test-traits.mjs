#!/usr/bin/env node
/**
 * Tests Solidity trait derivation against JS implementation using 1000+ seeds.
 * Requires a local anvil instance with the LessRenderer contract deployed.
 *
 * Usage:
 *   1. Start anvil: anvil
 *   2. Deploy test harness: forge script script/DeployTraitHarness.s.sol --broadcast --rpc-url http://localhost:8545
 *   3. Run tests: node script/test-traits.mjs
 */

import { execSync } from 'child_process';
import {
  generatePalette,
  generateRenderMode,
  generateFoldStrategy,
  generatePaperProperties,
  generateRareCreaseLines,
  generateRareHitCounts,
  generateDrawDirection,
  generateMarginSize,
} from '../../web/fold-core.js';

// Config
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const HARNESS_ADDRESS = process.env.HARNESS_ADDRESS;
const SEED_COUNT = parseInt(process.env.SEED_COUNT || '1000', 10);

// ============ SEED CONVERSION ============
const MASK_31 = BigInt(0x7fffffff);

function hexSeedToNumber(hexSeed) {
  const hex = hexSeed.startsWith('0x') ? hexSeed.slice(2) : hexSeed;
  const bigNum = BigInt('0x' + hex.slice(0, 16));
  return Number(bigNum % MASK_31);
}

function generateRandomSeed() {
  let hex = '0x';
  for (let j = 0; j < 64; j++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
}

// ============ JS TRAIT FUNCTIONS ============
function getExpectedFoldStrategy(seedNum) {
  const result = generateFoldStrategy(seedNum);
  const map = {
    'horizontal': 'Horizontal', 'vertical': 'Vertical', 'diagonal': 'Diagonal',
    'radial': 'Radial', 'grid': 'Grid', 'clustered': 'Clustered', 'random': 'Random',
  };
  return map[result.type] || result.type;
}

function getExpectedRenderMode(seedNum) {
  const result = generateRenderMode(seedNum);
  const map = {
    'normal': 'Normal', 'binary': 'Binary', 'inverted': 'Inverted',
    'sparse': 'Sparse', 'dense': 'Dense',
  };
  return map[result] || result;
}

function getExpectedDrawDirection(seedNum) {
  const result = generateDrawDirection(seedNum);
  const map = {
    'ltr': 'Left to Right', 'rtl': 'Right to Left', 'center': 'Center',
    'alternate': 'Alternate', 'diagonal': 'Diagonal', 'randomMid': 'Random Mid',
    'checkerboard': 'Checkerboard',
  };
  return map[result] || result;
}

function getExpectedMargin(seedNum) {
  const result = generateMarginSize(seedNum);
  return result.name;
}

function getExpectedPaperType(seedNum) {
  const props = generatePaperProperties(seedNum);
  if (props.absorbency < 0.35) return 'Resistant';
  if (props.absorbency < 0.65) return 'Standard';
  return 'Absorbent';
}

function getExpectedPaperGrain(seedNum) {
  const props = generatePaperProperties(seedNum);
  return props.angleAffinity !== null;
}

function getExpectedCreaseLines(seedNum) {
  return generateRareCreaseLines(seedNum);
}

function getExpectedHitCounts(seedNum) {
  return generateRareHitCounts(seedNum);
}

// ============ SOLIDITY CALLS ============
function callSolidity(fn, seed) {
  try {
    const result = execSync(
      `cast call ${HARNESS_ADDRESS} "${fn}(bytes32)" ${seed} --rpc-url ${RPC_URL}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return result;
  } catch (e) {
    console.error(`Failed to call ${fn}(${seed}):`, e.message);
    return null;
  }
}

function decodeString(hex) {
  // Remove 0x, skip offset (32 bytes) and length (32 bytes), decode string
  const data = hex.slice(2);
  const length = parseInt(data.slice(64, 128), 16);
  const strHex = data.slice(128, 128 + length * 2);
  return Buffer.from(strHex, 'hex').toString('utf-8');
}

function decodeBool(hex) {
  return hex.trim() === '0x0000000000000000000000000000000000000000000000000000000000000001';
}

// ============ TEST RUNNER ============
const traits = [
  { name: 'FoldStrategy', fn: 'getFoldStrategy', expected: getExpectedFoldStrategy, decode: decodeString },
  { name: 'RenderMode', fn: 'getRenderMode', expected: getExpectedRenderMode, decode: decodeString },
  { name: 'DrawDirection', fn: 'getDrawDirection', expected: getExpectedDrawDirection, decode: decodeString },
  { name: 'PaperType', fn: 'getPaperType', expected: getExpectedPaperType, decode: decodeString },
  { name: 'PaperGrain', fn: 'hasPaperGrain', expected: getExpectedPaperGrain, decode: decodeBool },
  { name: 'CreaseLines', fn: 'hasCreaseLines', expected: getExpectedCreaseLines, decode: decodeBool },
  { name: 'HitCounts', fn: 'hasHitCounts', expected: getExpectedHitCounts, decode: decodeBool },
];

async function main() {
  if (!HARNESS_ADDRESS) {
    console.error('Error: HARNESS_ADDRESS environment variable not set');
    console.error('');
    console.error('Usage:');
    console.error('  1. Start anvil: anvil');
    console.error('  2. Deploy harness: forge script script/DeployTraitHarness.s.sol --broadcast --rpc-url http://localhost:8545');
    console.error('  3. Run: HARNESS_ADDRESS=0x... node script/test-traits.mjs');
    process.exit(1);
  }

  console.log(`Testing ${SEED_COUNT} seeds against ${HARNESS_ADDRESS}`);
  console.log('');

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < SEED_COUNT; i++) {
    const seed = generateRandomSeed();
    const seedNum = hexSeedToNumber(seed);

    for (const trait of traits) {
      const expectedValue = trait.expected(seedNum);
      const rawResult = callSolidity(trait.fn, seed);

      if (rawResult === null) {
        failed++;
        failures.push({ seed, trait: trait.name, error: 'call failed' });
        continue;
      }

      const actualValue = trait.decode(rawResult);

      if (actualValue === expectedValue) {
        passed++;
      } else {
        failed++;
        failures.push({ seed, trait: trait.name, expected: expectedValue, actual: actualValue });
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1}/${SEED_COUNT} seeds tested`);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.trait}: seed=${f.seed}`);
      console.log(`    expected: ${f.expected}`);
      console.log(`    actual:   ${f.actual || f.error}`);
    }
    if (failures.length > 10) {
      console.log(`  ... and ${failures.length - 10} more`);
    }
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

main();
