import { useState, useEffect, useRef } from "react";

// ============ GLOBAL CONSTANTS ============

const CELL_MIN = 4;
const CELL_MAX = 600;
const CELL_ASPECT_MAX = 3; // Max ratio between cell width and height (e.g., 3:1 or 1:3)

// ============ COLOR SYSTEM ============

// HSL to Hex conversion
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Hex to HSL conversion
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Hue zones - named regions of the color wheel
const HUE_ZONES = {
  ember: [5, 25], // red-orange
  earth: [25, 50], // orange-ochre
  gold: [45, 65], // yellow-gold
  moss: [70, 100], // yellow-green
  forest: [100, 150], // green
  teal: [160, 190], // cyan-teal
  sky: [195, 225], // blue
  deep: [225, 260], // deep blue-indigo
  dusk: [260, 290], // purple
  berry: [290, 330], // magenta-pink
  blood: [345, 360], // red (wraps to 0-10)
};

// Saturation bands
const SAT_BANDS = {
  whisper: [8, 20], // barely there
  muted: [25, 42], // sophisticated quiet
  moderate: [45, 62], // present but calm
  rich: [65, 82], // full, confident
  vivid: [85, 100], // rare, loud
};

// Value structures (bg lightness, text lightness)
const VALUE_STRUCTURES = {
  paper: { bg: [88, 96], text: [12, 28] }, // light bg, dark text
  parchment: { bg: [78, 88], text: [18, 35] }, // aged paper
  screen: { bg: [3, 12], text: [75, 92] }, // terminal
  slate: { bg: [15, 25], text: [65, 80] }, // dark but not black
  fog: { bg: [70, 82], text: [35, 50] }, // low contrast light
  storm: { bg: [25, 40], text: [55, 72] }, // low contrast dark
};

// Temperature families
const WARM_ZONES = ["ember", "earth", "gold", "berry", "blood"];
const COOL_ZONES = ["forest", "teal", "sky", "deep", "dusk"];
const NEUTRAL_ZONES = ["moss"];

// Pick from a range
function pickInRange(rng, range) {
  return range[0] + rng() * (range[1] - range[0]);
}

// Pick a random key from an object
function pickKey(rng, obj) {
  const keys = Object.keys(obj);
  return keys[Math.floor(rng() * keys.length)];
}

// Generate palette using constrained system
function generatePalette(seed) {
  const rng = seededRandom(seed);

  // 1. Choose a value structure first (this is the foundation)
  const structureName = pickKey(rng, VALUE_STRUCTURES);
  const structure = VALUE_STRUCTURES[structureName];

  // 2. Choose temperature commitment
  const tempRoll = rng();
  let temperature, availableZones;
  if (tempRoll < 0.45) {
    temperature = "warm";
    availableZones = WARM_ZONES;
  } else if (tempRoll < 0.9) {
    temperature = "cool";
    availableZones = COOL_ZONES;
  } else {
    temperature = "neutral";
    availableZones = [...WARM_ZONES, ...COOL_ZONES, ...NEUTRAL_ZONES];
  }

  // 3. Choose primary hue zone
  const zoneName = availableZones[Math.floor(rng() * availableZones.length)];
  const zone = HUE_ZONES[zoneName] || HUE_ZONES.earth;
  const primaryHue = pickInRange(rng, zone);

  // 4. Choose saturation band
  const satRoll = rng();
  let satBandName;
  if (satRoll < 0.15) satBandName = "whisper";
  else if (satRoll < 0.4) satBandName = "muted";
  else if (satRoll < 0.7) satBandName = "moderate";
  else if (satRoll < 0.92) satBandName = "rich";
  else satBandName = "vivid";

  const satBand = SAT_BANDS[satBandName];

  // 5. Choose relationship type
  const relationRoll = rng();
  let relationship, secondaryHue;

  if (relationRoll < 0.45) {
    // Monochrome - same hue for bg and text
    relationship = "mono";
    secondaryHue = primaryHue;
  } else if (relationRoll < 0.75) {
    // Analogous - nearby hue (±15-40°)
    relationship = "analogous";
    const shift = 15 + rng() * 25;
    secondaryHue = (primaryHue + (rng() > 0.5 ? shift : -shift) + 360) % 360;
  } else if (relationRoll < 0.88) {
    // Temperature tension - opposite temperature
    relationship = "tension";
    const oppositeZones = temperature === "warm" ? COOL_ZONES : WARM_ZONES;
    const oppZoneName = oppositeZones[Math.floor(rng() * oppositeZones.length)];
    const oppZone = HUE_ZONES[oppZoneName];
    secondaryHue = pickInRange(rng, oppZone);
  } else {
    // Complement - opposite on wheel
    relationship = "complement";
    secondaryHue = (primaryHue + 150 + rng() * 60) % 360;
  }

  // 6. Assign hues to bg/text based on structure
  const isLightBg = structure.bg[0] > 50;
  const bgHue = isLightBg ? secondaryHue : primaryHue;
  const textHue = isLightBg ? primaryHue : secondaryHue;

  // 7. Calculate final values
  const bgL = pickInRange(rng, structure.bg);
  const textL = pickInRange(rng, structure.text);

  // 8. Saturation - bg often more muted than text
  const bgSat = pickInRange(rng, [satBand[0] * 0.6, satBand[1] * 0.8]);
  const textSat = pickInRange(rng, satBand);

  // For very light or very dark bgs, reduce saturation further
  const bgSatFinal = bgL > 85 || bgL < 15 ? bgSat * 0.5 : bgSat;

  const bg = hslToHex(bgHue, bgSatFinal, bgL);
  const text = hslToHex(textHue, textSat, textL);

  // 9. Generate accent - complementary, high contrast
  const accentHue = (primaryHue + 150 + rng() * 60) % 360;
  const accentSat = 70 + rng() * 30;
  const accentL = bgL > 50 ? 30 + rng() * 25 : 60 + rng() * 25;
  const accent = hslToHex(accentHue, accentSat, accentL);

  return {
    bg,
    text,
    accent,
    strategy: `${structureName}/${relationship}`,
  };
}

// ============ UTILITIES ============

// Find divisors of a number within a range
function getDivisors(n, min, max) {
  const divisors = [];
  for (let i = min; i <= max; i++) {
    if (n % i === 0) divisors.push(i);
  }
  return divisors;
}

// Snap a value to the nearest divisor of n (for perfect grid tiling)
function snapToDivisor(value, n, min, max) {
  const divisors = getDivisors(n, min, max);
  if (divisors.length === 0) return value; // fallback

  // Find the closest divisor
  let closest = divisors[0];
  let minDist = Math.abs(value - closest);

  for (const d of divisors) {
    const dist = Math.abs(value - d);
    if (dist < minDist) {
      minDist = dist;
      closest = d;
    }
  }

  return closest;
}

// Generate cell dimensions that perfectly fill the canvas
function generateCellDimensions(width, height, padding, seed) {
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Find valid cell widths and heights (divisors that give reasonable grid)
  const validWidths = getDivisors(innerW, CELL_MIN, CELL_MAX);
  const validHeights = getDivisors(innerH, CELL_MIN, CELL_MAX);

  // Fallback if no perfect divisors found
  if (validWidths.length === 0) validWidths.push(8);
  if (validHeights.length === 0) validHeights.push(12);

  const rng = seededRandom(seed + 9999);

  // Build valid pairs that satisfy aspect ratio constraint
  const validPairs = [];
  for (const w of validWidths) {
    for (const h of validHeights) {
      const ratio = Math.max(w / h, h / w);
      if (ratio <= CELL_ASPECT_MAX) {
        validPairs.push({ w, h });
      }
    }
  }

  // Fallback if no valid pairs (shouldn't happen with reasonable constraints)
  if (validPairs.length === 0) {
    return { cellW: 8, cellH: 12 };
  }

  // Sort pairs by size (w * h) for biased selection
  validPairs.sort((a, b) => a.w * a.h - b.w * b.h);

  // Bias selection based on seed - some seeds get tiny cells, some get large
  const sizeBias = rng();
  let pair;

  if (sizeBias < 0.25) {
    // Small cells (fine detail) - pick from bottom 25%
    const idx = Math.floor(rng() * Math.ceil(validPairs.length * 0.25));
    pair = validPairs[idx];
  } else if (sizeBias > 0.75) {
    // Large cells (coarse/chunky) - pick from top 25%
    const startIdx = Math.floor(validPairs.length * 0.75);
    const idx = startIdx + Math.floor(rng() * (validPairs.length - startIdx));
    pair = validPairs[idx];
  } else {
    // Random from full range
    pair = validPairs[Math.floor(rng() * validPairs.length)];
  }

  return { cellW: pair.w, cellH: pair.h };
}

// Generate render mode from seed
// Modes: 'normal', 'binary', 'inverted', 'sparse', 'dense'
function generateRenderMode(seed) {
  const rng = seededRandom(seed + 5555);
  const roll = rng();

  if (roll < 0.35) return "normal"; // 35% - classic 4-level shading
  if (roll < 0.5) return "binary"; // 15% - only empty or full
  if (roll < 0.65) return "inverted"; // 15% - flip density meaning
  if (roll < 0.8) return "sparse"; // 15% - show only light touches
  return "dense"; // 20% - show only heavy hits
}

// Generate weight range for creases
// Different outputs have different "pressure" characteristics
function generateWeightRange(seed) {
  const rng = seededRandom(seed + 7777);
  const style = rng();

  if (style < 0.25) {
    // Light touch - all creases gentle
    const base = 0.2 + rng() * 0.3; // 0.2-0.5
    return { min: base, max: base + 0.2 + rng() * 0.3 };
  } else if (style < 0.5) {
    // Heavy hand - all creases deep
    const base = 1.2 + rng() * 0.5; // 1.2-1.7
    return { min: base, max: base + 0.3 + rng() * 0.5 };
  } else if (style < 0.75) {
    // High contrast - mix of light and heavy
    return { min: 0.2 + rng() * 0.2, max: 1.5 + rng() * 0.8 };
  } else {
    // Balanced - moderate range
    return { min: 0.5 + rng() * 0.3, max: 1.0 + rng() * 0.5 };
  }
}

// Generate fold strategy - determines spatial distribution of creases
// Different strategies create fundamentally different patterns at high fold counts
function generateFoldStrategy(seed) {
  const rng = seededRandom(seed + 6666);
  const roll = rng();

  if (roll < 0.16) {
    // Horizontal - creases run mostly left-right
    return { type: "horizontal", jitter: 3 + rng() * 12 };
  }
  if (roll < 0.32) {
    // Vertical - creases run mostly top-bottom
    return { type: "vertical", jitter: 3 + rng() * 12 };
  }
  if (roll < 0.44) {
    // Diagonal - creases at ~45° or ~135°
    const angle = rng() < 0.5 ? 45 : 135;
    return { type: "diagonal", angle: angle, jitter: 5 + rng() * 15 };
  }
  if (roll < 0.56) {
    // Radial - creases emanate from a focal point
    return {
      type: "radial",
      focalX: 0.2 + rng() * 0.6,
      focalY: 0.2 + rng() * 0.6,
    };
  }
  if (roll < 0.68) {
    // Grid - alternating horizontal and vertical
    return { type: "grid", jitter: 3 + rng() * 10 };
  }
  if (roll < 0.8) {
    // Clustered - folds concentrate in a region
    return {
      type: "clustered",
      clusterX: 0.15 + rng() * 0.7,
      clusterY: 0.15 + rng() * 0.7,
      spread: 0.2 + rng() * 0.4,
    };
  }
  // Random - original chaotic behavior
  return { type: "random" };
}

// Generate multi-color palette for intersection levels
// Returns array of 4 colors: [empty, light, medium, dense]
// Works within the same constrained system as main palette
function generateMultiColorPalette(seed, bgColor, textColor) {
  const rng = seededRandom(seed + 3333);
  const bgHsl = hexToHsl(bgColor);
  const textHsl = hexToHsl(textColor);
  const isLightBg = bgHsl.l > 50;

  // Determine base saturation from text color
  const baseSat = textHsl.s;
  let satBand;
  if (baseSat < 25) satBand = SAT_BANDS.whisper;
  else if (baseSat < 45) satBand = SAT_BANDS.muted;
  else if (baseSat < 65) satBand = SAT_BANDS.moderate;
  else if (baseSat < 85) satBand = SAT_BANDS.rich;
  else satBand = SAT_BANDS.vivid;

  const strategy = rng();

  if (strategy < 0.5) {
    // Value gradient within same hue zone - most cohesive
    const baseHue = textHsl.h;
    const hueVariation = 8 + rng() * 12; // subtle hue shift

    if (isLightBg) {
      // Light bg: colors go from light/muted to dark/saturated
      return [
        hslToHex(
          baseHue - hueVariation,
          pickInRange(rng, satBand) * 0.5,
          75 + rng() * 15
        ),
        hslToHex(
          baseHue - hueVariation * 0.5,
          pickInRange(rng, satBand) * 0.7,
          55 + rng() * 12
        ),
        hslToHex(baseHue, pickInRange(rng, satBand) * 0.9, 38 + rng() * 12),
        hslToHex(
          baseHue + hueVariation,
          pickInRange(rng, satBand),
          22 + rng() * 12
        ),
      ];
    } else {
      // Dark bg: colors go from dark/muted to light/saturated
      return [
        hslToHex(
          baseHue - hueVariation,
          pickInRange(rng, satBand) * 0.5,
          25 + rng() * 12
        ),
        hslToHex(
          baseHue - hueVariation * 0.5,
          pickInRange(rng, satBand) * 0.7,
          42 + rng() * 12
        ),
        hslToHex(baseHue, pickInRange(rng, satBand) * 0.9, 58 + rng() * 12),
        hslToHex(
          baseHue + hueVariation,
          pickInRange(rng, satBand),
          72 + rng() * 15
        ),
      ];
    }
  } else if (strategy < 0.8) {
    // Analogous journey - stays in same temperature
    const baseHue = textHsl.h;
    const shift = 18 + rng() * 25;
    const direction = rng() > 0.5 ? 1 : -1;

    const hues = [
      baseHue,
      (baseHue + direction * shift + 360) % 360,
      (baseHue + direction * shift * 2 + 360) % 360,
      (baseHue + direction * shift * 2.5 + 360) % 360,
    ];

    if (isLightBg) {
      return [
        hslToHex(hues[0], pickInRange(rng, satBand) * 0.6, 72 + rng() * 15),
        hslToHex(hues[1], pickInRange(rng, satBand) * 0.75, 52 + rng() * 12),
        hslToHex(hues[2], pickInRange(rng, satBand) * 0.9, 38 + rng() * 10),
        hslToHex(hues[3], pickInRange(rng, satBand), 24 + rng() * 10),
      ];
    } else {
      return [
        hslToHex(hues[0], pickInRange(rng, satBand) * 0.6, 28 + rng() * 12),
        hslToHex(hues[1], pickInRange(rng, satBand) * 0.75, 45 + rng() * 12),
        hslToHex(hues[2], pickInRange(rng, satBand) * 0.9, 60 + rng() * 12),
        hslToHex(hues[3], pickInRange(rng, satBand), 75 + rng() * 15),
      ];
    }
  } else {
    // Split complement - more tension but still structured
    const baseHue = textHsl.h;
    const complement = (baseHue + 180) % 360;
    const split1 = (complement - 30 + 360) % 360;
    const split2 = (complement + 30) % 360;

    const hues = [baseHue, split1, split2, complement];

    if (isLightBg) {
      return [
        hslToHex(hues[0], pickInRange(rng, satBand) * 0.5, 70 + rng() * 15),
        hslToHex(hues[1], pickInRange(rng, satBand) * 0.7, 50 + rng() * 12),
        hslToHex(hues[2], pickInRange(rng, satBand) * 0.85, 38 + rng() * 10),
        hslToHex(hues[3], pickInRange(rng, satBand), 25 + rng() * 10),
      ];
    } else {
      return [
        hslToHex(hues[0], pickInRange(rng, satBand) * 0.5, 30 + rng() * 12),
        hslToHex(hues[1], pickInRange(rng, satBand) * 0.7, 48 + rng() * 12),
        hslToHex(hues[2], pickInRange(rng, satBand) * 0.85, 62 + rng() * 12),
        hslToHex(hues[3], pickInRange(rng, satBand), 75 + rng() * 15),
      ];
    }
  }
}

// Determine if multi-color should be enabled for this seed
function generateMultiColorEnabled(seed) {
  const rng = seededRandom(seed + 4444);
  return rng() < 0.25; // 25% chance
}

// Calculate adaptive thresholds based on actual intersection distribution
// Returns thresholds object: { t1, t2, t3 } where:
//   0 → level 0, 1 to t1 → level 1, t1+1 to t2 → level 2, t2+1+ → level 3
function calculateAdaptiveThresholds(cellWeights) {
  // Get all non-zero weights
  const weights = Object.values(cellWeights).filter((c) => c > 0);

  if (weights.length === 0) {
    // No intersections at all - use minimal thresholds
    return { t1: 1, t2: 2, t3: 3, tExtreme: 999 };
  }

  // Sort to find percentiles
  weights.sort((a, b) => a - b);

  const percentile = (arr, p) => {
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  // Level 1 (▒): bottom 40% of non-zero weights
  // Level 2 (▓): 40th to 85th percentile
  // Level 3 (█): top 15% (rare)
  // Extreme (inverted): top 3% - transcends the palette
  const t1 = percentile(weights, 0.4);
  const t2 = percentile(weights, 0.85);
  const t3 = percentile(weights, 0.85) + 1; // anything above t2
  const tExtreme = percentile(weights, 0.97); // top 3%

  // Ensure thresholds are distinct
  return {
    t1: Math.max(0.01, t1),
    t2: Math.max(t1 + 0.01, t2),
    t3: Math.max(t2 + 0.01, t3),
    tExtreme: Math.max(t3 + 0.01, tExtreme),
  };
}

// Map weight to level using adaptive thresholds
function countToLevelAdaptive(weight, thresholds) {
  if (weight === 0) return 0;
  if (weight <= thresholds.t1) return 1;
  if (weight <= thresholds.t2) return 2;
  return 3;
}

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

const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  len: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
  dist: (a, b) => V.len(V.sub(a, b)),
  norm: (v) => {
    const l = V.len(v);
    return l > 0.0001 ? V.scale(v, 1 / l) : { x: 0, y: 0 };
  },
  perp: (v) => ({ x: -v.y, y: v.x }),
  mid: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
  copy: (v) => ({ x: v.x, y: v.y }),
  eq: (a, b) => V.dist(a, b) < 0.5,
};

// Segment intersection
function segmentIntersect(a1, a2, b1, b2) {
  const d1 = V.sub(a2, a1);
  const d2 = V.sub(b2, b1);
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 0.0001) return null;

  const dp = V.sub(b1, a1);
  const t = (dp.x * d2.y - dp.y * d2.x) / cross;
  const u = (dp.x * d1.y - dp.y * d1.x) / cross;

  if (t >= 0.001 && t <= 0.999 && u >= 0.001 && u <= 0.999) {
    return { point: V.add(a1, V.scale(d1, t)), t, u };
  }
  return null;
}

// Clip line to rectangle
function clipToRect(point, dir, w, h) {
  const edges = [
    { p: { x: 0, y: 0 }, d: { x: 1, y: 0 }, max: w },
    { p: { x: w, y: 0 }, d: { x: 0, y: 1 }, max: h },
    { p: { x: 0, y: h }, d: { x: 1, y: 0 }, max: w },
    { p: { x: 0, y: 0 }, d: { x: 0, y: 1 }, max: h },
  ];

  const hits = [];

  for (const edge of edges) {
    const cross = dir.x * edge.d.y - dir.y * edge.d.x;
    if (Math.abs(cross) < 0.0001) continue;

    const dp = V.sub(edge.p, point);
    const t = (dp.x * edge.d.y - dp.y * edge.d.x) / cross;
    const hit = V.add(point, V.scale(dir, t));

    const edgeT = V.dot(V.sub(hit, edge.p), edge.d);
    if (edgeT >= -0.001 && edgeT <= edge.max + 0.001) {
      hit.x = Math.max(0, Math.min(w, hit.x));
      hit.y = Math.max(0, Math.min(h, hit.y));

      if (!hits.some((h) => V.dist(h, hit) < 0.5)) {
        hits.push(hit);
      }
    }
  }

  if (hits.length >= 2) {
    hits.sort(
      (a, b) => V.dot(V.sub(a, point), dir) - V.dot(V.sub(b, point), dir)
    );
    return { p1: hits[0], p2: hits[hits.length - 1] };
  }
  return null;
}

// ============ POLYGON UTILITIES ============

// Union of two convex polygons that share an edge (the crease line)
// Returns the combined silhouette
function polygonUnionAlongCrease(poly1, poly2, creaseP1, creaseP2) {
  // Find points on each polygon that are on the crease line
  const onCrease = (p) => {
    const dx = creaseP2.x - creaseP1.x;
    const dy = creaseP2.y - creaseP1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.0001) return false;

    // Distance from point to line
    const cross = Math.abs((p.x - creaseP1.x) * dy - (p.y - creaseP1.y) * dx);
    return cross / Math.sqrt(len2) < 1;
  };

  // Get vertices NOT on the crease for each polygon
  const outer1 = poly1.filter((p) => !onCrease(p));
  const outer2 = poly2.filter((p) => !onCrease(p));

  // If either is empty, return the other
  if (outer1.length === 0) return poly2.slice();
  if (outer2.length === 0) return poly1.slice();

  // Combine all vertices and compute convex hull
  // (This works because both polygons are convex and share an edge)
  const allPoints = [...poly1, ...poly2];
  return convexHull(allPoints);
}

// Convex hull using Graham scan
function convexHull(points) {
  if (points.length < 3) return points.slice();

  // Find bottom-most point (or left-most in case of tie)
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i].y < points[start].y ||
      (points[i].y === points[start].y && points[i].x < points[start].x)
    ) {
      start = i;
    }
  }

  const startPoint = points[start];

  // Sort by polar angle
  const sorted = points.slice().sort((a, b) => {
    const angleA = Math.atan2(a.y - startPoint.y, a.x - startPoint.x);
    const angleB = Math.atan2(b.y - startPoint.y, b.x - startPoint.x);
    if (Math.abs(angleA - angleB) < 0.0001) {
      // Same angle - sort by distance
      const distA = (a.x - startPoint.x) ** 2 + (a.y - startPoint.y) ** 2;
      const distB = (b.x - startPoint.x) ** 2 + (b.y - startPoint.y) ** 2;
      return distA - distB;
    }
    return angleA - angleB;
  });

  // Remove duplicates
  const unique = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = unique[unique.length - 1];
    if (
      Math.abs(sorted[i].x - prev.x) > 0.5 ||
      Math.abs(sorted[i].y - prev.y) > 0.5
    ) {
      unique.push(sorted[i]);
    }
  }

  if (unique.length < 3) return unique;

  // Graham scan
  const hull = [unique[0], unique[1]];

  const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  for (let i = 2; i < unique.length; i++) {
    while (
      hull.length > 1 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], unique[i]) <= 0
    ) {
      hull.pop();
    }
    hull.push(unique[i]);
  }

  return hull;
}

// Split polygon by a line, returning the two halves
function splitPolygon(polygon, lineP1, lineP2) {
  if (polygon.length < 3) return { left: [], right: [] };

  const left = [];
  const right = [];

  // Line equation: ax + by + c = 0
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;
  const a = -dy;
  const b = dx;
  const c = -(a * lineP1.x + b * lineP1.y);

  const side = (p) => a * p.x + b * p.y + c;

  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currSide = side(curr);
    const nextSide = side(next);

    if (currSide <= 0) left.push({ x: curr.x, y: curr.y });
    if (currSide >= 0) right.push({ x: curr.x, y: curr.y });

    // Check for intersection
    if ((currSide < 0 && nextSide > 0) || (currSide > 0 && nextSide < 0)) {
      const t = currSide / (currSide - nextSide);
      const intersect = {
        x: curr.x + t * (next.x - curr.x),
        y: curr.y + t * (next.y - curr.y),
      };
      left.push(intersect);
      right.push({ x: intersect.x, y: intersect.y });
    }
  }

  return { left, right };
}

// Reflect a point across a line
function reflectPoint(point, lineP1, lineP2) {
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return { x: point.x, y: point.y };

  // Vector from lineP1 to point
  const px = point.x - lineP1.x;
  const py = point.y - lineP1.y;

  // Project onto line
  const t = (px * dx + py * dy) / len2;
  const projX = lineP1.x + t * dx;
  const projY = lineP1.y + t * dy;

  // Reflect
  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
  };
}

// Reflect a polygon across a line
function reflectPolygon(polygon, lineP1, lineP2) {
  return polygon.map((p) => reflectPoint(p, lineP1, lineP2));
}

// Get bounding box of polygon
function polygonBounds(polygon) {
  if (polygon.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

// Scale and center polygon to fit canvas
function normalizePolygon(polygon, targetWidth, targetHeight, padding = 0) {
  if (polygon.length < 3) return polygon;

  const bounds = polygonBounds(polygon);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;

  if (w < 0.001 || h < 0.001) return polygon;

  const availW = targetWidth - padding * 2;
  const availH = targetHeight - padding * 2;
  const scale = Math.min(availW / w, availH / h);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const targetCenterX = targetWidth / 2;
  const targetCenterY = targetHeight / 2;

  return polygon.map((p) => ({
    x: (p.x - centerX) * scale + targetCenterX,
    y: (p.y - centerY) * scale + targetCenterY,
  }));
}

// Polygon area (signed - positive if CCW, negative if CW)
function polygonAreaSigned(polygon) {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

function polygonArea(polygon) {
  return Math.abs(polygonAreaSigned(polygon));
}

// Polygon intersection using Sutherland-Hodgman algorithm
// Works for convex clipping polygon
function polygonIntersection(subject, clip) {
  if (subject.length < 3 || clip.length < 3) return [];

  let output = subject.slice();

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];

    const input = output;
    output = [];

    const edgeP1 = clip[i];
    const edgeP2 = clip[(i + 1) % clip.length];

    // Edge vector
    const edgeDx = edgeP2.x - edgeP1.x;
    const edgeDy = edgeP2.y - edgeP1.y;

    // Inside test: point is on left side of edge (assuming CCW winding)
    const isInside = (p) => {
      return edgeDx * (p.y - edgeP1.y) - edgeDy * (p.x - edgeP1.x) >= 0;
    };

    // Line intersection
    const intersect = (p1, p2) => {
      const d1x = p2.x - p1.x;
      const d1y = p2.y - p1.y;
      const d2x = edgeP2.x - edgeP1.x;
      const d2y = edgeP2.y - edgeP1.y;

      const cross = d1x * d2y - d1y * d2x;
      if (Math.abs(cross) < 0.0001) return p1; // parallel

      const t = ((edgeP1.x - p1.x) * d2y - (edgeP1.y - p1.y) * d2x) / cross;
      return {
        x: p1.x + t * d1x,
        y: p1.y + t * d1y,
      };
    };

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const next = input[(j + 1) % input.length];

      const currentInside = isInside(current);
      const nextInside = isInside(next);

      if (currentInside) {
        if (nextInside) {
          // Both inside: add next
          output.push({ x: next.x, y: next.y });
        } else {
          // Current inside, next outside: add intersection
          output.push(intersect(current, next));
        }
      } else {
        if (nextInside) {
          // Current outside, next inside: add intersection, then next
          output.push(intersect(current, next));
          output.push({ x: next.x, y: next.y });
        }
        // Both outside: add nothing
      }
    }
  }

  return output;
}

// Ensure polygon has CCW winding
function ensureCCW(polygon) {
  if (polygon.length < 3) return polygon;
  if (polygonAreaSigned(polygon) < 0) {
    return polygon.slice().reverse();
  }
  return polygon;
}

// Clip a line to a convex polygon, returning the segment inside (or null)
function clipLineToPolygon(lineP1, lineP2, polygon) {
  if (polygon.length < 3) return null;

  let tMin = 0;
  let tMax = 1;

  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;

  for (let i = 0; i < polygon.length; i++) {
    const edgeP1 = polygon[i];
    const edgeP2 = polygon[(i + 1) % polygon.length];

    // Edge normal (pointing inward for CCW polygon)
    const nx = edgeP2.y - edgeP1.y;
    const ny = edgeP1.x - edgeP2.x;

    // Vector from edge start to line start
    const wx = lineP1.x - edgeP1.x;
    const wy = lineP1.y - edgeP1.y;

    const denom = nx * dx + ny * dy;
    const numer = -(nx * wx + ny * wy);

    if (Math.abs(denom) < 0.0001) {
      // Line parallel to edge
      if (numer < 0) return null; // Outside
    } else {
      const t = numer / denom;
      if (denom < 0) {
        // Entering
        tMin = Math.max(tMin, t);
      } else {
        // Leaving
        tMax = Math.min(tMax, t);
      }
      if (tMin > tMax) return null;
    }
  }

  return {
    p1: { x: lineP1.x + tMin * dx, y: lineP1.y + tMin * dy },
    p2: { x: lineP1.x + tMax * dx, y: lineP1.y + tMax * dy },
  };
}

// Get edges of polygon for target picking
function polygonEdges(polygon) {
  const edges = [];
  for (let i = 0; i < polygon.length; i++) {
    edges.push({
      p1: polygon[i],
      p2: polygon[(i + 1) % polygon.length],
    });
  }
  return edges;
}

// Helper: weighted random index selection
function weightedRandomIndex(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ============ TRUE FOLD SIMULATION ============

function simulateFolds(
  width,
  height,
  numFolds,
  seed,
  weightRange = { min: 0.5, max: 1.5 },
  strategyOverride = null
) {
  // Defensive: ensure valid dimensions
  if (!width || !height || width <= 0 || height <= 0) {
    return { creases: [], finalShape: [] };
  }

  const strategy = strategyOverride || generateFoldStrategy(seed);

  // Start with rectangle
  let shape = ensureCCW([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]);

  const creases = [];

  // If no folds requested, return initial state
  if (!numFolds || numFolds <= 0) {
    return { creases: [], finalShape: shape };
  }

  let currentSeed = seed;

  // RNG for weights
  const weightRng = seededRandom(seed + 8888);

  // Seed-based frequencies for smooth offset drift
  const freqRng = seededRandom(seed + 3333);
  const freqX = 0.05 + freqRng() * 0.15; // How fast X offset oscillates
  const freqY = 0.05 + freqRng() * 0.15; // How fast Y offset oscillates
  const phaseX = freqRng() * Math.PI * 2; // Starting phase
  const phaseY = freqRng() * Math.PI * 2;

  for (let f = 0; f < numFolds; f++) {
    if (!shape || shape.length < 3) break;

    const rng = seededRandom(currentSeed);

    // Normalize shape periodically to keep geometry stable
    if (f > 0 && f % 5 === 0) {
      shape = normalizePolygon(shape, width, height, 0);
      shape = ensureCCW(shape);
    }

    // Get current shape bounds
    const currentBounds = polygonBounds(shape);
    const currentW = currentBounds.maxX - currentBounds.minX;
    const currentH = currentBounds.maxY - currentBounds.minY;

    // Pick source vertex from current shape
    const fromIdx = Math.floor(rng() * shape.length);
    const fromVertex = shape[fromIdx];

    // Pick target - another vertex or point on edge
    const targetOptions = [];

    // Other vertices
    for (let i = 0; i < shape.length; i++) {
      if (i === fromIdx) continue;
      targetOptions.push(shape[i]);
    }

    // Points on edges
    for (let i = 0; i < shape.length; i++) {
      const p1 = shape[i];
      const p2 = shape[(i + 1) % shape.length];
      const t = 0.2 + rng() * 0.6;
      targetOptions.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }

    // Pick random target
    const target = targetOptions[Math.floor(rng() * targetOptions.length)];

    // Skip if too close
    const dist = V.dist(fromVertex, target);
    const minDist = Math.min(currentW, currentH) * 0.05;
    if (dist < minDist) {
      currentSeed = hashSeed(currentSeed, "skip" + f);
      continue;
    }

    // Crease = perpendicular bisector of source→target
    const mid = V.mid(fromVertex, target);
    const toTarget = V.norm(V.sub(target, fromVertex));
    const creaseDir = V.perp(toTarget);

    // Extend crease line
    const extent = Math.max(currentW, currentH) * 3;
    const lineP1 = {
      x: mid.x - creaseDir.x * extent,
      y: mid.y - creaseDir.y * extent,
    };
    const lineP2 = {
      x: mid.x + creaseDir.x * extent,
      y: mid.y + creaseDir.y * extent,
    };

    // Split shape along crease
    const { left, right } = splitPolygon(shape, lineP1, lineP2);

    if (left.length < 3 || right.length < 3) {
      currentSeed = hashSeed(currentSeed, "badsplit" + f);
      continue;
    }

    // Determine which side to fold
    const leftHasSource = left.some((p) => V.dist(p, fromVertex) < 1);

    const foldingSide = leftHasSource ? left : right;
    const stayingSide = leftHasSource ? right : left;

    // Reflect the folding side across the crease
    const reflected = reflectPolygon(foldingSide, lineP1, lineP2);

    // New shape = UNION (correct fold behavior)
    const stayingCCW = ensureCCW(stayingSide);
    const reflectedCCW = ensureCCW(reflected);

    let newShape = polygonUnionAlongCrease(
      stayingCCW,
      reflectedCCW,
      lineP1,
      lineP2
    );

    if (newShape.length < 3) {
      currentSeed = hashSeed(currentSeed, "badunion" + f);
      continue;
    }

    // Smooth offset drift using sine waves - no hard resets
    // Amplitude increases slightly with fold count for more spread at high counts
    const amplitude = 0.3 + (f / numFolds) * 0.2;
    const offsetX = Math.sin(f * freqX + phaseX) * width * amplitude;
    const offsetY = Math.sin(f * freqY + phaseY) * height * amplitude;

    // Clip crease to full canvas
    const canvasCrease = clipToRect(
      { x: mid.x + offsetX, y: mid.y + offsetY },
      creaseDir,
      width,
      height
    );

    if (canvasCrease) {
      const weight =
        weightRange.min + weightRng() * (weightRange.max - weightRange.min);
      creases.push({
        p1: V.copy(canvasCrease.p1),
        p2: V.copy(canvasCrease.p2),
        depth: creases.length,
        weight: weight,
      });
    }

    shape = ensureCCW(newShape);
    currentSeed = hashSeed(currentSeed, "fold" + f);
  }

  // Normalize final shape to fit canvas for display
  shape = normalizePolygon(shape, width, height, 0);
  shape = ensureCCW(shape);

  return { creases, finalShape: shape };
}

// Pick source vertex from shape vertices
function pickSourceVertexFromShape(shape, strategy, width, height, rng) {
  if (!shape || shape.length === 0) return 0;

  if (strategy.type === "clustered") {
    const cx = strategy.clusterX * width;
    const cy = strategy.clusterY * height;
    const spread = strategy.spread * Math.max(width, height);

    let weights = shape.map((v) => {
      const dist = V.dist(v, { x: cx, y: cy });
      return Math.exp(-dist / spread);
    });

    return weightedRandomIndex(weights, rng);
  }

  // Default: uniform random
  return Math.floor(rng() * shape.length);
}

// Pick target from shape (other vertices or points on edges)
function pickTargetFromShape(
  shape,
  fromIdx,
  strategy,
  width,
  height,
  rng,
  foldIndex
) {
  if (!shape || shape.length < 2) return null;
  if (fromIdx < 0 || fromIdx >= shape.length) return null;

  const from = shape[fromIdx];
  if (!from) return null;

  const targets = [];

  // Other vertices
  for (let i = 0; i < shape.length; i++) {
    if (i === fromIdx) continue;
    const dist = V.dist(from, shape[i]);
    if (dist > 5) {
      targets.push({ point: shape[i], baseWeight: 2 });
    }
  }

  // Points on edges
  const edges = polygonEdges(shape);
  for (const edge of edges) {
    const t = 0.2 + rng() * 0.6;
    const point = V.lerp(edge.p1, edge.p2, t);
    if (V.dist(from, point) > 5) {
      targets.push({ point, baseWeight: 1 });
    }
  }

  if (targets.length === 0) return null;

  // Apply strategy weighting
  const maxDeviation = (15 * Math.PI) / 180;

  const weightedTargets = targets.map((t) => {
    const dir = V.norm(V.sub(t.point, from));
    const creaseAngle = Math.atan2(dir.x, -dir.y);

    let dominated = false;
    let strategyWeight = 1;

    if (strategy.type === "horizontal") {
      const deviation = Math.abs(Math.sin(creaseAngle));
      const deviationAngle = Math.asin(Math.min(1, deviation));
      if (deviationAngle <= maxDeviation) {
        dominated = true;
        strategyWeight = 10;
      } else {
        strategyWeight = 0.01;
      }
    } else if (strategy.type === "vertical") {
      const deviation = Math.abs(Math.cos(creaseAngle));
      const deviationAngle = Math.acos(
        Math.max(-1, Math.min(1, Math.abs(Math.sin(creaseAngle))))
      );
      if (deviationAngle <= maxDeviation) {
        dominated = true;
        strategyWeight = 10;
      } else {
        strategyWeight = 0.01;
      }
    } else if (strategy.type === "diagonal") {
      const targetAngle = (strategy.angle * Math.PI) / 180;
      const diff1 = Math.abs(creaseAngle - targetAngle);
      const diff2 = Math.abs(creaseAngle - targetAngle + Math.PI);
      const diff3 = Math.abs(creaseAngle - targetAngle - Math.PI);
      const minDiff = Math.min(diff1, diff2, diff3);
      if (minDiff <= maxDeviation) {
        dominated = true;
        strategyWeight = 10;
      } else {
        strategyWeight = 0.01;
      }
    } else if (strategy.type === "radial") {
      const focal = { x: strategy.focalX * width, y: strategy.focalY * height };
      const mid = V.mid(from, t.point);
      const toFocal = V.sub(focal, mid);
      const distToLine = Math.abs(V.dot(toFocal, dir));
      const maxDist = Math.sqrt(width * width + height * height) * 0.15;
      if (distToLine <= maxDist) {
        dominated = true;
        strategyWeight = 10;
      } else {
        strategyWeight = Math.exp(-distToLine / maxDist) + 0.01;
      }
    } else if (strategy.type === "grid") {
      const preferHorizontal = foldIndex % 2 === 0;
      if (preferHorizontal) {
        const deviation = Math.abs(Math.sin(creaseAngle));
        const deviationAngle = Math.asin(Math.min(1, deviation));
        if (deviationAngle <= maxDeviation) {
          dominated = true;
          strategyWeight = 10;
        } else {
          strategyWeight = 0.01;
        }
      } else {
        const deviation = Math.abs(Math.cos(creaseAngle));
        const deviationAngle = Math.acos(
          Math.max(-1, Math.min(1, Math.abs(Math.sin(creaseAngle))))
        );
        if (deviationAngle <= maxDeviation) {
          dominated = true;
          strategyWeight = 10;
        } else {
          strategyWeight = 0.01;
        }
      }
    } else if (strategy.type === "clustered") {
      const cx = strategy.clusterX * width;
      const cy = strategy.clusterY * height;
      const spread = strategy.spread * Math.max(width, height);
      const dist = V.dist(t.point, { x: cx, y: cy });
      strategyWeight = Math.exp(-dist / spread) * 3 + 0.1;
      dominated = dist < spread;
    }

    return {
      point: t.point,
      weight: t.baseWeight * strategyWeight,
      dominated,
    };
  });

  const dominatedTargets = weightedTargets.filter((t) => t.dominated);
  const pool = dominatedTargets.length > 0 ? dominatedTargets : weightedTargets;

  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return targets[0].point;

  let r = rng() * totalWeight;
  for (const t of pool) {
    r -= t.weight;
    if (r <= 0) return t.point;
  }

  return pool[pool.length - 1].point;
}

// Find all intersections between creases
function findIntersections(creases) {
  const intersections = [];

  for (let i = 0; i < creases.length; i++) {
    for (let j = i + 1; j < creases.length; j++) {
      const hit = segmentIntersect(
        creases[i].p1,
        creases[i].p2,
        creases[j].p1,
        creases[j].p2
      );
      if (hit) {
        // Combined weight is sum of both crease weights
        const weight1 = creases[i].weight || 1;
        const weight2 = creases[j].weight || 1;

        intersections.push({
          x: hit.point.x,
          y: hit.point.y,
          depth1: creases[i].depth,
          depth2: creases[j].depth,
          gap: Math.abs(creases[j].depth - creases[i].depth),
          weight: weight1 + weight2,
        });
      }
    }
  }

  return intersections;
}

// Simple crease processing - just find intersections and build cell weights
function processCreases(creases, gridCols, gridRows, cellWidth, cellHeight) {
  const intersections = findIntersections(creases);

  // Build cell weights and gaps
  const cellWeights = {};
  const cellMaxGap = {};

  for (const inter of intersections) {
    const col = Math.floor(inter.x / cellWidth);
    const row = Math.floor(inter.y / cellHeight);
    if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
      const key = `${col},${row}`;
      cellWeights[key] = (cellWeights[key] || 0) + inter.weight;
      cellMaxGap[key] = Math.max(cellMaxGap[key] || 0, inter.gap);
    }
  }

  return {
    activeCreases: creases,
    intersections,
    cellWeights,
    cellMaxGap,
    destroyed: 0,
  };
}

// Render a token to a canvas and return as data URL
function renderTokenToCanvas(tokenId, outputWidth = 540, outputHeight = 700) {
  const folds = tokenId;
  const seed = tokenId;

  // Generate all params from seed
  const palette = generatePalette(seed);
  const cells = generateCellDimensions(outputWidth, outputHeight, 0, seed);
  const renderModeVal = generateRenderMode(seed);
  const multiColorEnabled = generateMultiColorEnabled(seed);
  const levelColorsVal = multiColorEnabled
    ? generateMultiColorPalette(seed, palette.bg, palette.text)
    : null;

  return renderToCanvas({
    folds,
    seed,
    outputWidth,
    outputHeight,
    bgColor: palette.bg,
    textColor: palette.text,
    accentColor: palette.accent,
    cellWidth: cells.cellW,
    cellHeight: cells.cellH,
    renderMode: renderModeVal,
    multiColor: multiColorEnabled,
    levelColors: levelColorsVal,
  });
}

// Render with custom settings
function renderToCanvas({
  folds,
  seed,
  outputWidth,
  outputHeight,
  bgColor,
  textColor,
  accentColor,
  cellWidth,
  cellHeight,
  renderMode,
  multiColor,
  levelColors,
  foldStrategy = null,
}) {
  // Create canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = 2; // High res output

  canvas.width = outputWidth * dpr;
  canvas.height = outputHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  // Grid calculations
  const cols = Math.floor(outputWidth / cellWidth);
  const rows = Math.floor(outputHeight / cellHeight);

  // Generate weight range for this output
  const weightRange = generateWeightRange(seed);

  // Generate fold structure with weights
  const { creases, finalShape } = simulateFolds(
    outputWidth,
    outputHeight,
    folds,
    seed,
    weightRange,
    foldStrategy
  );

  // Process creases - find all intersections
  const {
    activeCreases,
    intersections: activeIntersections,
    cellWeights: intersectionWeight,
    cellMaxGap,
  } = processCreases(creases, cols, rows, cellWidth, cellHeight);

  // Font setup
  ctx.font = `${cellHeight - 2}px "Courier New", Courier, monospace`;
  ctx.textBaseline = "top";

  // Block shade characters
  const shadeChars = ["░", "▒", "▓", "█"];

  // Find accent cells
  const accentCells = new Set();
  if (Object.keys(cellMaxGap).length > 0) {
    const maxGap = Math.max(...Object.values(cellMaxGap));
    for (const [key, gap] of Object.entries(cellMaxGap)) {
      if (gap === maxGap) {
        accentCells.add(key);
      }
    }
  }

  // Calculate adaptive thresholds based on this output's weight distribution
  const thresholds = calculateAdaptiveThresholds(intersectionWeight);

  // Helper to get color based on level (for multiColor mode) - no breathing
  const getColorForLevel = (level, cellKey) => {
    if (multiColor && levelColors) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  // Draw character grid
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellWidth;
      const y = row * cellHeight;
      const key = `${col},${row}`;
      const weight = intersectionWeight[key] || 0;

      let char = null;
      let color = textColor;

      if (accentCells.has(key) && weight > 0) {
        char = shadeChars[2];
        color = accentColor;
      } else if (weight >= 10) {
        // EXTREME: 10+ intersections - extra hue shift based on weight only
        const extremeAmount = weight - 10;
        const baseShift = 30 + Math.min(extremeAmount * 15, 150);
        const baseHsl = hexToHsl(textColor);
        const newHue = (baseHsl.h + baseShift + 360) % 360;
        const newSat = Math.min(100, baseHsl.s + 20);
        const newLight = Math.min(85, baseHsl.l + 10);
        char = shadeChars[3];
        color = hslToHex(newHue, newSat, newLight);
      } else if (renderMode === "normal") {
        const level = countToLevelAdaptive(weight, thresholds);
        char = shadeChars[level];
        color = getColorForLevel(level, key);
      } else if (renderMode === "binary") {
        if (weight === 0) {
          char = shadeChars[0];
          color = getColorForLevel(0, key);
        } else {
          char = shadeChars[3];
          color = getColorForLevel(3, key);
        }
      } else if (renderMode === "inverted") {
        const level = 3 - countToLevelAdaptive(weight, thresholds);
        char = shadeChars[level];
        color = getColorForLevel(level, key);
      } else if (renderMode === "sparse") {
        const level = countToLevelAdaptive(weight, thresholds);
        if (level === 1) {
          char = shadeChars[1];
          color = getColorForLevel(1, key);
        }
      } else if (renderMode === "dense") {
        const level = countToLevelAdaptive(weight, thresholds);
        if (level >= 2) {
          char = shadeChars[level];
          color = getColorForLevel(level, key);
        } else if (weight === 0) {
          char = shadeChars[0];
          color = getColorForLevel(0, key);
        }
      }

      if (char) {
        ctx.fillStyle = color;
        ctx.fillText(char, x, y);
      }
    }
  }

  return canvas.toDataURL("image/png");
}

// ============ COMPONENT ============

function ASCIICanvas({
  width,
  height,
  folds,
  seed,
  bgColor,
  textColor,
  accentColor,
  cellWidth,
  cellHeight,
  padding,
  renderMode = "normal",
  multiColor = false,
  levelColors = null,
  foldStrategy = null,
  showCreases = false,
  showPaperShape = false,
  showHitCounts = false,
  onStatsUpdate = null,
}) {
  const canvasRef = useRef(null);

  // Character grid settings from props
  const charWidth = cellWidth;
  const charHeight = cellHeight;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const cols = Math.floor(innerWidth / charWidth);
  const rows = Math.floor(innerHeight / charHeight);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Generate weight range for this output
    const weightRange = generateWeightRange(seed);

    // Generate fold structure with weights (in inner area)
    const { creases, finalShape } = simulateFolds(
      innerWidth,
      innerHeight,
      folds,
      seed,
      weightRange,
      foldStrategy
    );

    // Process creases - find all intersections
    const {
      activeCreases,
      intersections: activeIntersections,
      cellWeights: intersectionWeight,
      cellMaxGap,
    } = processCreases(creases, cols, rows, charWidth, charHeight);

    // For rendering
    const creasesForRender = activeCreases;

    // Report stats to parent component
    if (onStatsUpdate) {
      onStatsUpdate({
        intersections: activeIntersections.length,
        creases: activeCreases.length,
        destroyed: 0,
      });
    }

    // Font setup
    ctx.font = `${charHeight - 2}px "Courier New", Courier, monospace`;
    ctx.textBaseline = "top";

    // Block shade characters by density
    const shadeChars = ["░", "▒", "▓", "█"];

    // Calculate adaptive thresholds based on this output's weight distribution
    const thresholds = calculateAdaptiveThresholds(intersectionWeight);

    // Find cells with maximum generation gap - where oldest meets newest
    const accentCells = new Set();
    if (Object.keys(cellMaxGap).length > 0) {
      const maxGap = Math.max(...Object.values(cellMaxGap));
      for (const [key, gap] of Object.entries(cellMaxGap)) {
        if (gap === maxGap) {
          accentCells.add(key);
        }
      }
    }

    // Draw character grid (offset by padding)

    // Special mode: show hit counts instead of shade characters
    if (showHitCounts) {
      // Use the UI background color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Size text to fit 2 digits comfortably (use ~40% of cell width)
      const fontSize = Math.floor(Math.min(charWidth * 0.45, charHeight * 0.7));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = padding + col * charWidth + charWidth / 2;
          const y = padding + row * charHeight + charHeight / 2;
          const key = `${col},${row}`;
          const weight = intersectionWeight[key] || 0;

          if (weight > 0) {
            ctx.fillText(Math.round(weight).toString(), x, y);
          }
        }
      }

      // Reset text alignment
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    } else {
      // Normal rendering
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = padding + col * charWidth;
          const y = padding + row * charHeight;
          const key = `${col},${row}`;
          const weight = intersectionWeight[key] || 0;

          // Determine what to draw based on render mode
          let char = null;
          let color = textColor;

          // Helper to get color based on level (for multiColor mode) - no breathing
          const getColorForLevel = (level, cellKey) => {
            if (multiColor && levelColors) {
              return levelColors[Math.min(level, 3)];
            }
            return textColor;
          };

          if (accentCells.has(key) && weight > 0) {
            char = shadeChars[2];
            color = accentColor;
          } else if (weight >= 10) {
            // EXTREME: 10+ intersections - extra hue shift based on weight only
            const extremeAmount = weight - 10;
            const baseShift = 30 + Math.min(extremeAmount * 15, 150);
            const baseHsl = hexToHsl(textColor);
            const newHue = (baseHsl.h + baseShift + 360) % 360;
            const newSat = Math.min(100, baseHsl.s + 20);
            const newLight = Math.min(85, baseHsl.l + 10);
            char = shadeChars[3];
            color = hslToHex(newHue, newSat, newLight);
          } else if (renderMode === "normal") {
            const level = countToLevelAdaptive(weight, thresholds);
            char = shadeChars[level];
            color = getColorForLevel(level, key);
          } else if (renderMode === "binary") {
            if (weight === 0) {
              char = shadeChars[0];
              color = getColorForLevel(0, key);
            } else {
              char = shadeChars[3];
              color = getColorForLevel(3, key);
            }
          } else if (renderMode === "inverted") {
            const level = 3 - countToLevelAdaptive(weight, thresholds);
            char = shadeChars[level];
            color = getColorForLevel(level, key);
          } else if (renderMode === "sparse") {
            const level = countToLevelAdaptive(weight, thresholds);
            if (level === 1) {
              char = shadeChars[1];
              color = getColorForLevel(1, key);
            }
          } else if (renderMode === "dense") {
            const level = countToLevelAdaptive(weight, thresholds);
            if (level >= 2) {
              char = shadeChars[level];
              color = getColorForLevel(level, key);
            } else if (weight === 0) {
              char = shadeChars[0];
              color = getColorForLevel(0, key);
            }
          }

          if (char) {
            ctx.fillStyle = color;
            ctx.fillText(char, x, y);
          }
        }
      }
    } // end of else block for normal rendering

    // Draw crease lines if enabled (debug visualization)
    if (showCreases) {
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      for (const crease of creasesForRender) {
        ctx.beginPath();
        ctx.moveTo(padding + crease.p1.x, padding + crease.p1.y);
        ctx.lineTo(padding + crease.p2.x, padding + crease.p2.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Draw paper shape if enabled
    if (showPaperShape) {
      if (finalShape.length >= 3) {
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(padding + finalShape[0].x, padding + finalShape[0].y);
        for (let i = 1; i < finalShape.length; i++) {
          ctx.lineTo(padding + finalShape[i].x, padding + finalShape[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Also fill with low opacity
        ctx.fillStyle = "#00ffff";
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }, [
    width,
    height,
    folds,
    seed,
    cols,
    rows,
    charWidth,
    charHeight,
    bgColor,
    textColor,
    accentColor,
    innerWidth,
    innerHeight,
    padding,
    renderMode,
    multiColor,
    levelColors,
    foldStrategy,
    showCreases,
    showPaperShape,
    showHitCounts,
    onStatsUpdate,
  ]);

  return <canvas ref={canvasRef} />;
}

// Thumbnail component for grid view - derives all params from tokenId (fold count)
function TokenThumbnail({ tokenId, size = 150, onClick }) {
  // Use tokenId as seed for all random params
  const folds = tokenId;
  const seed = tokenId;

  const baseHeight = 700;
  const baseWidth = 540;
  const scale = size / baseHeight;
  const width = Math.round(baseWidth * scale);
  const height = size;

  // Generate palette, cell dimensions, render mode, and multi-color from seed
  const palette = generatePalette(seed);
  const cells = generateCellDimensions(baseWidth, baseHeight, 0, seed);
  const renderMode = generateRenderMode(seed);
  const multiColor = generateMultiColorEnabled(seed);
  const levelColors = multiColor
    ? generateMultiColorPalette(seed, palette.bg, palette.text)
    : null;

  // Scale cell dimensions
  const cellWidth = Math.max(2, Math.round(cells.cellW * scale));
  const cellHeight = Math.max(2, Math.round(cells.cellH * scale));

  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <ASCIICanvas
        width={width}
        height={height}
        folds={folds}
        seed={seed}
        bgColor={palette.bg}
        textColor={palette.text}
        accentColor={palette.accent}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        padding={0}
        renderMode={renderMode}
        multiColor={multiColor}
        levelColors={levelColors}
      />
      <span style={{ fontSize: 9, color: "#666" }}>#{tokenId}</span>
    </div>
  );
}

export default function FoldedPaper() {
  const [folds, setFolds] = useState(15);
  const [seed, setSeed] = useState(42);
  const [showUI, setShowUI] = useState(true);
  const [padding, setPadding] = useState(0);
  const [colorScheme, setColorScheme] = useState("generative");
  const [randomizeFolds, setRandomizeFolds] = useState(false);

  // Grid view state
  const [gridView, setGridView] = useState(false);
  const [gridCount, setGridCount] = useState(20);
  const [gridStart, setGridStart] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Download single token as PNG (uses current view settings)
  const downloadSingleToken = () => {
    const dataUrl = renderToCanvas({
      folds,
      seed,
      outputWidth: width,
      outputHeight: height,
      bgColor,
      textColor,
      accentColor,
      cellWidth,
      cellHeight,
      renderMode,
      multiColor,
      levelColors,
      foldStrategy,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `fold-${folds.toString().padStart(4, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download all tokens in grid as a zip file
  const downloadAllTokens = async () => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      // Load JSZip from CDN
      const JSZip = await new Promise((resolve, reject) => {
        if (window.JSZip) {
          resolve(window.JSZip);
          return;
        }
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        script.onload = () => resolve(window.JSZip);
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const zip = new JSZip();

      for (let i = 0; i < gridCount; i++) {
        const tokenId = gridStart + i;
        const dataUrl = renderTokenToCanvas(tokenId);

        // Convert data URL to blob
        const base64 = dataUrl.split(",")[1];
        zip.file(`fold-${tokenId.toString().padStart(4, "0")}.png`, base64, {
          base64: true,
        });

        setDownloadProgress(Math.round(((i + 1) / gridCount) * 100));

        // Small delay to let UI update
        await new Promise((r) => setTimeout(r, 10));
      }

      // Generate and download zip
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `folds-${gridStart}-to-${gridStart + gridCount - 1}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed: " + err.message);
    }

    setDownloading(false);
    setDownloadProgress(0);
  };

  // Canvas size (540 and 700 have many divisors for clean grid)
  const height = 700;
  const width = 540;

  // Initialize from generative palette and cell dimensions
  const initialPalette = generatePalette(42);
  const initialCells = generateCellDimensions(540, 700, 0, 42);
  const initialRenderMode = generateRenderMode(42);
  const initialMultiColor = generateMultiColorEnabled(42);
  const initialFoldStrategy = generateFoldStrategy(42);
  const [bgColor, setBgColor] = useState(initialPalette.bg);
  const [textColor, setTextColor] = useState(initialPalette.text);
  const [accentColor, setAccentColor] = useState(initialPalette.accent);
  const [cellWidth, setCellWidth] = useState(initialCells.cellW);
  const [cellHeight, setCellHeight] = useState(initialCells.cellH);
  const [renderMode, setRenderMode] = useState(initialRenderMode);
  const [multiColor, setMultiColor] = useState(initialMultiColor);
  const [levelColors, setLevelColors] = useState(
    initialMultiColor
      ? generateMultiColorPalette(42, initialPalette.bg, initialPalette.text)
      : null
  );
  const [foldStrategy, setFoldStrategy] = useState(initialFoldStrategy);
  const [strategyOverride, setStrategyOverride] = useState("auto"); // 'auto' or specific strategy type
  const [showCreases, setShowCreases] = useState(false); // Debug: show crease lines
  const [showPaperShape, setShowPaperShape] = useState(false); // Debug: show folded paper outline
  const [showHitCounts, setShowHitCounts] = useState(false); // Debug: show intersection counts per cell
  const [intersectionCount, setIntersectionCount] = useState(0); // Track intersection count from canvas
  const [creaseCount, setCreaseCount] = useState(0); // Track crease count from canvas

  // Preset palettes for reference/quick access: [name, background, text, accent]
  const presetPalettes = [
    ["cream", "#f4f1eb", "#1a1816", "#aa0000"],
    ["paper", "#ffffff", "#0000aa", "#ff0000"],
    ["ink", "#000000", "#0000aa", "#00aaff"],
    ["amber", "#ffd899", "#663300", "#0044aa"],
    ["blue/gold", "#002aff", "#a5a800", "#ffffff"],
    ["red/gold", "#ff0000", "#a5a800", "#ffffff"],
  ];

  // Handle palette change
  const handlePaletteChange = (scheme) => {
    setColorScheme(scheme);
    if (scheme === "generative") {
      const palette = generatePalette(seed);
      setBgColor(palette.bg);
      setTextColor(palette.text);
      setAccentColor(palette.accent);
    } else {
      const preset = presetPalettes.find((p) => p[0] === scheme);
      if (preset) {
        setBgColor(preset[1]);
        setTextColor(preset[2]);
        setAccentColor(preset[3]);
      }
    }
  };

  // Update colors and cell dimensions when seed changes and scheme is generative
  useEffect(() => {
    if (colorScheme === "generative") {
      const palette = generatePalette(seed);
      setBgColor(palette.bg);
      setTextColor(palette.text);
      setAccentColor(palette.accent);

      const cells = generateCellDimensions(width, height, padding, seed);
      setCellWidth(cells.cellW);
      setCellHeight(cells.cellH);

      setRenderMode(generateRenderMode(seed));

      const newMultiColor = generateMultiColorEnabled(seed);
      setMultiColor(newMultiColor);
      setLevelColors(
        newMultiColor
          ? generateMultiColorPalette(seed, palette.bg, palette.text)
          : null
      );

      // Only update fold strategy if not overridden
      if (strategyOverride === "auto") {
        setFoldStrategy(generateFoldStrategy(seed));
      }
    }
  }, [seed, colorScheme, width, height, padding, strategyOverride]);

  // UI colors (always on white background)
  const uiColor = "#666";
  const uiColorDim = "#999";
  const inputBg = "#f5f5f5";
  const inputBorder = "#ddd";
  const inputColor = "#444";

  // Calculate stats using inner dimensions
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const cols = Math.floor(innerWidth / cellWidth);
  const rows = Math.floor(innerHeight / cellHeight);
  const totalCells = cols * rows;
  const weightRange = generateWeightRange(seed);
  const { creases, finalShape } = simulateFolds(
    innerWidth,
    innerHeight,
    folds,
    seed,
    weightRange,
    foldStrategy
  );
  const intersections = findIntersections(creases);

  // Get current palette strategy if generative
  const currentStrategy =
    colorScheme === "generative" ? generatePalette(seed).strategy : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: gridView ? "flex-start" : "center",
        padding: 20,
        fontFamily: 'ui-monospace, "Courier New", monospace',
        color: "#666",
      }}
    >
      {gridView ? (
        <>
          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "#666",
              }}
            >
              Collection Preview
            </div>
            <div style={{ fontSize: 9, color: "#999", marginTop: 4 }}>
              tokens #{gridStart} – #{gridStart + gridCount - 1}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 16,
              maxWidth: 900,
              width: "100%",
            }}
          >
            {Array.from({ length: gridCount }, (_, i) => (
              <TokenThumbnail
                key={gridStart + i}
                tokenId={gridStart + i}
                size={150}
                onClick={() => {
                  setFolds(gridStart + i);
                  setSeed(gridStart + i);
                  setGridView(false);
                  // Update colors from generative
                  const palette = generatePalette(gridStart + i);
                  setBgColor(palette.bg);
                  setTextColor(palette.text);
                  setAccentColor(palette.accent);
                  const cells = generateCellDimensions(
                    width,
                    height,
                    padding,
                    gridStart + i
                  );
                  setCellWidth(cells.cellW);
                  setCellHeight(cells.cellH);
                  setRenderMode(generateRenderMode(gridStart + i));
                  const newMultiColor = generateMultiColorEnabled(
                    gridStart + i
                  );
                  setMultiColor(newMultiColor);
                  setLevelColors(
                    newMultiColor
                      ? generateMultiColorPalette(
                          gridStart + i,
                          palette.bg,
                          palette.text
                        )
                      : null
                  );
                }}
              />
            ))}
          </div>

          <button
            onClick={downloadAllTokens}
            disabled={downloading}
            style={{
              marginTop: 24,
              background: downloading ? "#999" : "#333",
              border: "none",
              padding: "12px 24px",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: downloading ? "wait" : "pointer",
            }}
          >
            {downloading
              ? `Generating... ${downloadProgress}%`
              : `Download All ${gridCount} Images (ZIP)`}
          </button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "#666",
              }}
            >
              Fold #{folds}
            </div>
            <div style={{ fontSize: 9, color: "#999", marginTop: 4 }}>
              seed {seed} · {foldStrategy?.type || "random"} · {renderMode}
              {multiColor ? " · multi" : ""}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#666",
                marginTop: 6,
                display: "flex",
                gap: 16,
                justifyContent: "center",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              <span>
                <span style={{ color: "#999" }}>creases:</span> {creaseCount}
              </span>
              <span>
                <span style={{ color: "#999" }}>intersections:</span>{" "}
                {intersectionCount}
              </span>
            </div>
          </div>

          <ASCIICanvas
            key={`${folds}-${seed}-${cellWidth}-${cellHeight}-${padding}-${bgColor}-${textColor}-${accentColor}-${renderMode}-${multiColor}-${foldStrategy?.type}-${showCreases}-${showPaperShape}-${showHitCounts}`}
            width={width}
            height={height}
            folds={folds}
            seed={seed}
            bgColor={bgColor}
            textColor={textColor}
            accentColor={accentColor}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            padding={padding}
            renderMode={renderMode}
            multiColor={multiColor}
            levelColors={levelColors}
            foldStrategy={foldStrategy}
            showCreases={showCreases}
            showPaperShape={showPaperShape}
            showHitCounts={showHitCounts}
            onStatsUpdate={(stats) => {
              setIntersectionCount(stats.intersections);
              setCreaseCount(stats.creases);
            }}
          />

          <button
            onClick={downloadSingleToken}
            style={{
              marginTop: 16,
              background: "none",
              border: "1px solid #ccc",
              padding: "8px 16px",
              color: "#666",
              fontFamily: "inherit",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            Download PNG
          </button>
        </>
      )}

      {showUI && (
        <div
          style={{
            marginTop: 24,
            width: width,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              <span>Folds</span>
              <input
                type="number"
                min={0}
                value={folds}
                onChange={(e) =>
                  setFolds(Math.max(0, parseInt(e.target.value) || 0))
                }
                style={{
                  width: 60,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 6px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                  textAlign: "right",
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={500}
              value={Math.min(folds, 500)}
              onChange={(e) => setFolds(parseInt(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Seed
            </span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 1)}
              style={{
                flex: 1,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "4px 8px",
                color: inputColor,
                fontFamily: "inherit",
                fontSize: 10,
              }}
            />
            <button
              onClick={() => {
                setSeed(Math.floor(Math.random() * 99999) + 1);
                if (randomizeFolds) {
                  setFolds(Math.floor(Math.random() * 199) + 1);
                }
              }}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "4px 12px",
                color: uiColor,
                fontFamily: "inherit",
                fontSize: 9,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Random
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={randomizeFolds}
                onChange={(e) => setRandomizeFolds(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              + folds
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Palette
            </span>
            <select
              value={colorScheme}
              onChange={(e) => handlePaletteChange(e.target.value)}
              style={{
                flex: 1,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "4px 8px",
                color: inputColor,
                fontFamily: "inherit",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <option value="generative">Generative (by seed)</option>
              {presetPalettes.map(([name]) => (
                <option key={name} value={name}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                BG
              </span>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                style={{
                  width: 32,
                  height: 24,
                  padding: 0,
                  border: `1px solid ${inputBorder}`,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                style={{
                  width: 70,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 6px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Text
              </span>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{
                  width: 32,
                  height: 24,
                  padding: 0,
                  border: `1px solid ${inputBorder}`,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{
                  width: 70,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 6px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Accent
              </span>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                style={{
                  width: 32,
                  height: 24,
                  padding: 0,
                  border: `1px solid ${inputBorder}`,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                style={{
                  width: 70,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 6px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                }}
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={multiColor}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMultiColor(enabled);
                  if (enabled) {
                    setLevelColors(
                      generateMultiColorPalette(seed, bgColor, textColor)
                    );
                  } else {
                    setLevelColors(null);
                  }
                }}
                style={{ cursor: "pointer" }}
              />
              Multi-color
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showCreases}
                onChange={(e) => setShowCreases(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Show creases
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showPaperShape}
                onChange={(e) => setShowPaperShape(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Show paper shape
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showHitCounts}
                onChange={(e) => setShowHitCounts(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Show hit counts
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Fold Strategy
            </span>
            <select
              value={strategyOverride}
              onChange={(e) => {
                const value = e.target.value;
                setStrategyOverride(value);
                if (value === "auto") {
                  setFoldStrategy(generateFoldStrategy(seed));
                } else {
                  // Create a strategy of the selected type with seed-based params
                  const rng = seededRandom(seed + 6666);
                  rng(); // skip first roll (used for type selection)
                  let newStrategy;
                  switch (value) {
                    case "horizontal":
                      newStrategy = {
                        type: "horizontal",
                        jitter: 3 + rng() * 12,
                      };
                      break;
                    case "vertical":
                      newStrategy = {
                        type: "vertical",
                        jitter: 3 + rng() * 12,
                      };
                      break;
                    case "diagonal":
                      newStrategy = {
                        type: "diagonal",
                        angle: rng() < 0.5 ? 45 : 135,
                        jitter: 5 + rng() * 15,
                      };
                      break;
                    case "radial":
                      newStrategy = {
                        type: "radial",
                        focalX: 0.2 + rng() * 0.6,
                        focalY: 0.2 + rng() * 0.6,
                      };
                      break;
                    case "grid":
                      newStrategy = { type: "grid", jitter: 3 + rng() * 10 };
                      break;
                    case "clustered":
                      newStrategy = {
                        type: "clustered",
                        clusterX: 0.15 + rng() * 0.7,
                        clusterY: 0.15 + rng() * 0.7,
                        spread: 0.2 + rng() * 0.4,
                      };
                      break;
                    default:
                      newStrategy = { type: "random" };
                  }
                  setFoldStrategy(newStrategy);
                }
              }}
              style={{
                flex: 1,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "4px 8px",
                color: inputColor,
                fontFamily: "inherit",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <option value="auto">Auto (by seed)</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="diagonal">Diagonal</option>
              <option value="radial">Radial</option>
              <option value="grid">Grid</option>
              <option value="clustered">Clustered</option>
              <option value="random">Random (chaotic)</option>
            </select>
            <span style={{ fontSize: 9, color: uiColorDim }}>
              {foldStrategy?.type}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Cell W
              </span>
              <input
                type="number"
                min={CELL_MIN}
                max={CELL_MAX}
                value={cellWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 8;
                  const snapped = snapToDivisor(
                    val,
                    innerWidth,
                    CELL_MIN,
                    CELL_MAX
                  );
                  setCellWidth(snapped);
                }}
                style={{
                  width: 40,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 4px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                  textAlign: "center",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Cell H
              </span>
              <input
                type="number"
                min={CELL_MIN}
                max={CELL_MAX}
                value={cellHeight}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 12;
                  const snapped = snapToDivisor(
                    val,
                    innerHeight,
                    CELL_MIN,
                    CELL_MAX
                  );
                  setCellHeight(snapped);
                }}
                style={{
                  width: 40,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 4px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                  textAlign: "center",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Pad
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={padding}
                onChange={(e) =>
                  setPadding(
                    Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                  )
                }
                style={{
                  width: 40,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: "2px 4px",
                  color: inputColor,
                  fontFamily: "inherit",
                  fontSize: 10,
                  textAlign: "center",
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: 9, color: uiColorDim }}>
            Grid: {cols} × {rows} = {totalCells} cells
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setCellWidth(snapToDivisor(10, innerWidth, CELL_MIN, CELL_MAX));
                setCellHeight(
                  snapToDivisor(10, innerHeight, CELL_MIN, CELL_MAX)
                );
              }}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "3px 8px",
                color: uiColor,
                fontFamily: "inherit",
                fontSize: 8,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              1:1
            </button>
            <button
              onClick={() => {
                setCellWidth(snapToDivisor(9, innerWidth, CELL_MIN, CELL_MAX));
                setCellHeight(
                  snapToDivisor(14, innerHeight, CELL_MIN, CELL_MAX)
                );
              }}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "3px 8px",
                color: uiColor,
                fontFamily: "inherit",
                fontSize: 8,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Text
            </button>
            <button
              onClick={() => {
                setCellWidth(snapToDivisor(9, innerWidth, CELL_MIN, CELL_MAX));
                setCellHeight(
                  snapToDivisor(14, innerHeight, CELL_MIN, CELL_MAX)
                );
              }}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "3px 8px",
                color: uiColor,
                fontFamily: "inherit",
                fontSize: 8,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Golden
            </button>
            <button
              onClick={() => {
                setCellWidth(snapToDivisor(18, innerWidth, CELL_MIN, CELL_MAX));
                setCellHeight(
                  snapToDivisor(25, innerHeight, CELL_MIN, CELL_MAX)
                );
              }}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "3px 8px",
                color: uiColor,
                fontFamily: "inherit",
                fontSize: 8,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Paper
            </button>
          </div>

          <div
            style={{
              marginTop: 8,
              paddingTop: 12,
              borderTop: `1px solid ${inputBorder}`,
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setGridView(!gridView)}
              style={{
                background: gridView ? uiColor : inputBg,
                border: `1px solid ${inputBorder}`,
                padding: "4px 12px",
                color: gridView ? "#fff" : uiColor,
                fontFamily: "inherit",
                fontSize: 9,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {gridView ? "Single View" : "Grid View"}
            </button>

            {gridView && (
              <>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Start
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={gridStart}
                    onChange={(e) =>
                      setGridStart(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    style={{
                      width: 50,
                      background: inputBg,
                      border: `1px solid ${inputBorder}`,
                      padding: "2px 6px",
                      color: inputColor,
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Count
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={gridCount}
                    onChange={(e) =>
                      setGridCount(
                        Math.max(
                          1,
                          Math.min(100, parseInt(e.target.value) || 20)
                        )
                      )
                    }
                    style={{
                      width: 50,
                      background: inputBg,
                      border: `1px solid ${inputBorder}`,
                      padding: "2px 6px",
                      color: inputColor,
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowUI(!showUI)}
        style={{
          marginTop: 16,
          background: "none",
          border: "none",
          color: uiColorDim,
          fontSize: 8,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: "pointer",
        }}
      >
        {showUI ? "Hide" : "Show"} controls
      </button>

      <p
        style={{
          marginTop: 24,
          fontSize: 9,
          color: uiColorDim,
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        Density accumulates at intersections.
      </p>
    </div>
  );
}
