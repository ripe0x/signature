import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ============ GLOBAL CONSTANTS ============

const CELL_MIN = 4;
const CELL_MAX = 600;
const CELL_ASPECT_MAX = 3; // Max ratio between cell width and height (e.g., 3:1 or 1:3)
const DRAWING_MARGIN = 50; // Consistent margin around the drawing area (pixels) - centers the bounding box
const REFERENCE_WIDTH = 1200; // Fixed reference canvas width for consistent grid structure
const REFERENCE_HEIGHT = 1500; // Fixed reference canvas height for consistent grid structure

// ============ VGA 256-COLOR PALETTE SYSTEM ============

// Build the complete 256-color VGA palette
// Consists of: 216 web-safe (6x6x6 RGB cube) + 16 CGA colors + 24 grayscale
const VGA_LEVELS = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];

// Generate hex from RGB values
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

// Calculate perceived luminance (0-100)
function getLuminance(r, g, b) {
  // Relative luminance formula (ITU-R BT.709)
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  return (0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm) * 100;
}

// Determine color temperature: 'warm', 'cool', or 'neutral'
function getTemperature(r, g, b) {
  const warmth = r - b; // positive = warm, negative = cool
  if (Math.abs(warmth) < 30 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
    return "neutral";
  }
  return warmth > 0 ? "warm" : "cool";
}

// Determine saturation tier: 'gray', 'muted', 'chromatic', 'vivid'
function getSaturationTier(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta < 20) return "gray";
  if (delta < 80) return "muted";
  if (delta < 160) return "chromatic";
  return "vivid";
}

// Build the 216 web-safe colors (6x6x6 RGB cube)
function buildWebSafeColors() {
  const colors = [];
  for (let ri = 0; ri < 6; ri++) {
    for (let gi = 0; gi < 6; gi++) {
      for (let bi = 0; bi < 6; bi++) {
        const r = VGA_LEVELS[ri];
        const g = VGA_LEVELS[gi];
        const b = VGA_LEVELS[bi];
        colors.push({
          hex: rgbToHex(r, g, b),
          r,
          g,
          b,
          cubePos: { ri, gi, bi }, // Position in 6x6x6 cube
          luminance: getLuminance(r, g, b),
          temperature: getTemperature(r, g, b),
          saturation: getSaturationTier(r, g, b),
          type: "websafe",
        });
      }
    }
  }
  return colors;
}

// The 16 classic CGA/EGA colors
const CGA_COLORS = [
  { hex: "#000000", name: "black" },
  { hex: "#0000AA", name: "blue" },
  { hex: "#00AA00", name: "green" },
  { hex: "#00AAAA", name: "cyan" },
  { hex: "#AA0000", name: "red" },
  { hex: "#AA00AA", name: "magenta" },
  { hex: "#AA5500", name: "brown" },
  { hex: "#AAAAAA", name: "lightGray" },
  { hex: "#555555", name: "darkGray" },
  { hex: "#5555FF", name: "lightBlue" },
  { hex: "#55FF55", name: "lightGreen" },
  { hex: "#55FFFF", name: "lightCyan" },
  { hex: "#FF5555", name: "lightRed" },
  { hex: "#FF55FF", name: "lightMagenta" },
  { hex: "#FFFF55", name: "yellow" },
  { hex: "#FFFFFF", name: "white" },
];

function buildCGAColors() {
  return CGA_COLORS.map((c) => {
    const r = parseInt(c.hex.slice(1, 3), 16);
    const g = parseInt(c.hex.slice(3, 5), 16);
    const b = parseInt(c.hex.slice(5, 7), 16);
    return {
      hex: c.hex,
      r,
      g,
      b,
      cubePos: null, // Not in the 6x6x6 cube
      luminance: getLuminance(r, g, b),
      temperature: getTemperature(r, g, b),
      saturation: getSaturationTier(r, g, b),
      type: "cga",
      name: c.name,
    };
  });
}

// 24 grayscale shades (evenly distributed)
function buildGrayscaleColors() {
  const colors = [];
  for (let i = 0; i < 24; i++) {
    const v = Math.round((i / 23) * 255);
    colors.push({
      hex: rgbToHex(v, v, v),
      r: v,
      g: v,
      b: v,
      cubePos: null,
      luminance: getLuminance(v, v, v),
      temperature: "neutral",
      saturation: "gray",
      type: "grayscale",
      grayIndex: i,
    });
  }
  return colors;
}

// Build the complete palette index
const VGA_PALETTE = [
  ...buildWebSafeColors(),
  ...buildCGAColors(),
  ...buildGrayscaleColors(),
];

// Create lookup indices for fast access
// Widened luminance ranges for better color distribution
const PALETTE_BY_LUMINANCE = {
  dark: VGA_PALETTE.filter((c) => c.luminance < 30),
  midDark: VGA_PALETTE.filter((c) => c.luminance >= 20 && c.luminance < 50),
  mid: VGA_PALETTE.filter((c) => c.luminance >= 40 && c.luminance < 70),
  midLight: VGA_PALETTE.filter((c) => c.luminance >= 55 && c.luminance < 85),
  light: VGA_PALETTE.filter((c) => c.luminance >= 70),
};

const PALETTE_BY_TEMPERATURE = {
  warm: VGA_PALETTE.filter((c) => c.temperature === "warm"),
  cool: VGA_PALETTE.filter((c) => c.temperature === "cool"),
  neutral: VGA_PALETTE.filter((c) => c.temperature === "neutral"),
};

const PALETTE_BY_SATURATION = {
  gray: VGA_PALETTE.filter((c) => c.saturation === "gray"),
  muted: VGA_PALETTE.filter((c) => c.saturation === "muted"),
  chromatic: VGA_PALETTE.filter((c) => c.saturation === "chromatic"),
  vivid: VGA_PALETTE.filter((c) => c.saturation === "vivid"),
};

// High-contrast accent colors (saturated CGA + vivid web-safe)
const ACCENT_POOL = VGA_PALETTE.filter(
  (c) =>
    c.saturation === "vivid" || (c.type === "cga" && c.saturation !== "gray")
);

// Calculate color distance in RGB space (weighted for perception)
function colorDistance(c1, c2) {
  // Weighted Euclidean distance (more weight on green as humans are most sensitive to it)
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

// Find colors within N cube-steps (for web-safe colors only)
function getCubeNeighbors(color, maxSteps) {
  if (!color.cubePos) return [];
  const { ri, gi, bi } = color.cubePos;

  return VGA_PALETTE.filter((c) => {
    if (!c.cubePos) return false;
    const dist =
      Math.abs(c.cubePos.ri - ri) +
      Math.abs(c.cubePos.gi - gi) +
      Math.abs(c.cubePos.bi - bi);
    return dist > 0 && dist <= maxSteps;
  });
}

// Get colors from the opposite cube octant
function getComplementaryRegion(color) {
  if (!color.cubePos) {
    // For non-websafe colors, find opposite by luminance and temperature
    const oppTemp =
      color.temperature === "warm"
        ? "cool"
        : color.temperature === "cool"
        ? "warm"
        : "neutral";
    return PALETTE_BY_TEMPERATURE[oppTemp];
  }

  const { ri, gi, bi } = color.cubePos;
  // Opposite octant: flip each coordinate around the midpoint (2.5)
  const oppRi = ri < 3 ? 4 : 1;
  const oppGi = gi < 3 ? 4 : 1;
  const oppBi = bi < 3 ? 4 : 1;

  return VGA_PALETTE.filter((c) => {
    if (!c.cubePos) return false;
    // Colors in the opposite region (±1 from opposite corner)
    return (
      Math.abs(c.cubePos.ri - oppRi) <= 1 &&
      Math.abs(c.cubePos.gi - oppGi) <= 1 &&
      Math.abs(c.cubePos.bi - oppBi) <= 1
    );
  });
}

// Get colors along a cube diagonal path
function getCubeDiagonalPath(startColor, endColor, steps) {
  if (!startColor.cubePos || !endColor.cubePos) {
    // Fallback: interpolate by luminance
    return interpolateByLuminance(startColor, endColor, steps);
  }

  const path = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const targetRi = Math.round(
      startColor.cubePos.ri + (endColor.cubePos.ri - startColor.cubePos.ri) * t
    );
    const targetGi = Math.round(
      startColor.cubePos.gi + (endColor.cubePos.gi - startColor.cubePos.gi) * t
    );
    const targetBi = Math.round(
      startColor.cubePos.bi + (endColor.cubePos.bi - startColor.cubePos.bi) * t
    );

    // Find the color at this cube position
    const found = VGA_PALETTE.find(
      (c) =>
        c.cubePos &&
        c.cubePos.ri === targetRi &&
        c.cubePos.gi === targetGi &&
        c.cubePos.bi === targetBi
    );
    if (found) path.push(found);
  }
  return path;
}

// Interpolate between two colors by luminance (fallback for non-websafe)
function interpolateByLuminance(startColor, endColor, steps) {
  const startLum = startColor.luminance;
  const endLum = endColor.luminance;

  const path = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const targetLum = startLum + (endLum - startLum) * t;

    // Find closest color by luminance that maintains temperature
    const candidates = VGA_PALETTE.filter(
      (c) =>
        c.temperature === startColor.temperature || c.temperature === "neutral"
    );

    let closest = candidates[0];
    let closestDist = Math.abs(closest.luminance - targetLum);

    for (const c of candidates) {
      const dist = Math.abs(c.luminance - targetLum);
      if (dist < closestDist) {
        closestDist = dist;
        closest = c;
      }
    }
    path.push(closest);
  }
  return path;
}

// Check if two colors have sufficient contrast (WCAG AA = 4.5:1)
function hasGoodContrast(c1, c2, minRatio = 4.5) {
  const l1 = c1.luminance / 100;
  const l2 = c2.luminance / 100;
  const lighter = Math.max(l1, l2) + 0.05;
  const darker = Math.min(l1, l2) + 0.05;
  return lighter / darker >= minRatio;
}

// Pick a random element from array using seeded RNG
function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Pick from array with bias toward certain indices
function pickBiased(rng, arr, bias) {
  // bias: 'start' = favor low indices, 'end' = favor high indices, 'middle' = favor middle
  const idx = Math.floor(rng() * arr.length);
  if (bias === "start") {
    return arr[Math.floor(idx * rng())];
  } else if (bias === "end") {
    return arr[arr.length - 1 - Math.floor((arr.length - 1 - idx) * rng())];
  }
  return arr[idx];
}

// ============ HSL UTILITIES (for color manipulation, not palette generation) ============

// HSL to Hex conversion (used for extreme color effects)
// Convert hex color to rgba string with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

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

// Hex to HSL conversion (used for extreme color effects)
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

// ============ ALBERS-INSPIRED PALETTE GENERATION ============
// Based on Josef Albers' "Interaction of Color" principles:
// - Color is relational, not absolute
// - Derive colors through transformations, not independent selection
// - Restriction reveals relationships
// - Near-neighbors create optical effects
// - The transformation IS the artistic choice

// Find colors that could be perceptually confused with the given color
// (similar luminance, different hue/saturation) - Albers' deception principle
function findConfusableColors(color, lumTolerance = 10) {
  return VGA_PALETTE.filter(
    (c) =>
      c.hex !== color.hex &&
      Math.abs(c.luminance - color.luminance) < lumTolerance &&
      (c.temperature !== color.temperature || c.saturation !== color.saturation)
  );
}

// Find the visual midpoint between two colors - a color the eye might mix
function findVisualMidpoint(c1, c2) {
  const targetR = Math.round((c1.r + c2.r) / 2);
  const targetG = Math.round((c1.g + c2.g) / 2);
  const targetB = Math.round((c1.b + c2.b) / 2);
  const targetLum = (c1.luminance + c2.luminance) / 2;

  // Find closest VGA color to the theoretical midpoint
  let closest = VGA_PALETTE[0];
  let closestDist = Infinity;

  for (const c of VGA_PALETTE) {
    // Weight both RGB distance and luminance match
    const rgbDist = Math.sqrt(
      Math.pow(c.r - targetR, 2) +
        Math.pow(c.g - targetG, 2) +
        Math.pow(c.b - targetB, 2)
    );
    const lumDist = Math.abs(c.luminance - targetLum) * 2;
    const totalDist = rgbDist + lumDist;

    if (totalDist < closestDist) {
      closestDist = totalDist;
      closest = c;
    }
  }

  return closest;
}

// Apply a transformation to derive a new color from the mother color
// Returns array of candidates sorted by transformation fidelity
function applyTransformation(mother, transformType, rng) {
  let candidates = [];

  switch (transformType) {
    case "value": {
      // Pure value shift - same hue region, different luminance
      // Albers: "colors of equal light intensity but different hue"
      const lumDiff = mother.luminance > 50 ? -40 : 40; // Go opposite direction
      const targetLum = Math.max(5, Math.min(95, mother.luminance + lumDiff));

      candidates = VGA_PALETTE.filter(
        (c) =>
          c.hex !== mother.hex &&
          Math.abs(c.luminance - targetLum) < 20 &&
          (c.temperature === mother.temperature ||
            c.temperature === "neutral" ||
            mother.temperature === "neutral")
      );

      // Sort by how well they maintain the temperature while shifting value
      candidates.sort((a, b) => {
        const aTempMatch = a.temperature === mother.temperature ? 0 : 1;
        const bTempMatch = b.temperature === mother.temperature ? 0 : 1;
        if (aTempMatch !== bTempMatch) return aTempMatch - bTempMatch;
        return (
          Math.abs(a.luminance - targetLum) - Math.abs(b.luminance - targetLum)
        );
      });
      break;
    }

    case "temperature": {
      // Temperature shift - warm↔cool while maintaining value
      // Albers: spatial relationships through temperature
      const targetTemp =
        mother.temperature === "warm"
          ? "cool"
          : mother.temperature === "cool"
          ? "warm"
          : rng() < 0.5
          ? "warm"
          : "cool";

      candidates = VGA_PALETTE.filter(
        (c) =>
          c.hex !== mother.hex &&
          c.temperature === targetTemp &&
          Math.abs(c.luminance - mother.luminance) < 25
      );

      // Sort by luminance similarity (maintain value)
      candidates.sort(
        (a, b) =>
          Math.abs(a.luminance - mother.luminance) -
          Math.abs(b.luminance - mother.luminance)
      );
      break;
    }

    case "saturation": {
      // Saturation shift - chromatic↔muted
      // Albers: "free studies" exploring saturation relationships
      const satOrder = ["gray", "muted", "chromatic", "vivid"];
      const motherIdx = satOrder.indexOf(mother.saturation);
      // Move toward opposite end of saturation spectrum
      const targetSats =
        motherIdx <= 1 ? ["chromatic", "vivid"] : ["muted", "gray"];

      candidates = VGA_PALETTE.filter(
        (c) =>
          c.hex !== mother.hex &&
          targetSats.includes(c.saturation) &&
          Math.abs(c.luminance - mother.luminance) < 30 &&
          (c.temperature === mother.temperature || c.temperature === "neutral")
      );

      // Sort by saturation distance (prefer stronger shift)
      candidates.sort((a, b) => {
        const aIdx = satOrder.indexOf(a.saturation);
        const bIdx = satOrder.indexOf(b.saturation);
        return Math.abs(bIdx - motherIdx) - Math.abs(aIdx - motherIdx);
      });
      break;
    }

    case "complement": {
      // Complementary - opposite cube octant
      // Albers: "after-image" and simultaneous contrast studies
      candidates = getComplementaryRegion(mother);

      // Sort by luminance contrast (complement should create tension)
      candidates.sort(
        (a, b) =>
          Math.abs(b.luminance - mother.luminance) -
          Math.abs(a.luminance - mother.luminance)
      );
      break;
    }

    case "neighbor": {
      // Near-neighbor - Albers' "fluting" studies
      // Adjacent colors that create subtle optical vibration
      if (mother.cubePos) {
        candidates = getCubeNeighbors(mother, 1); // Only immediate neighbors
        if (candidates.length < 3) {
          candidates = getCubeNeighbors(mother, 2);
        }
      } else {
        // For non-websafe, find perceptually similar colors
        candidates = VGA_PALETTE.filter(
          (c) =>
            c.hex !== mother.hex &&
            colorDistance(mother, c) < 60 &&
            colorDistance(mother, c) > 20
        );
      }

      // Sort by distance (prefer closest neighbors)
      candidates.sort(
        (a, b) => colorDistance(mother, a) - colorDistance(mother, b)
      );
      break;
    }
  }

  return candidates;
}

// Generate palette using Albers' transformation-based approach
function generatePalette(seed) {
  const rng = seededRandom(seed);

  // 0. GLITCH MODE - ~3% chance of "broken" palette
  // Intentional wrongness: low contrast, clashing temps, or monochrome chaos
  const glitchRoll = rng();
  if (glitchRoll < 0.03) {
    const glitchType = Math.floor(rng() * 5);

    switch (glitchType) {
      case 0: {
        // "Washed out" - all colors from same luminance band, barely readable
        const lumBand =
          rng() < 0.5
            ? PALETTE_BY_LUMINANCE.midLight
            : PALETTE_BY_LUMINANCE.midDark;
        const colors = [
          pickRandom(rng, lumBand),
          pickRandom(rng, lumBand),
          pickRandom(rng, lumBand),
        ];
        return {
          bg: colors[0].hex,
          text: colors[1].hex,
          accent: colors[2].hex,
          strategy: "glitch/washed",
        };
      }
      case 1: {
        // "Acid" - clashing vivid colors, temperature war
        const warm = PALETTE_BY_SATURATION.vivid.filter(
          (c) => c.temperature === "warm"
        );
        const cool = PALETTE_BY_SATURATION.vivid.filter(
          (c) => c.temperature === "cool"
        );
        return {
          bg: pickRandom(rng, warm).hex,
          text: pickRandom(rng, cool).hex,
          accent: pickRandom(rng, rng() < 0.5 ? warm : cool).hex,
          strategy: "glitch/acid",
        };
      }
      case 2: {
        // "Void" - near-black on black, barely there
        const darks = VGA_PALETTE.filter((c) => c.luminance < 15);
        const lessdarks = VGA_PALETTE.filter(
          (c) => c.luminance >= 10 && c.luminance < 25
        );
        return {
          bg: pickRandom(rng, darks).hex,
          text: pickRandom(rng, lessdarks).hex,
          accent: pickRandom(rng, lessdarks).hex,
          strategy: "glitch/void",
        };
      }
      case 3: {
        // "Bleach" - near-white on white, overexposed
        const lights = VGA_PALETTE.filter((c) => c.luminance > 85);
        const lesslights = VGA_PALETTE.filter(
          (c) => c.luminance >= 70 && c.luminance < 90
        );
        return {
          bg: pickRandom(rng, lights).hex,
          text: pickRandom(rng, lesslights).hex,
          accent: pickRandom(rng, lesslights).hex,
          strategy: "glitch/bleach",
        };
      }
      case 4:
      default: {
        // "Corrupt" - random CGA colors, no logic
        const cgaOnly = VGA_PALETTE.filter((c) => c.type === "cga");
        return {
          bg: pickRandom(rng, cgaOnly).hex,
          text: pickRandom(rng, cgaOnly).hex,
          accent: pickRandom(rng, cgaOnly).hex,
          strategy: "glitch/corrupt",
        };
      }
    }
  }

  // 1. SELECT MOTHER COLOR
  // The seed determines which color becomes the generative source
  // Bias toward chromatic colors (grays are less generative)
  const chromaticPool = VGA_PALETTE.filter(
    (c) => c.saturation !== "gray" && c.type === "websafe"
  );
  const motherColor = pickRandom(rng, chromaticPool);

  // 2. CHOOSE GROUND (light or dark)
  // This is a compositional choice, not a color choice
  // Albers: the ground determines how colors are read
  const groundRoll = rng();
  let ground;
  if (groundRoll < 0.4) ground = "light"; // Mother recedes
  else if (groundRoll < 0.8) ground = "dark"; // Mother advances
  else ground = "mid"; // Ambiguous space

  // 3. CHOOSE PRIMARY TRANSFORMATION
  // This is THE artistic choice - how will we derive the palette?
  const transformRoll = rng();
  let primaryTransform;
  if (transformRoll < 0.3) primaryTransform = "value"; // 30% - value studies
  else if (transformRoll < 0.5)
    primaryTransform = "temperature"; // 20% - warm/cool
  else if (transformRoll < 0.65)
    primaryTransform = "saturation"; // 15% - chroma studies
  else if (transformRoll < 0.8)
    primaryTransform = "complement"; // 15% - opposition
  else primaryTransform = "neighbor"; // 20% - fluting/vibration

  // 4. DERIVE BACKGROUND FROM GROUND CHOICE
  let bgCandidates;
  if (ground === "light") {
    bgCandidates = PALETTE_BY_LUMINANCE.light.filter(
      (c) =>
        c.temperature === motherColor.temperature ||
        c.temperature === "neutral" ||
        c.saturation === "gray"
    );
  } else if (ground === "dark") {
    bgCandidates = PALETTE_BY_LUMINANCE.dark.filter(
      (c) =>
        c.temperature === motherColor.temperature ||
        c.temperature === "neutral" ||
        c.saturation === "gray"
    );
  } else {
    // Mid ground - use muted version of mother's region
    bgCandidates = VGA_PALETTE.filter(
      (c) =>
        c.luminance >= 35 &&
        c.luminance <= 65 &&
        (c.saturation === "muted" || c.saturation === "gray") &&
        (c.temperature === motherColor.temperature ||
          c.temperature === "neutral")
    );
  }

  // Fallback if no candidates
  if (bgCandidates.length === 0) {
    bgCandidates =
      ground === "light"
        ? PALETTE_BY_LUMINANCE.light
        : PALETTE_BY_LUMINANCE.dark;
  }

  const bgColor = pickRandom(rng, bgCandidates);

  // 5. DERIVE TEXT COLOR VIA TRANSFORMATION
  // Apply the chosen transformation to the mother color
  let textCandidates = applyTransformation(motherColor, primaryTransform, rng);

  // Filter for contrast with background
  textCandidates = textCandidates.filter((c) =>
    hasGoodContrast(bgColor, c, 4.5)
  );

  // If transformation yields nothing usable, fall back to value shift
  if (textCandidates.length === 0) {
    textCandidates = applyTransformation(motherColor, "value", rng).filter(
      (c) => hasGoodContrast(bgColor, c, 4.5)
    );
  }

  // Ultimate fallback: any contrasting color
  if (textCandidates.length === 0) {
    textCandidates = VGA_PALETTE.filter((c) =>
      hasGoodContrast(bgColor, c, 4.5)
    );
  }

  // Pick from top candidates (sorted by transformation fidelity)
  const textColor =
    textCandidates.length > 3
      ? textCandidates[Math.floor(rng() * Math.min(3, textCandidates.length))]
      : textCandidates[0] || motherColor;

  // 6. ACCENT: ONLY IF IT DESTABILIZES
  // Albers: accent should make other colors appear to shift
  // 80% of palettes have NO accent (text color serves as accent)
  const useAccent = rng() < 0.2;
  let accentColor;

  if (useAccent) {
    // Find a color that creates visual tension
    // It should be confusable with EITHER bg or text at certain values
    const bgConfusable = findConfusableColors(bgColor, 15);
    const textConfusable = findConfusableColors(textColor, 15);

    // Accent candidates: colors that could "belong" to either camp
    // but are actually distinct - this creates the destabilization
    let accentCandidates = [...bgConfusable, ...textConfusable].filter(
      (c) =>
        hasGoodContrast(bgColor, c, 3.0) &&
        c.hex !== textColor.hex &&
        c.saturation !== "gray"
    );

    // Remove duplicates
    const seen = new Set();
    accentCandidates = accentCandidates.filter((c) => {
      if (seen.has(c.hex)) return false;
      seen.add(c.hex);
      return true;
    });

    if (accentCandidates.length > 0) {
      // Prefer vivid accents for maximum destabilization
      const vividAccents = accentCandidates.filter(
        (c) => c.saturation === "vivid" || c.saturation === "chromatic"
      );
      accentColor = pickRandom(
        rng,
        vividAccents.length > 0 ? vividAccents : accentCandidates
      );
    } else {
      // Fallback: visual midpoint creates subtle third color effect
      const midpoint = findVisualMidpoint(bgColor, textColor);
      if (hasGoodContrast(bgColor, midpoint, 2.5)) {
        accentColor = midpoint;
      } else {
        accentColor = textColor; // No accent, use text
      }
    }
  } else {
    // No accent - cleaner, more Albers-like
    accentColor = textColor;
  }

  return {
    bg: bgColor.hex,
    text: textColor.hex,
    accent: accentColor.hex,
    strategy: `${ground}/${primaryTransform}${useAccent ? "+accent" : ""}`,
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
// Always uses reference dimensions to ensure consistent grid structure across all canvas sizes
function generateCellDimensions(width, height, padding, seed) {
  // Use reference dimensions for consistent grid structure regardless of actual canvas size
  const innerW = REFERENCE_WIDTH - padding * 2;
  const innerH = REFERENCE_HEIGHT - padding * 2;

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

// Generate weight range for creases (normalized to 0-1)
// Different outputs have different "pressure" characteristics
function generateWeightRange(seed) {
  const rng = seededRandom(seed + 7777);
  const style = rng();

  if (style < 0.25) {
    // Light touch - all creases gentle
    const base = 0.2 + rng() * 0.2; // 0.2-0.4
    return { min: base, max: base + 0.1 + rng() * 0.2 }; // max up to ~0.7
  } else if (style < 0.5) {
    // Heavy hand - all creases deep
    const base = 0.6 + rng() * 0.2; // 0.6-0.8
    return { min: base, max: base + 0.1 + rng() * 0.1 }; // max up to ~1.0
  } else if (style < 0.75) {
    // High contrast - mix of light and heavy
    return { min: 0.1 + rng() * 0.2, max: 0.7 + rng() * 0.3 }; // 0.1-1.0
  } else {
    // Balanced - moderate range
    return { min: 0.3 + rng() * 0.2, max: 0.5 + rng() * 0.5 }; // 0.3-1.0
  }
}

// Generate maxFolds - determines "lung capacity" for breathing cycles (4-69)
function generateMaxFolds(seed) {
  const rng = seededRandom(seed + 2222);
  return Math.floor(4 + rng() * 66); // 4 to 69 inclusive
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
// Find a VGA palette color by hex value
function findVGAColor(hex) {
  const upperHex = hex.toUpperCase();
  return VGA_PALETTE.find((c) => c.hex === upperHex) || VGA_PALETTE[0];
}

// Generate multi-color palette using VGA cube-path interpolation
// Returns array of 4 colors: [level0, level1, level2, level3]
function generateMultiColorPalette(seed, bgColor, textColor) {
  const rng = seededRandom(seed + 3333);

  // Find the VGA colors closest to bg and text
  const bgVGA = findVGAColor(bgColor);
  const textVGA = findVGAColor(textColor);
  const isLightBg = bgVGA.luminance > 50;

  const strategy = rng();

  if (strategy < 0.45) {
    // Cube path interpolation - walk through the RGB cube from bg region to text
    // This creates a natural gradient using only VGA colors

    if (bgVGA.cubePos && textVGA.cubePos) {
      const path = getCubeDiagonalPath(bgVGA, textVGA, 6);
      if (path.length >= 4) {
        // Pick 4 evenly spaced colors from the path
        return [
          path[0].hex,
          path[Math.floor(path.length * 0.33)].hex,
          path[Math.floor(path.length * 0.66)].hex,
          path[path.length - 1].hex,
        ];
      }
    }

    // Fallback: luminance-based interpolation
    const path = interpolateByLuminance(bgVGA, textVGA, 6);
    return [
      path[0].hex,
      path[Math.floor(path.length * 0.33)].hex,
      path[Math.floor(path.length * 0.66)].hex,
      path[path.length - 1].hex,
    ];
  } else if (strategy < 0.75) {
    // Neighborhood expansion - start from text color, expand outward in cube
    // Creates cohesive palettes that stay in the same "region"

    const neighbors1 = getCubeNeighbors(textVGA, 1);
    const neighbors2 = getCubeNeighbors(textVGA, 2);
    const neighbors3 = getCubeNeighbors(textVGA, 3);

    // Filter by contrast and sort by luminance
    const sortByLum = (a, b) =>
      isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance;

    const level1Candidates = neighbors1
      .filter((c) => hasGoodContrast(bgVGA, c, 2.0))
      .sort(sortByLum);
    const level2Candidates = neighbors2
      .filter((c) => hasGoodContrast(bgVGA, c, 3.0))
      .sort(sortByLum);
    const level3Candidates = neighbors3
      .filter((c) => hasGoodContrast(bgVGA, c, 4.0))
      .sort(sortByLum);

    // Select colors, ensuring they're distinct
    const colors = [textVGA.hex];

    // Level 1 - closest to text
    if (level1Candidates.length > 0) {
      colors.push(pickRandom(rng, level1Candidates).hex);
    } else {
      colors.push(textVGA.hex);
    }

    // Level 2 - mid distance
    if (level2Candidates.length > 0) {
      const unused = level2Candidates.filter((c) => !colors.includes(c.hex));
      colors.push(
        unused.length > 0
          ? pickRandom(rng, unused).hex
          : level2Candidates[0].hex
      );
    } else {
      colors.push(colors[1]);
    }

    // Level 3 - furthest, most contrast
    if (level3Candidates.length > 0) {
      const unused = level3Candidates.filter((c) => !colors.includes(c.hex));
      colors.push(
        unused.length > 0
          ? pickRandom(rng, unused).hex
          : level3Candidates[0].hex
      );
    } else {
      colors.push(textVGA.hex);
    }

    // Reorder by luminance for proper gradient
    const colorObjs = colors.map((hex) => findVGAColor(hex));
    colorObjs.sort((a, b) =>
      isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance
    );

    return colorObjs.map((c) => c.hex);
  } else {
    // Temperature tension - use colors from opposite temperature for some levels
    // Creates more dynamic, contrasting palettes

    const textTemp = textVGA.temperature;
    const oppositeTemp =
      textTemp === "warm" ? "cool" : textTemp === "cool" ? "warm" : "warm";

    // Get candidates from both temperatures
    const sameTemp = PALETTE_BY_TEMPERATURE[textTemp].filter((c) =>
      hasGoodContrast(bgVGA, c, 2.5)
    );
    const oppTemp = PALETTE_BY_TEMPERATURE[oppositeTemp].filter((c) =>
      hasGoodContrast(bgVGA, c, 2.5)
    );

    // Sort by luminance
    const sortByLum = (a, b) =>
      isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance;
    sameTemp.sort(sortByLum);
    oppTemp.sort(sortByLum);

    const colors = [];

    // Level 0 - lightest/darkest, same temperature
    colors.push(sameTemp.length > 0 ? sameTemp[0].hex : textVGA.hex);

    // Level 1 - same temperature, mid value
    const mid1 = sameTemp.filter((c) => !colors.includes(c.hex));
    colors.push(
      mid1.length > 0 ? mid1[Math.floor(mid1.length * 0.3)].hex : textVGA.hex
    );

    // Level 2 - opposite temperature for tension
    const mid2 = oppTemp.filter((c) => !colors.includes(c.hex));
    colors.push(
      mid2.length > 0 ? mid2[Math.floor(mid2.length * 0.5)].hex : textVGA.hex
    );

    // Level 3 - highest contrast, could be either
    const final = [...sameTemp, ...oppTemp].filter(
      (c) => !colors.includes(c.hex)
    );
    final.sort(sortByLum);
    colors.push(final.length > 0 ? final[final.length - 1].hex : textVGA.hex);

    return colors;
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

  // Level 1 (░): bottom 70% of non-zero weights - most common
  // Level 2 (▒): 70th to 94th percentile - less common
  // Level 3 (▓): top 6% only - rare, darkest areas
  // Extreme (color shift): top 1.5% - transcends the palette
  const t1 = percentile(weights, 0.7);
  const t2 = percentile(weights, 0.94);
  const t3 = percentile(weights, 0.94) + 1; // anything above t2
  const tExtreme = percentile(weights, 0.985); // top 1.5%

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
  weightRange = { min: 0.0, max: 1.0 },
  strategyOverride = null
) {
  // Defensive: ensure valid dimensions
  if (!width || !height || width <= 0 || height <= 0) {
    return { creases: [], finalShape: [] };
  }

  const strategy = strategyOverride || generateFoldStrategy(seed);

  // Calculate maxFolds for breathing cycles
  const maxFolds = generateMaxFolds(seed);

  // Start with rectangle
  let shape = ensureCCW([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]);

  const creases = [];
  let lastFoldTarget = null; // Track destination point of most recent fold

  // If no folds requested, return initial state
  if (!numFolds || numFolds <= 0) {
    return { creases: [], finalShape: shape, maxFolds, lastFoldTarget: null };
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

  // Pre-generate reduction multipliers for each cycle position (deterministic)
  // Each crease created at a given cycle position gets the multiplier for that position
  const reductionMultipliers = [];
  const reductionRng = seededRandom(seed + 1111);
  for (let i = 0; i < maxFolds; i++) {
    // Each crease gets a reduction multiplier between 0.1 and 0.9
    // This determines how much weight remains after exhale (10% to 90%)
    reductionMultipliers[i] = 0.001 + reductionRng() * 0.25;
  }

  for (let f = 0; f < numFolds; f++) {
    // Calculate cycle position (0 to maxFolds-1)
    const cyclePosition = f % maxFolds;
    const currentCycle = Math.floor(f / maxFolds);

    // EXHALE: At the start of each new cycle (except the first), reduce ALL existing crease weights
    // Each crease gets reduced by its own multiplier (stored when it was created)
    // This simulates the paper being flattened - all creases become less pronounced
    if (cyclePosition === 0 && currentCycle > 0) {
      let totalWeightBefore = 0;
      let totalWeightAfter = 0;
      for (const crease of creases) {
        if (crease.reductionMultiplier !== undefined) {
          totalWeightBefore += crease.weight;
          crease.weight = Math.max(
            0.01,
            crease.weight * crease.reductionMultiplier
          );
          totalWeightAfter += crease.weight;
        }
      }
      // Debug: Log exhale events
      console.log(
        `[EXHALE at fold ${f}] Reduced ${
          creases.length
        } creases: ${totalWeightBefore.toFixed(2)} → ${totalWeightAfter.toFixed(
          2
        )} (${((1 - totalWeightAfter / totalWeightBefore) * 100).toFixed(
          1
        )}% reduction)`
      );
    }
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
    // Amplitude grows with fold index (not ratio) so existing folds stay stable
    const amplitude = 0.3 + Math.min(f * 0.002, 0.2); // caps at 0.5 after 100 folds
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
      // Generate new weight for this fold
      const newWeight =
        weightRange.min + weightRng() * (weightRange.max - weightRange.min);

      // INHALE: Create a new crease with this weight
      // Store its reduction multiplier so it can be reduced at future exhales
      creases.push({
        p1: V.copy(canvasCrease.p1),
        p2: V.copy(canvasCrease.p2),
        depth: creases.length,
        weight: newWeight, // Start with just this fold's weight
        cyclePosition: cyclePosition,
        reductionMultiplier: reductionMultipliers[cyclePosition], // Store multiplier for future exhales
      });

      // Store the target of this fold (with same offset as crease)
      lastFoldTarget = {
        x: target.x + offsetX,
        y: target.y + offsetY,
      };
    }

    shape = ensureCCW(newShape);
    currentSeed = hashSeed(currentSeed, "fold" + f);
  }

  // Normalize final shape to fit canvas for display
  shape = normalizePolygon(shape, width, height, 0);
  shape = ensureCCW(shape);

  return { creases, finalShape: shape, maxFolds, lastFoldTarget };
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
function processCreases(
  creases,
  gridCols,
  gridRows,
  cellWidth,
  cellHeight,
  maxFolds = null
) {
  const intersections = findIntersections(creases);

  // Build cell weights and gaps
  const cellWeights = {};
  const cellMaxGap = {};

  // Also track intersection counts per cell for debugging
  const cellIntersectionCounts = {};

  for (const inter of intersections) {
    const col = Math.floor(inter.x / cellWidth);
    const row = Math.floor(inter.y / cellHeight);
    if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
      const key = `${col},${row}`;
      cellWeights[key] = (cellWeights[key] || 0) + inter.weight;
      cellMaxGap[key] = Math.max(cellMaxGap[key] || 0, inter.gap);
      // Track count of intersections in this cell
      cellIntersectionCounts[key] = (cellIntersectionCounts[key] || 0) + 1;
    }
  }

  // Debug: Log cells with multiple intersections
  for (const [key, count] of Object.entries(cellIntersectionCounts)) {
    if (count > 1) {
      const [col, row] = key.split(",").map(Number);
      console.log(
        `Cell [${col},${row}] has ${count} intersections, total weight: ${cellWeights[
          key
        ].toFixed(2)}`
      );
    }
  }

  return {
    activeCreases: creases,
    intersections,
    cellWeights,
    cellMaxGap,
    cellIntersectionCounts, // Return counts for hit count display
    destroyed: 0,
    maxFolds,
  };
}

// Render a token to a canvas and return as data URL
function renderTokenToCanvas(tokenId, outputWidth = 1200, outputHeight = 1500) {
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

  // Background - fill entire canvas
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  // Calculate scale factors to maintain consistent grid structure
  const scaleX = outputWidth / REFERENCE_WIDTH;
  const scaleY = outputHeight / REFERENCE_HEIGHT;

  // Calculate reference drawing area (always based on reference dimensions)
  const refDrawWidth = REFERENCE_WIDTH - DRAWING_MARGIN * 2;
  const refDrawHeight = REFERENCE_HEIGHT - DRAWING_MARGIN * 2;
  const refOffsetX = DRAWING_MARGIN;
  const refOffsetY = DRAWING_MARGIN;

  // Grid calculations based on reference dimensions (ensures consistent structure)
  const cols = Math.max(1, Math.floor(refDrawWidth / cellWidth));
  const rows = Math.max(1, Math.floor(refDrawHeight / cellHeight));

  // Calculate reference cell dimensions (always consistent)
  const refCellWidth = refDrawWidth / cols;
  const refCellHeight = refDrawHeight / rows;

  // Scale to actual output dimensions
  const drawWidth = refDrawWidth * scaleX;
  const drawHeight = refDrawHeight * scaleY;
  const offsetX = refOffsetX * scaleX;
  const offsetY = refOffsetY * scaleY;
  const actualCellWidth = refCellWidth * scaleX;
  const actualCellHeight = refCellHeight * scaleY;

  // Generate weight range for this output
  const weightRange = generateWeightRange(seed);

  // Generate fold structure with weights (in reference space, then scale)
  const { creases, finalShape, maxFolds, lastFoldTarget } = simulateFolds(
    refDrawWidth,
    refDrawHeight,
    folds,
    seed,
    weightRange,
    foldStrategy
  );

  // Scale creases from reference space to actual output space
  const scaledCreases = creases.map((crease) => ({
    ...crease,
    p1: {
      x: crease.p1.x * scaleX,
      y: crease.p1.y * scaleY,
    },
    p2: {
      x: crease.p2.x * scaleX,
      y: crease.p2.y * scaleY,
    },
  }));

  // Scale last fold target to actual output space and determine cell
  let lastFoldTargetCell = null;
  if (lastFoldTarget) {
    const scaledTargetX = lastFoldTarget.x * scaleX;
    const scaledTargetY = lastFoldTarget.y * scaleY;
    const targetCol = Math.floor(scaledTargetX / actualCellWidth);
    const targetRow = Math.floor(scaledTargetY / actualCellHeight);
    if (
      targetCol >= 0 &&
      targetCol < cols &&
      targetRow >= 0 &&
      targetRow < rows
    ) {
      lastFoldTargetCell = `${targetCol},${targetRow}`;
    }
  }

  // Process creases - find all intersections (use actual cell dimensions)
  const {
    activeCreases,
    intersections: activeIntersections,
    cellWeights: intersectionWeight,
    cellMaxGap,
  } = processCreases(
    scaledCreases,
    cols,
    rows,
    actualCellWidth,
    actualCellHeight,
    maxFolds
  );

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

  // Font setup (scaled to actual output size)
  ctx.font = `${
    actualCellHeight - 2 * scaleY
  }px "Courier New", Courier, monospace`;
  ctx.textBaseline = "top";

  // Block shade characters - graduated density, no solid blocks
  const shadeChars = [" ", "░", "▒", "▓"];

  // Calculate adaptive thresholds based on this output's weight distribution
  const thresholds = calculateAdaptiveThresholds(intersectionWeight);

  // Helper to get color based on level (for multiColor mode) - no breathing
  const getColorForLevel = (level, cellKey) => {
    if (multiColor && levelColors) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  // Draw character grid (centered with margin)
  // Ensure exact pixel alignment to avoid floating point issues
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(offsetX + col * actualCellWidth);
      const y = Math.round(offsetY + row * actualCellHeight);
      const key = `${col},${row}`;
      const weight = intersectionWeight[key] || 0;

      let char = null;
      let color = textColor;
      let level = -1;

      // Last fold target cell gets accent color (or text color if no accent)
      if (lastFoldTargetCell === key) {
        char = shadeChars[3];
        level = 3;
        color = accentColor || textColor;
      } else if (accentCells.has(key) && weight > 0) {
        char = shadeChars[2];
        level = 2;
        color = accentColor;
      } else if (weight >= 1.5) {
        // EXTREME: 1.5+ intersection weight (dense intersections) - extra hue shift
        const extremeAmount = weight - 1.5;
        // Scale extreme amount for 0-2 range (two creases max = 2.0)
        const baseShift = 30 + Math.min(extremeAmount * 300, 150);
        const baseHsl = hexToHsl(textColor);
        const newHue = (baseHsl.h + baseShift + 360) % 360;
        const newSat = Math.min(100, baseHsl.s + 20);
        const newLight = Math.min(85, baseHsl.l + 10);
        char = shadeChars[3];
        level = 3;
        color = hslToHex(newHue, newSat, newLight);
      } else if (renderMode === "normal") {
        level = countToLevelAdaptive(weight, thresholds);
        char = shadeChars[level];
        color = getColorForLevel(level, key);
      } else if (renderMode === "binary") {
        if (weight === 0) {
          char = shadeChars[0];
          level = 0;
          color = getColorForLevel(0, key);
        } else {
          char = shadeChars[3];
          level = 3;
          color = getColorForLevel(3, key);
        }
      } else if (renderMode === "inverted") {
        level = 3 - countToLevelAdaptive(weight, thresholds);
        char = shadeChars[level];
        color = getColorForLevel(level, key);
      } else if (renderMode === "sparse") {
        level = countToLevelAdaptive(weight, thresholds);
        if (level === 1) {
          char = shadeChars[1];
          color = getColorForLevel(1, key);
        }
      } else if (renderMode === "dense") {
        level = countToLevelAdaptive(weight, thresholds);
        if (level >= 2) {
          char = shadeChars[level];
          color = getColorForLevel(level, key);
        } else if (weight === 0) {
          char = shadeChars[0];
          level = 0;
          color = getColorForLevel(0, key);
        }
      }

      if (char) {
        // Always use getColorForLevel to ensure VGA palette colors
        const finalColor = getColorForLevel(
          countToLevelAdaptive(weight, thresholds),
          key
        );
        // Last fold target gets accent color, then accent cells, then normal color
        ctx.fillStyle =
          lastFoldTargetCell === key
            ? accentColor || textColor
            : accentCells.has(key) && weight > 0
            ? accentColor
            : finalColor;

        // Fill the entire cell width with characters - use aggressive overlap to eliminate gaps
        const measuredCharWidth = ctx.measureText(char).width;
        // Calculate exact cell boundary (next cell's start position)
        const cellEndX = Math.round(offsetX + (col + 1) * actualCellWidth);

        // Draw characters with tight overlap (95% of width) to ensure no gaps
        let currentX = x;
        let charIndex = 0;
        const overlapFactor = 0.95; // Use 95% of width = 5% overlap to eliminate gaps

        while (currentX < cellEndX && level >= 0) {
          let nextChar = char;
          if (level >= 2 && charIndex > 0 && charIndex % 2 === 0) {
            nextChar = shadeChars[Math.max(0, level - 1)];
          }

          const nextCharWidth = ctx.measureText(nextChar).width;
          const remainingWidth = cellEndX - currentX;

          if (remainingWidth <= 0) break;

          // Always draw character, ensuring it reaches or extends past boundary if last
          if (remainingWidth < nextCharWidth * 1.1) {
            // Close to end - ensure character extends to boundary
            ctx.fillText(nextChar, cellEndX - nextCharWidth, y);
            break;
          } else {
            // Draw with overlap to ensure no gaps
            ctx.fillText(nextChar, currentX, y);
            currentX += nextCharWidth * overlapFactor;
          }

          charIndex++;
        }
      }
    }
  }

  return canvas.toDataURL("image/png");
}

// ============ BATCH GENERATION HELPERS ============

// Generate all parameters for a given seed (for batch mode)
function generateAllParams(
  seed,
  width = 1200,
  height = 1500,
  padding = 0,
  folds = null
) {
  const palette = generatePalette(seed);
  const cells = generateCellDimensions(width, height, padding, seed);
  const renderMode = generateRenderMode(seed);
  const weightRange = generateWeightRange(seed);
  const foldStrategy = generateFoldStrategy(seed);
  const multiColor = generateMultiColorEnabled(seed);
  const levelColors = multiColor
    ? generateMultiColorPalette(seed, palette.bg, palette.text)
    : null;
  const maxFolds = generateMaxFolds(seed);

  // If folds is provided, use it; otherwise generate from seed (for random folds)
  let foldCount = folds;
  if (foldCount === null) {
    const foldRng = seededRandom(seed + 9999);
    foldCount = Math.floor(1 + foldRng() * 500); // Random between 1-500
  }

  return {
    seed,
    palette,
    cells,
    renderMode,
    weightRange,
    foldStrategy,
    multiColor,
    levelColors,
    maxFolds,
    folds: foldCount,
  };
}

// Calculate distribution statistics for a batch of outputs
function calculateBatchStats(batchItems) {
  const stats = {
    renderModes: {},
    foldStrategies: {},
    multiColorCount: 0,
    paletteArchetypes: {},
    paletteStructures: {},
    bgTemperatures: {},
    textTemperatures: {},
    cellSizeRanges: { small: 0, medium: 0, large: 0 },
    totalItems: batchItems.length,
    // Detailed color frequency
    bgColors: {},
    textColors: {},
    accentColors: {},
    // Color property distributions
    bgLuminance: { dark: 0, midDark: 0, mid: 0, midLight: 0, light: 0 },
    textLuminance: { dark: 0, midDark: 0, mid: 0, midLight: 0, light: 0 },
    bgSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
    textSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
    accentSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
  };

  for (const item of batchItems) {
    // Render mode distribution
    stats.renderModes[item.params.renderMode] =
      (stats.renderModes[item.params.renderMode] || 0) + 1;

    // Fold strategy distribution
    const stratType = item.params.foldStrategy.type;
    stats.foldStrategies[stratType] =
      (stats.foldStrategies[stratType] || 0) + 1;

    // Multi-color count
    if (item.params.multiColor) stats.multiColorCount++;

    // Palette archetype distribution (extract from strategy string)
    const paletteStrategy = item.params.palette.strategy;
    const [structure, archetype] = paletteStrategy.split("/");
    stats.paletteArchetypes[archetype || "unknown"] =
      (stats.paletteArchetypes[archetype || "unknown"] || 0) + 1;
    stats.paletteStructures[structure || "unknown"] =
      (stats.paletteStructures[structure || "unknown"] || 0) + 1;

    // Get VGA color objects for detailed analysis
    const bgColor = findVGAColor(item.params.palette.bg);
    const textColor = findVGAColor(item.params.palette.text);
    const accentColor = findVGAColor(item.params.palette.accent);

    // Temperature distributions
    stats.bgTemperatures[bgColor.temperature] =
      (stats.bgTemperatures[bgColor.temperature] || 0) + 1;
    stats.textTemperatures[textColor.temperature] =
      (stats.textTemperatures[textColor.temperature] || 0) + 1;

    // Hex color frequency (exact colors used)
    stats.bgColors[item.params.palette.bg] =
      (stats.bgColors[item.params.palette.bg] || 0) + 1;
    stats.textColors[item.params.palette.text] =
      (stats.textColors[item.params.palette.text] || 0) + 1;
    stats.accentColors[item.params.palette.accent] =
      (stats.accentColors[item.params.palette.accent] || 0) + 1;

    // Luminance distributions
    const getLumBucket = (lum) => {
      if (lum < 25) return "dark";
      if (lum < 45) return "midDark";
      if (lum < 65) return "mid";
      if (lum < 80) return "midLight";
      return "light";
    };
    stats.bgLuminance[getLumBucket(bgColor.luminance)]++;
    stats.textLuminance[getLumBucket(textColor.luminance)]++;

    // Saturation distributions
    stats.bgSaturation[bgColor.saturation]++;
    stats.textSaturation[textColor.saturation]++;
    stats.accentSaturation[accentColor.saturation]++;

    // Cell size ranges
    const cellArea = item.params.cells.cellW * item.params.cells.cellH;
    if (cellArea < 100) stats.cellSizeRanges.small++;
    else if (cellArea < 400) stats.cellSizeRanges.medium++;
    else stats.cellSizeRanges.large++;
  }

  return stats;
}

// ============ BATCH MODE COMPONENTS ============

// Mini canvas for grid thumbnails
function MiniCanvas({ params, folds, width, height, onClick, isSelected }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Render at smaller size for performance
    const thumbWidth = 120;
    const thumbHeight = 150;
    const scale = thumbWidth / width;

    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    // Background
    ctx.fillStyle = params.palette.bg;
    ctx.fillRect(0, 0, thumbWidth, thumbHeight);

    // Generate fold structure
    const innerWidth = width - DRAWING_MARGIN * 2;
    const innerHeight = height - DRAWING_MARGIN * 2;
    const { creases } = simulateFolds(
      innerWidth,
      innerHeight,
      folds,
      params.seed,
      params.weightRange,
      params.foldStrategy
    );

    // Simplified rendering - just draw creases as lines
    ctx.strokeStyle = params.palette.text;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.6;

    for (const crease of creases) {
      ctx.beginPath();
      ctx.moveTo(
        (crease.p1.x + DRAWING_MARGIN) * scale,
        (crease.p1.y + DRAWING_MARGIN) * scale
      );
      ctx.lineTo(
        (crease.p2.x + DRAWING_MARGIN) * scale,
        (crease.p2.y + DRAWING_MARGIN) * scale
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [params, folds, width, height]);

  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        border: isSelected ? "2px solid #4a9eff" : "2px solid transparent",
        borderRadius: 4,
        overflow: "hidden",
        transition: "border-color 0.15s, transform 0.15s",
        transform: isSelected ? "scale(1.02)" : "scale(1)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: 120,
          height: 150,
        }}
      />
    </div>
  );
}

// Distribution bar chart component
function DistributionBar({ label, data, colorFn }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9,
          color: "#777",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          height: 16,
          borderRadius: 3,
          overflow: "hidden",
          background: "#222",
        }}
      >
        {entries.map(([key, count], i) => (
          <div
            key={key}
            title={`${key}: ${count} (${Math.round((count / total) * 100)}%)`}
            style={{
              width: `${(count / total) * 100}%`,
              background: colorFn
                ? colorFn(key, i)
                : `hsl(${i * 47}, 50%, 45%)`,
              transition: "width 0.3s",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 6,
          fontSize: 8,
          color: "#666",
        }}
      >
        {entries.map(([key, count], i) => (
          <span
            key={key}
            style={{ display: "flex", alignItems: "center", gap: 3 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: colorFn
                  ? colorFn(key, i)
                  : `hsl(${i * 47}, 50%, 45%)`,
              }}
            />
            {key}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// Color frequency swatch grid component
function ColorFrequencyGrid({ label, colorData, totalItems }) {
  const entries = Object.entries(colorData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Top 20 colors

  if (entries.length === 0) return null;

  const maxCount = entries[0][1];
  const uniqueCount = Object.keys(colorData).length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 9,
          color: "#777",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "#555" }}>{uniqueCount} unique</span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
        }}
      >
        {entries.map(([hex, count]) => (
          <div
            key={hex}
            title={`${hex}: ${count} (${Math.round(
              (count / totalItems) * 100
            )}%)`}
            style={{
              width: 18,
              height: 18,
              background: hex,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.1)",
              position: "relative",
              cursor: "default",
            }}
          >
            {count > 1 && (
              <span
                style={{
                  position: "absolute",
                  bottom: -1,
                  right: -1,
                  background: "#000",
                  color: "#fff",
                  fontSize: 7,
                  padding: "0 2px",
                  borderRadius: 2,
                  lineHeight: 1.2,
                }}
              >
                {count}
              </span>
            )}
          </div>
        ))}
      </div>
      {entries.length > 0 && (
        <div style={{ fontSize: 8, color: "#555", marginTop: 4 }}>
          Most common: {entries[0][0]} ({entries[0][1]}x ={" "}
          {Math.round((entries[0][1] / totalItems) * 100)}%)
        </div>
      )}
    </div>
  );
}

// Statistics panel component
function BatchStats({ stats }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const renderModeColors = {
    normal: "#4a9eff",
    binary: "#ff6b6b",
    inverted: "#ffd93d",
    sparse: "#6bcb77",
    dense: "#9b59b6",
  };

  const strategyColors = {
    horizontal: "#e74c3c",
    vertical: "#3498db",
    diagonal: "#9b59b6",
    radial: "#f39c12",
    grid: "#1abc9c",
    clustered: "#e91e63",
    random: "#95a5a6",
  };

  const tempColors = {
    warm: "#ff7043",
    cool: "#42a5f5",
    neutral: "#90a4ae",
  };

  const lumColors = {
    dark: "#2c2c2c",
    midDark: "#555",
    mid: "#888",
    midLight: "#bbb",
    light: "#eee",
  };

  const satColors = {
    gray: "#888",
    muted: "#9a8a7a",
    chromatic: "#c49a6c",
    vivid: "#ff6b6b",
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div
      style={{
        background: "#1a1a1a",
        padding: 16,
        borderRadius: 6,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#aaa",
          marginBottom: 16,
          fontWeight: 500,
        }}
      >
        Distribution ({stats.totalItems} outputs)
      </div>

      <DistributionBar
        label="Render Mode"
        data={stats.renderModes}
        colorFn={(key) => renderModeColors[key] || "#666"}
      />

      <DistributionBar
        label="Fold Strategy"
        data={stats.foldStrategies}
        colorFn={(key) => strategyColors[key] || "#666"}
      />

      <DistributionBar
        label="Palette Archetype"
        data={stats.paletteArchetypes}
      />

      <DistributionBar
        label="Palette Structure"
        data={stats.paletteStructures}
      />

      <DistributionBar
        label="Cell Size"
        data={stats.cellSizeRanges}
        colorFn={(key) =>
          key === "small" ? "#6bcb77" : key === "medium" ? "#ffd93d" : "#ff6b6b"
        }
      />

      <div
        style={{ fontSize: 9, color: "#666", marginTop: 8, marginBottom: 12 }}
      >
        Multi-color enabled: {stats.multiColorCount} / {stats.totalItems} (
        {Math.round((stats.multiColorCount / stats.totalItems) * 100)}%)
      </div>

      {/* Collapsible Color Details Section */}
      <div style={{ borderTop: "1px solid #333", paddingTop: 12 }}>
        <button
          onClick={() => toggleSection("colors")}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 10,
            cursor: "pointer",
            padding: 0,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            marginBottom: expandedSection === "colors" ? 12 : 0,
          }}
        >
          <span style={{ fontSize: 8 }}>
            {expandedSection === "colors" ? "▼" : "▶"}
          </span>
          Color Frequency Details
        </button>

        {expandedSection === "colors" && (
          <div>
            <ColorFrequencyGrid
              label="Background Colors"
              colorData={stats.bgColors}
              totalItems={stats.totalItems}
            />
            <ColorFrequencyGrid
              label="Text Colors"
              colorData={stats.textColors}
              totalItems={stats.totalItems}
            />
            <ColorFrequencyGrid
              label="Accent Colors"
              colorData={stats.accentColors}
              totalItems={stats.totalItems}
            />
          </div>
        )}
      </div>

      {/* Collapsible Temperature & Luminance Section */}
      <div
        style={{ borderTop: "1px solid #333", paddingTop: 12, marginTop: 12 }}
      >
        <button
          onClick={() => toggleSection("properties")}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 10,
            cursor: "pointer",
            padding: 0,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            marginBottom: expandedSection === "properties" ? 12 : 0,
          }}
        >
          <span style={{ fontSize: 8 }}>
            {expandedSection === "properties" ? "▼" : "▶"}
          </span>
          Color Properties
        </button>

        {expandedSection === "properties" && (
          <div>
            <DistributionBar
              label="BG Temperature"
              data={stats.bgTemperatures}
              colorFn={(key) => tempColors[key] || "#666"}
            />
            <DistributionBar
              label="Text Temperature"
              data={stats.textTemperatures}
              colorFn={(key) => tempColors[key] || "#666"}
            />
            <DistributionBar
              label="BG Luminance"
              data={stats.bgLuminance}
              colorFn={(key) => lumColors[key] || "#666"}
            />
            <DistributionBar
              label="Text Luminance"
              data={stats.textLuminance}
              colorFn={(key) => lumColors[key] || "#666"}
            />
            <DistributionBar
              label="BG Saturation"
              data={stats.bgSaturation}
              colorFn={(key) => satColors[key] || "#666"}
            />
            <DistributionBar
              label="Text Saturation"
              data={stats.textSaturation}
              colorFn={(key) => satColors[key] || "#666"}
            />
            <DistributionBar
              label="Accent Saturation"
              data={stats.accentSaturation}
              colorFn={(key) => satColors[key] || "#666"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Detail modal component
function DetailModal({
  item,
  folds: defaultFolds,
  width,
  height,
  onClose,
  onSelect,
  batchItems,
  onNavigate,
}) {
  const folds =
    item?.params?.folds !== undefined ? item.params.folds : defaultFolds;
  const canvasRef = useRef(null);

  // Keyboard navigation
  useEffect(() => {
    if (!item || !batchItems || !onNavigate) return;

    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const currentIndex = batchItems.findIndex((i) => i.id === item.id);
        if (currentIndex === -1) return;

        if (e.key === "ArrowLeft" && currentIndex > 0) {
          onNavigate(batchItems[currentIndex - 1]);
        } else if (
          e.key === "ArrowRight" &&
          currentIndex < batchItems.length - 1
        ) {
          onNavigate(batchItems[currentIndex + 1]);
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, batchItems, onNavigate, onClose]);

  useEffect(() => {
    if (!item) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the shared renderToCanvas function
    const dataUrl = renderToCanvas({
      folds,
      seed: item.params.seed,
      outputWidth: width,
      outputHeight: height,
      bgColor: item.params.palette.bg,
      textColor: item.params.palette.text,
      accentColor: item.params.palette.accent,
      cellWidth: item.params.cells.cellW,
      cellHeight: item.params.cells.cellH,
      renderMode: item.params.renderMode,
      multiColor: item.params.multiColor,
      levelColors: item.params.levelColors,
      foldStrategy: item.params.foldStrategy,
    });

    // Load the data URL into an image and draw it to the canvas
    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = "100%";
      canvas.style.maxWidth = width + "px";
      canvas.style.height = "auto";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = dataUrl;
  }, [item, folds, width, height]);

  if (!item) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        zIndex: 1000,
        overflow: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          display: "flex",
          margin: "auto",
          padding: 20,
          gap: 30,
          maxWidth: "95vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Canvas preview */}
        <div style={{ flex: "0 0 auto" }}>
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              maxHeight: "85vh",
              width: "auto",
              borderRadius: 4,
            }}
          />
        </div>

        {/* Details panel */}
        <div
          style={{
            width: 280,
            background: "#111",
            padding: 20,
            borderRadius: 6,
            color: "#888",
            fontSize: 11,
            lineHeight: 1.8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#aaa",
                fontWeight: 500,
              }}
            >
              Seed #{item.params.seed}
              {item.params.folds !== undefined &&
                ` · ${item.params.folds} folds`}
            </div>
            {batchItems && onNavigate && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = batchItems.findIndex(
                      (i) => i.id === item.id
                    );
                    if (currentIndex > 0) {
                      onNavigate(batchItems[currentIndex - 1]);
                    }
                  }}
                  disabled={batchItems.findIndex((i) => i.id === item.id) === 0}
                  style={{
                    background:
                      batchItems.findIndex((i) => i.id === item.id) === 0
                        ? "#222"
                        : "#333",
                    border: "1px solid #444",
                    padding: "4px 8px",
                    color:
                      batchItems.findIndex((i) => i.id === item.id) === 0
                        ? "#444"
                        : "#aaa",
                    fontFamily: "inherit",
                    fontSize: 10,
                    cursor:
                      batchItems.findIndex((i) => i.id === item.id) === 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      batchItems.findIndex((i) => i.id === item.id) === 0
                        ? 0.5
                        : 1,
                  }}
                >
                  ←
                </button>
                <span style={{ fontSize: 9, color: "#555" }}>
                  {batchItems.findIndex((i) => i.id === item.id) + 1} /{" "}
                  {batchItems.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = batchItems.findIndex(
                      (i) => i.id === item.id
                    );
                    if (currentIndex < batchItems.length - 1) {
                      onNavigate(batchItems[currentIndex + 1]);
                    }
                  }}
                  disabled={
                    batchItems.findIndex((i) => i.id === item.id) ===
                    batchItems.length - 1
                  }
                  style={{
                    background:
                      batchItems.findIndex((i) => i.id === item.id) ===
                      batchItems.length - 1
                        ? "#222"
                        : "#333",
                    border: "1px solid #444",
                    padding: "4px 8px",
                    color:
                      batchItems.findIndex((i) => i.id === item.id) ===
                      batchItems.length - 1
                        ? "#444"
                        : "#aaa",
                    fontFamily: "inherit",
                    fontSize: 10,
                    cursor:
                      batchItems.findIndex((i) => i.id === item.id) ===
                      batchItems.length - 1
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      batchItems.findIndex((i) => i.id === item.id) ===
                      batchItems.length - 1
                        ? 0.5
                        : 1,
                  }}
                >
                  →
                </button>
              </div>
            )}
          </div>
          {batchItems && onNavigate && (
            <div
              style={{
                fontSize: 8,
                color: "#444",
                marginBottom: 12,
                fontStyle: "italic",
              }}
            >
              Use ← → arrow keys to navigate
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div
              style={{ color: "#666", fontSize: 9, textTransform: "uppercase" }}
            >
              Palette
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: item.params.palette.bg,
                  border: "1px solid #333",
                  borderRadius: 3,
                }}
                title={`BG: ${item.params.palette.bg}`}
              />
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: item.params.palette.text,
                  border: "1px solid #333",
                  borderRadius: 3,
                }}
                title={`Text: ${item.params.palette.text}`}
              />
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: item.params.palette.accent,
                  border: "1px solid #333",
                  borderRadius: 3,
                }}
                title={`Accent: ${item.params.palette.accent}`}
              />
            </div>
            <div style={{ color: "#555", fontSize: 9, marginTop: 4 }}>
              {item.params.palette.strategy}
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Folds
              </div>
              <div>
                {item.params.folds !== undefined ? item.params.folds : folds}
              </div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Cell Size
              </div>
              <div>
                {item.params.cells.cellW} x {item.params.cells.cellH}
              </div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Render Mode
              </div>
              <div>{item.params.renderMode}</div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Fold Strategy
              </div>
              <div>{item.params.foldStrategy.type}</div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Max Folds
              </div>
              <div>{item.params.maxFolds}</div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Multi-Color
              </div>
              <div>{item.params.multiColor ? "Yes" : "No"}</div>
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  fontSize: 9,
                  textTransform: "uppercase",
                }}
              >
                Weight Range
              </div>
              <div>
                {item.params.weightRange.min.toFixed(2)} -{" "}
                {item.params.weightRange.max.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            onClick={() => onSelect(item)}
            style={{
              marginTop: 20,
              width: "100%",
              background: "#333",
              border: "1px solid #444",
              padding: "10px 16px",
              color: "#aaa",
              fontFamily: "inherit",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            Use This Seed
          </button>

          <button
            onClick={onClose}
            style={{
              marginTop: 8,
              width: "100%",
              background: "#222",
              border: "1px solid #333",
              padding: "10px 16px",
              color: "#666",
              fontFamily: "inherit",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Main batch mode component
function BatchMode({ folds, width, height, onSelectSeed, onClose }) {
  const [batchSize, setBatchSize] = useState(24);
  const [batchItems, setBatchItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [randomFolds, setRandomFolds] = useState(false);
  const [batchFolds, setBatchFolds] = useState(folds);

  // Sync batchFolds when folds prop changes
  useEffect(() => {
    setBatchFolds(folds);
  }, [folds]);

  const generateBatch = useCallback(() => {
    setIsGenerating(true);
    const items = [];
    const usedSeeds = new Set();

    for (let i = 0; i < batchSize; i++) {
      let seed;
      do {
        seed = Math.floor(Math.random() * 99999) + 1;
      } while (usedSeeds.has(seed));
      usedSeeds.add(seed);

      items.push({
        id: `${seed}-${Date.now()}-${i}`,
        params: generateAllParams(
          seed,
          width,
          height,
          0,
          randomFolds ? null : batchFolds
        ),
      });
    }

    setBatchItems(items);
    setIsGenerating(false);
  }, [batchSize, width, height, randomFolds, batchFolds]);

  // Generate initial batch on mount
  useEffect(() => {
    if (batchItems.length === 0) {
      generateBatch();
    }
  }, []);

  const stats = useMemo(() => calculateBatchStats(batchItems), [batchItems]);

  const handleSelectItem = (item) => {
    onSelectSeed(item.params.seed);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0a0a0a",
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #222",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#111",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 13,
              color: "#aaa",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Batch Explorer
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 10, color: "#666" }}>Size:</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={batchSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setBatchSize(Math.max(1, Math.min(1000, val)));
                }}
                style={{
                  background: "#222",
                  border: "1px solid #333",
                  color: "#aaa",
                  padding: "4px 8px",
                  fontSize: 10,
                  fontFamily: "inherit",
                  width: 60,
                  textAlign: "center",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[12, 24, 48, 100, 200].map((size) => (
                  <button
                    key={size}
                    onClick={() => setBatchSize(size)}
                    style={{
                      background: batchSize === size ? "#444" : "#222",
                      border: "1px solid #333",
                      color: batchSize === size ? "#ccc" : "#666",
                      padding: "4px 8px",
                      fontSize: 9,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingLeft: 12,
                borderLeft: "1px solid #333",
              }}
            >
              <label style={{ fontSize: 10, color: "#666" }}>Folds:</label>
              <input
                type="number"
                min={0}
                max={200}
                value={batchFolds}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setBatchFolds(Math.max(0, Math.min(200, val)));
                }}
                disabled={randomFolds}
                style={{
                  background: randomFolds ? "#1a1a1a" : "#222",
                  border: "1px solid #333",
                  color: randomFolds ? "#444" : "#aaa",
                  padding: "4px 8px",
                  fontSize: 10,
                  fontFamily: "inherit",
                  width: 60,
                  textAlign: "center",
                  cursor: randomFolds ? "not-allowed" : "text",
                }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 9,
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={randomFolds}
                  onChange={(e) => setRandomFolds(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Random</span>
              </label>
            </div>

            <button
              onClick={generateBatch}
              disabled={isGenerating}
              style={{
                background: "#333",
                border: "1px solid #444",
                color: "#aaa",
                padding: "6px 16px",
                fontSize: 9,
                fontFamily: "inherit",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: isGenerating ? "wait" : "pointer",
                opacity: isGenerating ? 0.6 : 1,
              }}
            >
              {isGenerating ? "Generating..." : "Generate New Batch"}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "#222",
            border: "1px solid #333",
            color: "#888",
            padding: "8px 16px",
            fontSize: 10,
            fontFamily: "inherit",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Grid */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 12,
            }}
          >
            {batchItems.map((item) => (
              <div key={item.id} style={{ position: "relative" }}>
                <MiniCanvas
                  params={item.params}
                  folds={
                    item.params.folds !== undefined ? item.params.folds : folds
                  }
                  width={width}
                  height={height}
                  onClick={() => setSelectedItem(item)}
                  isSelected={selectedItem?.id === item.id}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    right: 4,
                    fontSize: 8,
                    color: "#fff",
                    background: "rgba(0,0,0,0.7)",
                    padding: "2px 4px",
                    borderRadius: 2,
                    textAlign: "center",
                  }}
                >
                  #{item.params.seed}
                  {item.params.folds !== undefined &&
                    ` · ${item.params.folds}f`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats sidebar */}
        <div
          style={{
            width: 300,
            borderLeft: "1px solid #222",
            background: "#111",
            padding: 16,
            overflow: "auto",
          }}
        >
          <BatchStats stats={stats} />

          <div
            style={{
              fontSize: 9,
              color: "#555",
              lineHeight: 1.8,
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid #222",
            }}
          >
            <div style={{ color: "#777", marginBottom: 8 }}>Quick Tips:</div>
            <div>Click any thumbnail to view details</div>
            <div>Use "Use This Seed" to apply settings</div>
            <div>Generate new batches to explore variations</div>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          folds={batchFolds}
          width={width}
          height={height}
          onClose={() => setSelectedItem(null)}
          onSelect={handleSelectItem}
          batchItems={batchItems}
          onNavigate={setSelectedItem}
        />
      )}
    </div>
  );
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
  colGap = 0,
  rowGap = 0,
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

  // Calculate scale factors to maintain consistent grid structure
  const scaleX = width / REFERENCE_WIDTH;
  const scaleY = height / REFERENCE_HEIGHT;

  // Calculate reference drawing area (always based on reference dimensions)
  const refInnerWidth = REFERENCE_WIDTH - padding * 2 - DRAWING_MARGIN * 2;
  const refInnerHeight = REFERENCE_HEIGHT - padding * 2 - DRAWING_MARGIN * 2;
  const refOffsetX = padding + DRAWING_MARGIN;
  const refOffsetY = padding + DRAWING_MARGIN;

  // Calculate actual gap sizes (as multiples of 0.5 * cell dimension)
  const actualColGap = colGap * 0.5 * charWidth;
  const actualRowGap = rowGap * 0.5 * charHeight;

  // Grid calculations based on reference dimensions (ensures consistent structure)
  // Account for gaps: total width = cols * charWidth + (cols - 1) * actualColGap
  // Solving for cols: cols = (refInnerWidth + actualColGap) / (charWidth + actualColGap)
  const cols = Math.max(
    1,
    Math.floor((refInnerWidth + actualColGap) / (charWidth + actualColGap))
  );
  const rows = Math.max(
    1,
    Math.floor((refInnerHeight + actualRowGap) / (charHeight + actualRowGap))
  );

  // Calculate reference cell dimensions including gap (always consistent)
  // Total cell stride = cell content + gap (except last cell has no trailing gap)
  const refCellWidth = charWidth;
  const refCellHeight = charHeight;
  const refCellStrideX = charWidth + actualColGap;
  const refCellStrideY = charHeight + actualRowGap;

  // Scale to actual output dimensions
  const innerWidth = refInnerWidth * scaleX;
  const innerHeight = refInnerHeight * scaleY;
  const offsetX = (padding + DRAWING_MARGIN) * scaleX;
  const offsetY = (padding + DRAWING_MARGIN) * scaleY;

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

    // Calculate actual cell dimensions (scaled)
    const actualCharWidth = refCellWidth * scaleX;
    const actualCharHeight = refCellHeight * scaleY;
    const actualStrideX = refCellStrideX * scaleX;
    const actualStrideY = refCellStrideY * scaleY;

    // Generate fold structure with weights (in reference space, then scale)
    const { creases, finalShape, maxFolds, lastFoldTarget } = simulateFolds(
      refInnerWidth,
      refInnerHeight,
      folds,
      seed,
      weightRange,
      foldStrategy
    );

    // Scale creases from reference space to actual output space
    const scaledCreases = creases.map((crease) => ({
      ...crease,
      p1: {
        x: crease.p1.x * scaleX,
        y: crease.p1.y * scaleY,
      },
      p2: {
        x: crease.p2.x * scaleX,
        y: crease.p2.y * scaleY,
      },
    }));

    // Scale last fold target to actual output space and determine cell
    let lastFoldTargetCell = null;
    if (lastFoldTarget) {
      const scaledTargetX = lastFoldTarget.x * scaleX;
      const scaledTargetY = lastFoldTarget.y * scaleY;
      const targetCol = Math.floor(scaledTargetX / actualStrideX);
      const targetRow = Math.floor(scaledTargetY / actualStrideY);
      if (
        targetCol >= 0 &&
        targetCol < cols &&
        targetRow >= 0 &&
        targetRow < rows
      ) {
        lastFoldTargetCell = `${targetCol},${targetRow}`;
      }
      console.log(
        `[Last fold target] raw: (${lastFoldTarget.x.toFixed(
          1
        )}, ${lastFoldTarget.y.toFixed(1)}) → cell: ${lastFoldTargetCell}`
      );
    } else {
      console.log(`[Last fold target] none`);
    }

    // Scale finalShape from reference space to actual output space
    const scaledFinalShape = finalShape.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    }));

    // Process creases - find all intersections (use stride for cell positioning when gaps exist)
    const {
      activeCreases,
      intersections: activeIntersections,
      cellWeights: intersectionWeight,
      cellMaxGap,
      cellIntersectionCounts,
    } = processCreases(
      scaledCreases,
      cols,
      rows,
      actualStrideX,
      actualStrideY,
      maxFolds
    );

    // For rendering
    const creasesForRender = activeCreases;

    // Report stats to parent component
    if (onStatsUpdate) {
      onStatsUpdate({
        intersections: activeIntersections.length,
        creases: activeCreases.length,
        destroyed: 0,
        maxFolds: maxFolds,
      });
    }

    // Font setup (scaled to actual output size)
    ctx.font = `${
      actualCharHeight - 2 * scaleY
    }px "Courier New", Courier, monospace`;
    ctx.textBaseline = "top";

    // Block shade characters - graduated density, no solid blocks
    const shadeChars = [" ", "░", "▒", "▓"];

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
      const fontSize = Math.floor(
        Math.min(actualCharWidth * 0.45, actualCharHeight * 0.7)
      );
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = Math.round(
            offsetX + col * actualStrideX + actualCharWidth / 2
          );
          const y = Math.round(
            offsetY + row * actualStrideY + actualCharHeight / 2
          );
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
          const x = Math.round(offsetX + col * actualStrideX);
          const y = Math.round(offsetY + row * actualStrideY);
          const key = `${col},${row}`;
          const weight = intersectionWeight[key] || 0;

          // Determine what to draw based on render mode
          let char = null;
          let color = textColor;
          let level = -1;

          // Helper to get color based on level (for multiColor mode) - no breathing
          const getColorForLevel = (lvl, cellKey) => {
            if (multiColor && levelColors) {
              return levelColors[Math.min(lvl, 3)];
            }
            return textColor;
          };

          // Last fold target cell gets accent color (or text color if no accent)
          if (lastFoldTargetCell === key) {
            char = shadeChars[3];
            level = 3;
            color = accentColor || textColor;
          } else if (accentCells.has(key) && weight > 0) {
            char = shadeChars[2];
            level = 2;
            color = accentColor;
          } else if (weight >= 1.5) {
            // EXTREME: 1.5+ intersection weight (dense intersections) - extra hue shift
            const extremeAmount = weight - 1.5;
            // Scale extreme amount for 0-2 range (two creases max = 2.0)
            const baseShift = 30 + Math.min(extremeAmount * 300, 150);
            const baseHsl = hexToHsl(textColor);
            const newHue = (baseHsl.h + baseShift + 360) % 360;
            const newSat = Math.min(100, baseHsl.s + 20);
            const newLight = Math.min(85, baseHsl.l + 10);
            char = shadeChars[3];
            level = 3;
            color = hslToHex(newHue, newSat, newLight);
          } else if (renderMode === "normal") {
            level = countToLevelAdaptive(weight, thresholds);
            char = shadeChars[level];
            color = getColorForLevel(level, key);
          } else if (renderMode === "binary") {
            if (weight === 0) {
              char = shadeChars[0];
              level = 0;
              color = getColorForLevel(0, key);
            } else {
              char = shadeChars[3];
              level = 3;
              color = getColorForLevel(3, key);
            }
          } else if (renderMode === "inverted") {
            level = 3 - countToLevelAdaptive(weight, thresholds);
            char = shadeChars[level];
            color = getColorForLevel(level, key);
          } else if (renderMode === "sparse") {
            level = countToLevelAdaptive(weight, thresholds);
            if (level === 1) {
              char = shadeChars[1];
              color = getColorForLevel(1, key);
            }
          } else if (renderMode === "dense") {
            level = countToLevelAdaptive(weight, thresholds);
            if (level >= 2) {
              char = shadeChars[level];
              color = getColorForLevel(level, key);
            } else if (weight === 0) {
              char = shadeChars[0];
              level = 0;
              color = getColorForLevel(0, key);
            }
          }

          if (char) {
            // Always use getColorForLevel to ensure VGA palette colors
            const finalColor = getColorForLevel(
              countToLevelAdaptive(weight, thresholds),
              key
            );
            // Last fold target gets accent color, then accent cells, then normal color
            ctx.fillStyle =
              lastFoldTargetCell === key
                ? accentColor || textColor
                : accentCells.has(key) && weight > 0
                ? accentColor
                : finalColor;

            // Fill the entire cell width with characters - use aggressive overlap to eliminate gaps
            const measuredCharWidth = ctx.measureText(char).width;
            // Calculate exact cell boundary (cell content area, not including gap)
            const cellEndX = x + actualCharWidth;

            // Draw characters with tight overlap (95% of width) to ensure no gaps
            let currentX = x;
            let charIndex = 0;
            const overlapFactor = 0.95; // Use 95% of width = 5% overlap to eliminate gaps

            while (currentX < cellEndX && level >= 0) {
              let nextChar = char;
              if (level >= 2 && charIndex > 0 && charIndex % 2 === 0) {
                nextChar = shadeChars[Math.max(0, level - 1)];
              }

              const nextCharWidth = ctx.measureText(nextChar).width;
              const remainingWidth = cellEndX - currentX;

              if (remainingWidth <= 0) break;

              // Always draw character, ensuring it reaches or extends past boundary if last
              if (remainingWidth < nextCharWidth * 1.1) {
                // Close to end - ensure character extends to boundary
                ctx.fillText(nextChar, cellEndX - nextCharWidth, y);
                break;
              } else {
                // Draw with overlap to ensure no gaps
                ctx.fillText(nextChar, currentX, y);
                currentX += nextCharWidth * overlapFactor;
              }

              charIndex++;
            }
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
        ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
        ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
        ctx.stroke();
      }

      // Draw circle at last fold target
      if (lastFoldTarget) {
        const targetX = offsetX + lastFoldTarget.x * scaleX;
        const targetY = offsetY + lastFoldTarget.y * scaleY;
        const radius = 8;
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    // Draw paper shape if enabled
    if (showPaperShape) {
      if (scaledFinalShape.length >= 3) {
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(
          offsetX + scaledFinalShape[0].x,
          offsetY + scaledFinalShape[0].y
        );
        for (let i = 1; i < scaledFinalShape.length; i++) {
          ctx.lineTo(
            offsetX + scaledFinalShape[i].x,
            offsetY + scaledFinalShape[i].y
          );
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

export default function FoldedPaper() {
  const [folds, setFolds] = useState(15);
  const [seed, setSeed] = useState(42);
  const [showUI, setShowUI] = useState(true);
  const [padding, setPadding] = useState(0);
  const [colorScheme, setColorScheme] = useState("generative");
  const [randomizeFolds, setRandomizeFolds] = useState(false);

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

  // Canvas size (1200 and 1500 have many divisors for clean grid)
  const height = 1500;
  const width = 1200;

  // Initialize from generative palette and cell dimensions
  const initialPalette = generatePalette(42);
  const initialCells = generateCellDimensions(1200, 1500, 0, 42);
  const initialRenderMode = generateRenderMode(42);
  const initialMultiColor = generateMultiColorEnabled(42);
  const initialFoldStrategy = generateFoldStrategy(42);
  const [bgColor, setBgColor] = useState(initialPalette.bg);
  const [textColor, setTextColor] = useState(initialPalette.text);
  const [accentColor, setAccentColor] = useState(initialPalette.accent);
  const [cellWidth, setCellWidth] = useState(initialCells.cellW);
  const [cellHeight, setCellHeight] = useState(initialCells.cellH);
  const [colGap, setColGap] = useState(0); // Gap between columns as multiple of 0.5 * cellWidth
  const [rowGap, setRowGap] = useState(0); // Gap between rows as multiple of 0.5 * cellHeight
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
  const [maxFoldsValue, setMaxFoldsValue] = useState(0); // Track maxFolds from canvas
  const [showBatchMode, setShowBatchMode] = useState(false); // Batch explorer mode

  // Preset palettes for reference/quick access: [name, background, text, accent]
  // All colors are from the VGA 256-color palette (web-safe + CGA)
  const presetPalettes = [
    ["cream", "#FFFFCC", "#333333", "#AA0000"], // VGA cream paper
    ["paper", "#FFFFFF", "#0000AA", "#FF0000"], // Classic CGA paper
    ["ink", "#000000", "#00CCFF", "#FF5555"], // Dark terminal
    ["amber", "#FFCC99", "#663300", "#0066CC"], // Warm amber
    ["blue/gold", "#0033FF", "#FFFF00", "#FFFFFF"], // Bold blue/gold
    ["red/gold", "#FF0000", "#FFFF55", "#FFFFFF"], // CGA red/yellow
    ["forest", "#003300", "#99FF99", "#FFCC00"], // Deep forest
    ["lavender", "#CCCCFF", "#330066", "#FF0066"], // Soft purple
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

  // Calculate stats using inner dimensions (accounting for gaps)
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const effectiveColGap = colGap * 0.5 * cellWidth;
  const effectiveRowGap = rowGap * 0.5 * cellHeight;
  const cols = Math.floor(
    (innerWidth + effectiveColGap) / (cellWidth + effectiveColGap)
  );
  const rows = Math.floor(
    (innerHeight + effectiveRowGap) / (cellHeight + effectiveRowGap)
  );
  const totalCells = cols * rows;
  const weightRange = generateWeightRange(seed);
  const { creases, finalShape, maxFolds } = simulateFolds(
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

  // Calculate display scale to fit canvas in viewport
  const aspectRatio = width / height;
  const maxDisplayHeight =
    typeof window !== "undefined" ? window.innerHeight - 40 : 800;
  const displayHeight = Math.min(height, maxDisplayHeight);
  const displayWidth = Math.round(displayHeight * aspectRatio);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a1a1a",
        display: "flex",
        fontFamily: 'ui-monospace, "Courier New", monospace',
        color: "#888",
      }}
    >
      {/* Main Canvas Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              transform: `scale(${displayHeight / height})`,
              transformOrigin: "top center",
            }}
          >
            <ASCIICanvas
              key={`${folds}-${seed}-${cellWidth}-${cellHeight}-${colGap}-${rowGap}-${padding}-${bgColor}-${textColor}-${accentColor}-${renderMode}-${multiColor}-${foldStrategy?.type}-${showCreases}-${showPaperShape}-${showHitCounts}`}
              width={width}
              height={height}
              folds={folds}
              seed={seed}
              bgColor={bgColor}
              textColor={textColor}
              accentColor={accentColor}
              cellWidth={cellWidth}
              cellHeight={cellHeight}
              colGap={colGap}
              rowGap={rowGap}
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
                setMaxFoldsValue(stats.maxFolds || 0);
              }}
            />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div
        style={{
          width: showUI ? 320 : 0,
          minWidth: showUI ? 320 : 0,
          background: "#111",
          borderLeft: showUI ? "1px solid #333" : "none",
          overflow: "hidden",
          transition: "width 0.2s, min-width 0.2s",
        }}
      >
        <div
          style={{
            width: 320,
            height: "100vh",
            overflowY: "auto",
            padding: showUI ? 20 : 0,
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div
            style={{
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: "1px solid #333",
            }}
          >
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#aaa",
                marginBottom: 8,
              }}
            >
              Fold #{folds}
            </div>
            <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
              seed {seed} · {foldStrategy?.type || "random"} · {renderMode}
              {multiColor ? " · multi" : ""}
              <br />
              {creaseCount} creases · {intersectionCount} intersections ·
              maxFolds: {maxFoldsValue}
            </div>
            <button
              onClick={downloadSingleToken}
              style={{
                marginTop: 12,
                background: "#222",
                border: "1px solid #444",
                padding: "8px 16px",
                color: "#aaa",
                fontFamily: "inherit",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Download PNG
            </button>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Folds */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  color: "#777",
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
                    background: "#222",
                    border: "1px solid #444",
                    padding: "4px 8px",
                    color: "#ccc",
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
                style={{ width: "100%", accentColor: "#666" }}
              />
            </div>

            {/* Seed */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  color: "#777",
                }}
              >
                Seed
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 1)}
                  style={{
                    flex: 1,
                    background: "#222",
                    border: "1px solid #444",
                    padding: "6px 8px",
                    color: "#ccc",
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
                    // Randomize gaps (0-4, where value represents multiples of 0.5)
                    setColGap(Math.floor(Math.random() * 5));
                    setRowGap(Math.floor(Math.random() * 5));
                  }}
                  style={{
                    background: "#333",
                    border: "1px solid #444",
                    padding: "6px 12px",
                    color: "#aaa",
                    fontFamily: "inherit",
                    fontSize: 9,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Random
                </button>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 9,
                  cursor: "pointer",
                  marginTop: 6,
                  color: "#666",
                }}
              >
                <input
                  type="checkbox"
                  checked={randomizeFolds}
                  onChange={(e) => setRandomizeFolds(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#666" }}
                />
                Randomize folds too
              </label>
            </div>

            {/* Palette */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  color: "#777",
                }}
              >
                Palette
              </div>
              <select
                value={colorScheme}
                onChange={(e) => handlePaletteChange(e.target.value)}
                style={{
                  width: "100%",
                  background: "#222",
                  border: "1px solid #444",
                  padding: "6px 8px",
                  color: "#ccc",
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

            {/* Colors */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                  color: "#777",
                }}
              >
                Colors
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#666", width: 40 }}>
                    BG
                  </span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{
                      width: 28,
                      height: 22,
                      padding: 0,
                      border: "1px solid #444",
                      cursor: "pointer",
                      background: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{
                      flex: 1,
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#666", width: 40 }}>
                    Text
                  </span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    style={{
                      width: 28,
                      height: 22,
                      padding: 0,
                      border: "1px solid #444",
                      cursor: "pointer",
                      background: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    style={{
                      flex: 1,
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#666", width: 40 }}>
                    Accent
                  </span>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{
                      width: 28,
                      height: 22,
                      padding: 0,
                      border: "1px solid #444",
                      cursor: "pointer",
                      background: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{
                      flex: 1,
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                    }}
                  />
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 9,
                  cursor: "pointer",
                  marginTop: 8,
                  color: "#666",
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
                  style={{ cursor: "pointer", accentColor: "#666" }}
                />
                Multi-color mode
              </label>
            </div>

            {/* Debug Options */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                  color: "#777",
                }}
              >
                Debug
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9,
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showCreases}
                    onChange={(e) => setShowCreases(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#666" }}
                  />
                  Show creases
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9,
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showPaperShape}
                    onChange={(e) => setShowPaperShape(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#666" }}
                  />
                  Show paper shape
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9,
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showHitCounts}
                    onChange={(e) => setShowHitCounts(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#666" }}
                  />
                  Show hit counts
                </label>
              </div>
            </div>

            {/* Fold Strategy */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  color: "#777",
                }}
              >
                Fold Strategy
              </div>
              <select
                value={strategyOverride}
                onChange={(e) => {
                  const value = e.target.value;
                  setStrategyOverride(value);
                  if (value === "auto") {
                    setFoldStrategy(generateFoldStrategy(seed));
                  } else {
                    const rng = seededRandom(seed + 6666);
                    rng();
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
                  width: "100%",
                  background: "#222",
                  border: "1px solid #444",
                  padding: "6px 8px",
                  color: "#ccc",
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
            </div>

            {/* Cell Dimensions */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                  color: "#777",
                }}
              >
                Cell Size
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                    Width
                  </div>
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
                      width: "100%",
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                    Height
                  </div>
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
                      width: "100%",
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                    Padding
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={padding}
                    onChange={(e) =>
                      setPadding(
                        Math.max(
                          0,
                          Math.min(100, parseInt(e.target.value) || 0)
                        )
                      )
                    }
                    style={{
                      width: "100%",
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#555", marginBottom: 8 }}>
                Grid: {cols} × {rows} = {totalCells} cells
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { label: "1:1", w: 10, h: 10 },
                  { label: "Text", w: 9, h: 14 },
                  { label: "Golden", w: 9, h: 14 },
                  { label: "Paper", w: 18, h: 25 },
                ].map(({ label, w, h }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setCellWidth(
                        snapToDivisor(w, innerWidth, CELL_MIN, CELL_MAX)
                      );
                      setCellHeight(
                        snapToDivisor(h, innerHeight, CELL_MIN, CELL_MAX)
                      );
                    }}
                    style={{
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 10px",
                      color: "#888",
                      fontFamily: "inherit",
                      fontSize: 8,
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Cell Gaps */}
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginTop: 12,
                  marginBottom: 8,
                  color: "#777",
                }}
              >
                Cell Gaps
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                    Col Gap (×0.5w)
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={1}
                    value={colGap}
                    onChange={(e) =>
                      setColGap(
                        Math.max(0, Math.min(4, parseInt(e.target.value) || 0))
                      )
                    }
                    style={{
                      width: "100%",
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                    Row Gap (×0.5h)
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={1}
                    value={rowGap}
                    onChange={(e) =>
                      setRowGap(
                        Math.max(0, Math.min(4, parseInt(e.target.value) || 0))
                      )
                    }
                    style={{
                      width: "100%",
                      background: "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: "#ccc",
                      fontFamily: "inherit",
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#555", marginBottom: 8 }}>
                Gap: {(colGap * 0.5 * cellWidth).toFixed(1)}px ×{" "}
                {(rowGap * 0.5 * cellHeight).toFixed(1)}px
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setShowUI(!showUI)}
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          background: "#222",
          border: "1px solid #444",
          padding: "8px 12px",
          color: "#888",
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: "pointer",
          zIndex: 100,
        }}
      >
        {showUI ? "Hide" : "Show"}
      </button>

      {/* Batch Mode Button */}
      <button
        onClick={() => setShowBatchMode(true)}
        style={{
          position: "fixed",
          top: 20,
          right: showUI ? 340 : 80,
          background: "#333",
          border: "1px solid #555",
          padding: "8px 12px",
          color: "#aaa",
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: "pointer",
          zIndex: 100,
          transition: "right 0.2s",
        }}
      >
        Batch
      </button>

      {/* Batch Mode Overlay */}
      {showBatchMode && (
        <BatchMode
          folds={folds}
          width={width}
          height={height}
          onSelectSeed={(newSeed) => {
            setSeed(newSeed);
            if (colorScheme === "generative") {
              const palette = generatePalette(newSeed);
              setBgColor(palette.bg);
              setTextColor(palette.text);
              setAccentColor(palette.accent);
              const cells = generateCellDimensions(
                width,
                height,
                padding,
                newSeed
              );
              setCellWidth(cells.cellW);
              setCellHeight(cells.cellH);
              setRenderMode(generateRenderMode(newSeed));
              const newMultiColor = generateMultiColorEnabled(newSeed);
              setMultiColor(newMultiColor);
              setLevelColors(
                newMultiColor
                  ? generateMultiColorPalette(newSeed, palette.bg, palette.text)
                  : null
              );
              if (strategyOverride === "auto") {
                setFoldStrategy(generateFoldStrategy(newSeed));
              }
            }
          }}
          onClose={() => setShowBatchMode(false)}
        />
      )}
    </div>
  );
}
