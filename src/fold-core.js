// ============ FOLD CORE ============
// Pure rendering logic for on-chain generative art
// This module has no React dependencies and can be used standalone

// ============ GLOBAL CONSTANTS ============

export const CELL_MIN = 4;
export const CELL_MAX = 600;
export const CELL_ASPECT_MAX = 3;
export const DRAWING_MARGIN = 50;
export const REFERENCE_WIDTH = 1200;
export const REFERENCE_HEIGHT = 1500;

// ============ VGA 256-COLOR PALETTE SYSTEM ============

const VGA_LEVELS = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];

export function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function getLuminance(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  return (0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm) * 100;
}

export function getTemperature(r, g, b) {
  const warmth = r - b;
  if (Math.abs(warmth) < 30 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
    return "neutral";
  }
  return warmth > 0 ? "warm" : "cool";
}

export function getSaturationTier(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta < 20) return "gray";
  if (delta < 80) return "muted";
  if (delta < 160) return "chromatic";
  return "vivid";
}

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
          cubePos: { ri, gi, bi },
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
      cubePos: null,
      luminance: getLuminance(r, g, b),
      temperature: getTemperature(r, g, b),
      saturation: getSaturationTier(r, g, b),
      type: "cga",
      name: c.name,
    };
  });
}

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

export const VGA_PALETTE = [
  ...buildWebSafeColors(),
  ...buildCGAColors(),
  ...buildGrayscaleColors(),
];

export const PALETTE_BY_LUMINANCE = {
  dark: VGA_PALETTE.filter((c) => c.luminance < 30),
  midDark: VGA_PALETTE.filter((c) => c.luminance >= 20 && c.luminance < 50),
  mid: VGA_PALETTE.filter((c) => c.luminance >= 40 && c.luminance < 70),
  midLight: VGA_PALETTE.filter((c) => c.luminance >= 55 && c.luminance < 85),
  light: VGA_PALETTE.filter((c) => c.luminance >= 70),
};

export const PALETTE_BY_TEMPERATURE = {
  warm: VGA_PALETTE.filter((c) => c.temperature === "warm"),
  cool: VGA_PALETTE.filter((c) => c.temperature === "cool"),
  neutral: VGA_PALETTE.filter((c) => c.temperature === "neutral"),
};

export const PALETTE_BY_SATURATION = {
  gray: VGA_PALETTE.filter((c) => c.saturation === "gray"),
  muted: VGA_PALETTE.filter((c) => c.saturation === "muted"),
  chromatic: VGA_PALETTE.filter((c) => c.saturation === "chromatic"),
  vivid: VGA_PALETTE.filter((c) => c.saturation === "vivid"),
};

export const ACCENT_POOL = VGA_PALETTE.filter(
  (c) =>
    c.saturation === "vivid" || (c.type === "cga" && c.saturation !== "gray")
);

// ============ COLOR UTILITIES ============

export function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

export function getCubeNeighbors(color, maxSteps) {
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

export function getComplementaryRegion(color) {
  if (!color.cubePos) {
    const oppTemp =
      color.temperature === "warm"
        ? "cool"
        : color.temperature === "cool"
        ? "warm"
        : "neutral";
    return PALETTE_BY_TEMPERATURE[oppTemp];
  }

  const { ri, gi, bi } = color.cubePos;
  const oppRi = ri < 3 ? 4 : 1;
  const oppGi = gi < 3 ? 4 : 1;
  const oppBi = bi < 3 ? 4 : 1;

  return VGA_PALETTE.filter((c) => {
    if (!c.cubePos) return false;
    return (
      Math.abs(c.cubePos.ri - oppRi) <= 1 &&
      Math.abs(c.cubePos.gi - oppGi) <= 1 &&
      Math.abs(c.cubePos.bi - oppBi) <= 1
    );
  });
}

export function getCubeDiagonalPath(startColor, endColor, steps) {
  if (!startColor.cubePos || !endColor.cubePos) {
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

export function interpolateByLuminance(startColor, endColor, steps) {
  const startLum = startColor.luminance;
  const endLum = endColor.luminance;

  const path = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const targetLum = startLum + (endLum - startLum) * t;

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

export function hasGoodContrast(c1, c2, minRatio = 4.5) {
  const l1 = c1.luminance / 100;
  const l2 = c2.luminance / 100;
  const lighter = Math.max(l1, l2) + 0.05;
  const darker = Math.min(l1, l2) + 0.05;
  return lighter / darker >= minRatio;
}

export function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickBiased(rng, arr, bias) {
  const idx = Math.floor(rng() * arr.length);
  if (bias === "start") {
    return arr[Math.floor(idx * rng())];
  } else if (bias === "end") {
    return arr[arr.length - 1 - Math.floor((arr.length - 1 - idx) * rng())];
  }
  return arr[idx];
}

// ============ HSL UTILITIES ============

export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function hslToHex(h, s, l) {
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

export function hexToHsl(hex) {
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

export function findConfusableColors(color, lumTolerance = 10) {
  return VGA_PALETTE.filter(
    (c) =>
      c.hex !== color.hex &&
      Math.abs(c.luminance - color.luminance) < lumTolerance &&
      (c.temperature !== color.temperature || c.saturation !== color.saturation)
  );
}

export function findVisualMidpoint(c1, c2) {
  const targetR = Math.round((c1.r + c2.r) / 2);
  const targetG = Math.round((c1.g + c2.g) / 2);
  const targetB = Math.round((c1.b + c2.b) / 2);
  const targetLum = (c1.luminance + c2.luminance) / 2;

  let closest = VGA_PALETTE[0];
  let closestDist = Infinity;

  for (const c of VGA_PALETTE) {
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

export function applyTransformation(mother, transformType, rng) {
  let candidates = [];

  switch (transformType) {
    case "value": {
      const lumDiff = mother.luminance > 50 ? -40 : 40;
      const targetLum = Math.max(5, Math.min(95, mother.luminance + lumDiff));

      candidates = VGA_PALETTE.filter(
        (c) =>
          c.hex !== mother.hex &&
          Math.abs(c.luminance - targetLum) < 20 &&
          (c.temperature === mother.temperature ||
            c.temperature === "neutral" ||
            mother.temperature === "neutral")
      );

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

      candidates.sort(
        (a, b) =>
          Math.abs(a.luminance - mother.luminance) -
          Math.abs(b.luminance - mother.luminance)
      );
      break;
    }

    case "saturation": {
      const satOrder = ["gray", "muted", "chromatic", "vivid"];
      const motherIdx = satOrder.indexOf(mother.saturation);
      const targetSats =
        motherIdx <= 1 ? ["chromatic", "vivid"] : ["muted", "gray"];

      candidates = VGA_PALETTE.filter(
        (c) =>
          c.hex !== mother.hex &&
          targetSats.includes(c.saturation) &&
          Math.abs(c.luminance - mother.luminance) < 30 &&
          (c.temperature === mother.temperature || c.temperature === "neutral")
      );

      candidates.sort((a, b) => {
        const aIdx = satOrder.indexOf(a.saturation);
        const bIdx = satOrder.indexOf(b.saturation);
        return Math.abs(bIdx - motherIdx) - Math.abs(aIdx - motherIdx);
      });
      break;
    }

    case "complement": {
      candidates = getComplementaryRegion(mother);

      candidates.sort(
        (a, b) =>
          Math.abs(b.luminance - mother.luminance) -
          Math.abs(a.luminance - mother.luminance)
      );
      break;
    }

    case "neighbor": {
      if (mother.cubePos) {
        candidates = getCubeNeighbors(mother, 1);
        if (candidates.length < 3) {
          candidates = getCubeNeighbors(mother, 2);
        }
      } else {
        candidates = VGA_PALETTE.filter(
          (c) =>
            c.hex !== mother.hex &&
            colorDistance(mother, c) < 60 &&
            colorDistance(mother, c) > 20
        );
      }

      candidates.sort(
        (a, b) => colorDistance(mother, a) - colorDistance(mother, b)
      );
      break;
    }
  }

  return candidates;
}

export function generatePalette(seed) {
  const rng = seededRandom(seed);

  // GLITCH MODE - ~3% chance
  const glitchRoll = rng();
  if (glitchRoll < 0.03) {
    const glitchType = Math.floor(rng() * 5);

    switch (glitchType) {
      case 0: {
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

  // SELECT MOTHER COLOR
  const chromaticPool = VGA_PALETTE.filter(
    (c) => c.saturation !== "gray" && c.type === "websafe"
  );
  const motherColor = pickRandom(rng, chromaticPool);

  // CHOOSE GROUND
  const groundRoll = rng();
  let ground;
  if (groundRoll < 0.4) ground = "light";
  else if (groundRoll < 0.8) ground = "dark";
  else ground = "mid";

  // CHOOSE PRIMARY TRANSFORMATION
  const transformRoll = rng();
  let primaryTransform;
  if (transformRoll < 0.3) primaryTransform = "value";
  else if (transformRoll < 0.5) primaryTransform = "temperature";
  else if (transformRoll < 0.65) primaryTransform = "saturation";
  else if (transformRoll < 0.8) primaryTransform = "complement";
  else primaryTransform = "neighbor";

  // DERIVE BACKGROUND
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
    bgCandidates = VGA_PALETTE.filter(
      (c) =>
        c.luminance >= 35 &&
        c.luminance <= 65 &&
        (c.saturation === "muted" || c.saturation === "gray") &&
        (c.temperature === motherColor.temperature ||
          c.temperature === "neutral")
    );
  }

  if (bgCandidates.length === 0) {
    bgCandidates =
      ground === "light"
        ? PALETTE_BY_LUMINANCE.light
        : PALETTE_BY_LUMINANCE.dark;
  }

  const bgColor = pickRandom(rng, bgCandidates);

  // DERIVE TEXT COLOR
  let textCandidates = applyTransformation(motherColor, primaryTransform, rng);
  textCandidates = textCandidates.filter((c) =>
    hasGoodContrast(bgColor, c, 4.5)
  );

  if (textCandidates.length === 0) {
    textCandidates = applyTransformation(motherColor, "value", rng).filter(
      (c) => hasGoodContrast(bgColor, c, 4.5)
    );
  }

  if (textCandidates.length === 0) {
    textCandidates = VGA_PALETTE.filter((c) =>
      hasGoodContrast(bgColor, c, 4.5)
    );
  }

  const textColor =
    textCandidates.length > 3
      ? textCandidates[Math.floor(rng() * Math.min(3, textCandidates.length))]
      : textCandidates[0] || motherColor;

  // ACCENT
  const useAccent = rng() < 0.2;
  let accentColor;

  if (useAccent) {
    const bgConfusable = findConfusableColors(bgColor, 15);
    const textConfusable = findConfusableColors(textColor, 15);

    let accentCandidates = [...bgConfusable, ...textConfusable].filter(
      (c) =>
        hasGoodContrast(bgColor, c, 3.0) &&
        c.hex !== textColor.hex &&
        c.saturation !== "gray"
    );

    const seen = new Set();
    accentCandidates = accentCandidates.filter((c) => {
      if (seen.has(c.hex)) return false;
      seen.add(c.hex);
      return true;
    });

    if (accentCandidates.length > 0) {
      const vividAccents = accentCandidates.filter(
        (c) => c.saturation === "vivid" || c.saturation === "chromatic"
      );
      accentColor = pickRandom(
        rng,
        vividAccents.length > 0 ? vividAccents : accentCandidates
      );
    } else {
      const midpoint = findVisualMidpoint(bgColor, textColor);
      if (hasGoodContrast(bgColor, midpoint, 2.5)) {
        accentColor = midpoint;
      } else {
        accentColor = textColor;
      }
    }
  } else {
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

export function getDivisors(n, min, max) {
  const divisors = [];
  for (let i = min; i <= max; i++) {
    if (n % i === 0) divisors.push(i);
  }
  return divisors;
}

export function snapToDivisor(value, n, min, max) {
  const divisors = getDivisors(n, min, max);
  if (divisors.length === 0) return value;

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

export function generateCellDimensions(width, height, padding, seed) {
  const innerW = REFERENCE_WIDTH - padding * 2;
  const innerH = REFERENCE_HEIGHT - padding * 2;

  const validWidths = getDivisors(innerW, CELL_MIN, CELL_MAX);
  const validHeights = getDivisors(innerH, CELL_MIN, CELL_MAX);

  if (validWidths.length === 0) validWidths.push(8);
  if (validHeights.length === 0) validHeights.push(12);

  const rng = seededRandom(seed + 9999);

  const validPairs = [];
  for (const w of validWidths) {
    for (const h of validHeights) {
      const ratio = Math.max(w / h, h / w);
      if (ratio <= CELL_ASPECT_MAX) {
        validPairs.push({ w, h });
      }
    }
  }

  if (validPairs.length === 0) {
    return { cellW: 8, cellH: 12 };
  }

  validPairs.sort((a, b) => a.w * a.h - b.w * b.h);

  const sizeBias = rng();
  let pair;

  if (sizeBias < 0.25) {
    const idx = Math.floor(rng() * Math.ceil(validPairs.length * 0.25));
    pair = validPairs[idx];
  } else if (sizeBias > 0.75) {
    const startIdx = Math.floor(validPairs.length * 0.75);
    const idx = startIdx + Math.floor(rng() * (validPairs.length - startIdx));
    pair = validPairs[idx];
  } else {
    pair = validPairs[Math.floor(rng() * validPairs.length)];
  }

  return { cellW: pair.w, cellH: pair.h };
}

export function generateRenderMode(seed) {
  const rng = seededRandom(seed + 5555);
  const roll = rng();

  if (roll < 0.35) return "normal";
  if (roll < 0.5) return "binary";
  if (roll < 0.65) return "inverted";
  if (roll < 0.8) return "sparse";
  return "dense";
}

export function generateWeightRange(seed) {
  const rng = seededRandom(seed + 7777);
  const style = rng();

  if (style < 0.25) {
    const base = 0.2 + rng() * 0.2;
    return { min: base, max: base + 0.1 + rng() * 0.2 };
  } else if (style < 0.5) {
    const base = 0.6 + rng() * 0.2;
    return { min: base, max: base + 0.1 + rng() * 0.1 };
  } else if (style < 0.75) {
    return { min: 0.1 + rng() * 0.2, max: 0.7 + rng() * 0.3 };
  } else {
    return { min: 0.3 + rng() * 0.2, max: 0.5 + rng() * 0.5 };
  }
}

export function generateMaxFolds(seed) {
  const rng = seededRandom(seed + 2222);
  return Math.floor(4 + rng() * 66);
}

export function generateFoldStrategy(seed) {
  const rng = seededRandom(seed + 6666);
  const roll = rng();

  if (roll < 0.16) {
    return { type: "horizontal", jitter: 3 + rng() * 12 };
  }
  if (roll < 0.32) {
    return { type: "vertical", jitter: 3 + rng() * 12 };
  }
  if (roll < 0.44) {
    const angle = rng() < 0.5 ? 45 : 135;
    return { type: "diagonal", angle: angle, jitter: 5 + rng() * 15 };
  }
  if (roll < 0.56) {
    return {
      type: "radial",
      focalX: 0.2 + rng() * 0.6,
      focalY: 0.2 + rng() * 0.6,
    };
  }
  if (roll < 0.68) {
    return { type: "grid", jitter: 3 + rng() * 10 };
  }
  if (roll < 0.8) {
    return {
      type: "clustered",
      clusterX: 0.15 + rng() * 0.7,
      clusterY: 0.15 + rng() * 0.7,
      spread: 0.2 + rng() * 0.4,
    };
  }
  return { type: "random" };
}

// ============ MULTI-COLOR PALETTE ============

export function findVGAColor(hex) {
  const upperHex = hex.toUpperCase();
  return VGA_PALETTE.find((c) => c.hex === upperHex) || VGA_PALETTE[0];
}

export function generateMultiColorPalette(seed, bgColor, textColor) {
  const rng = seededRandom(seed + 3333);

  const bgVGA = findVGAColor(bgColor);
  const textVGA = findVGAColor(textColor);
  const isLightBg = bgVGA.luminance > 50;

  const strategy = rng();

  if (strategy < 0.45) {
    if (bgVGA.cubePos && textVGA.cubePos) {
      const path = getCubeDiagonalPath(bgVGA, textVGA, 6);
      if (path.length >= 4) {
        return [
          path[0].hex,
          path[Math.floor(path.length * 0.33)].hex,
          path[Math.floor(path.length * 0.66)].hex,
          path[path.length - 1].hex,
        ];
      }
    }

    const path = interpolateByLuminance(bgVGA, textVGA, 6);
    return [
      path[0].hex,
      path[Math.floor(path.length * 0.33)].hex,
      path[Math.floor(path.length * 0.66)].hex,
      path[path.length - 1].hex,
    ];
  } else if (strategy < 0.75) {
    const neighbors1 = getCubeNeighbors(textVGA, 1);
    const neighbors2 = getCubeNeighbors(textVGA, 2);
    const neighbors3 = getCubeNeighbors(textVGA, 3);

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

    const colors = [textVGA.hex];

    if (level1Candidates.length > 0) {
      colors.push(pickRandom(rng, level1Candidates).hex);
    } else {
      colors.push(textVGA.hex);
    }

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

    const colorObjs = colors.map((hex) => findVGAColor(hex));
    colorObjs.sort((a, b) =>
      isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance
    );

    return colorObjs.map((c) => c.hex);
  } else {
    const textTemp = textVGA.temperature;
    const oppositeTemp =
      textTemp === "warm" ? "cool" : textTemp === "cool" ? "warm" : "warm";

    const sameTemp = PALETTE_BY_TEMPERATURE[textTemp].filter((c) =>
      hasGoodContrast(bgVGA, c, 2.5)
    );
    const oppTemp = PALETTE_BY_TEMPERATURE[oppositeTemp].filter((c) =>
      hasGoodContrast(bgVGA, c, 2.5)
    );

    const sortByLum = (a, b) =>
      isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance;
    sameTemp.sort(sortByLum);
    oppTemp.sort(sortByLum);

    const colors = [];

    colors.push(sameTemp.length > 0 ? sameTemp[0].hex : textVGA.hex);

    const mid1 = sameTemp.filter((c) => !colors.includes(c.hex));
    colors.push(
      mid1.length > 0 ? mid1[Math.floor(mid1.length * 0.3)].hex : textVGA.hex
    );

    const mid2 = oppTemp.filter((c) => !colors.includes(c.hex));
    colors.push(
      mid2.length > 0 ? mid2[Math.floor(mid2.length * 0.5)].hex : textVGA.hex
    );

    const final = [...sameTemp, ...oppTemp].filter(
      (c) => !colors.includes(c.hex)
    );
    final.sort(sortByLum);
    colors.push(final.length > 0 ? final[final.length - 1].hex : textVGA.hex);

    return colors;
  }
}

export function generateMultiColorEnabled(seed) {
  const rng = seededRandom(seed + 4444);
  return rng() < 0.25;
}

// ============ ADAPTIVE THRESHOLDS ============

export function calculateAdaptiveThresholds(cellWeights) {
  const weights = Object.values(cellWeights).filter((c) => c > 0);

  if (weights.length === 0) {
    return { t1: 1, t2: 2, t3: 3, tExtreme: 999 };
  }

  weights.sort((a, b) => a - b);

  const percentile = (arr, p) => {
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  const t1 = percentile(weights, 0.7);
  const t2 = percentile(weights, 0.94);
  const t3 = percentile(weights, 0.94) + 1;
  const tExtreme = percentile(weights, 0.985);

  return {
    t1: Math.max(0.01, t1),
    t2: Math.max(t1 + 0.01, t2),
    t3: Math.max(t2 + 0.01, t3),
    tExtreme: Math.max(t3 + 0.01, tExtreme),
  };
}

export function countToLevelAdaptive(weight, thresholds) {
  if (weight === 0) return 0;
  if (weight <= thresholds.t1) return 1;
  if (weight <= thresholds.t2) return 2;
  return 3;
}

// ============ SEEDED RANDOM ============

export function seededRandom(seed) {
  let state = Math.abs(seed) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function hashSeed(seed, str) {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ============ VECTOR MATH ============

export const V = {
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

// ============ GEOMETRY ============

export function segmentIntersect(a1, a2, b1, b2) {
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

export function clipToRect(point, dir, w, h) {
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

export function polygonUnionAlongCrease(poly1, poly2, creaseP1, creaseP2) {
  const onCrease = (p) => {
    const dx = creaseP2.x - creaseP1.x;
    const dy = creaseP2.y - creaseP1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.0001) return false;

    const cross = Math.abs((p.x - creaseP1.x) * dy - (p.y - creaseP1.y) * dx);
    return cross / Math.sqrt(len2) < 1;
  };

  const outer1 = poly1.filter((p) => !onCrease(p));
  const outer2 = poly2.filter((p) => !onCrease(p));

  if (outer1.length === 0) return poly2.slice();
  if (outer2.length === 0) return poly1.slice();

  const allPoints = [...poly1, ...poly2];
  return convexHull(allPoints);
}

export function convexHull(points) {
  if (points.length < 3) return points.slice();

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

  const sorted = points.slice().sort((a, b) => {
    const angleA = Math.atan2(a.y - startPoint.y, a.x - startPoint.x);
    const angleB = Math.atan2(b.y - startPoint.y, b.x - startPoint.x);
    if (Math.abs(angleA - angleB) < 0.0001) {
      const distA = (a.x - startPoint.x) ** 2 + (a.y - startPoint.y) ** 2;
      const distB = (b.x - startPoint.x) ** 2 + (b.y - startPoint.y) ** 2;
      return distA - distB;
    }
    return angleA - angleB;
  });

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

export function splitPolygon(polygon, lineP1, lineP2) {
  if (polygon.length < 3) return { left: [], right: [] };

  const left = [];
  const right = [];

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

export function reflectPoint(point, lineP1, lineP2) {
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return { x: point.x, y: point.y };

  const px = point.x - lineP1.x;
  const py = point.y - lineP1.y;

  const t = (px * dx + py * dy) / len2;
  const projX = lineP1.x + t * dx;
  const projY = lineP1.y + t * dy;

  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
  };
}

export function reflectPolygon(polygon, lineP1, lineP2) {
  return polygon.map((p) => reflectPoint(p, lineP1, lineP2));
}

export function polygonBounds(polygon) {
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

export function normalizePolygon(polygon, targetWidth, targetHeight, padding = 0) {
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

export function polygonAreaSigned(polygon) {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

export function polygonArea(polygon) {
  return Math.abs(polygonAreaSigned(polygon));
}

export function polygonIntersection(subject, clip) {
  if (subject.length < 3 || clip.length < 3) return [];

  let output = subject.slice();

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];

    const input = output;
    output = [];

    const edgeP1 = clip[i];
    const edgeP2 = clip[(i + 1) % clip.length];

    const edgeDx = edgeP2.x - edgeP1.x;
    const edgeDy = edgeP2.y - edgeP1.y;

    const isInside = (p) => {
      return edgeDx * (p.y - edgeP1.y) - edgeDy * (p.x - edgeP1.x) >= 0;
    };

    const intersect = (p1, p2) => {
      const d1x = p2.x - p1.x;
      const d1y = p2.y - p1.y;
      const d2x = edgeP2.x - edgeP1.x;
      const d2y = edgeP2.y - edgeP1.y;

      const cross = d1x * d2y - d1y * d2x;
      if (Math.abs(cross) < 0.0001) return p1;

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
          output.push({ x: next.x, y: next.y });
        } else {
          output.push(intersect(current, next));
        }
      } else {
        if (nextInside) {
          output.push(intersect(current, next));
          output.push({ x: next.x, y: next.y });
        }
      }
    }
  }

  return output;
}

export function ensureCCW(polygon) {
  if (polygon.length < 3) return polygon;
  if (polygonAreaSigned(polygon) < 0) {
    return polygon.slice().reverse();
  }
  return polygon;
}

export function clipLineToPolygon(lineP1, lineP2, polygon) {
  if (polygon.length < 3) return null;

  let tMin = 0;
  let tMax = 1;

  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;

  for (let i = 0; i < polygon.length; i++) {
    const edgeP1 = polygon[i];
    const edgeP2 = polygon[(i + 1) % polygon.length];

    const nx = edgeP2.y - edgeP1.y;
    const ny = edgeP1.x - edgeP2.x;

    const wx = lineP1.x - edgeP1.x;
    const wy = lineP1.y - edgeP1.y;

    const denom = nx * dx + ny * dy;
    const numer = -(nx * wx + ny * wy);

    if (Math.abs(denom) < 0.0001) {
      if (numer < 0) return null;
    } else {
      const t = numer / denom;
      if (denom < 0) {
        tMin = Math.max(tMin, t);
      } else {
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

export function polygonEdges(polygon) {
  const edges = [];
  for (let i = 0; i < polygon.length; i++) {
    edges.push({
      p1: polygon[i],
      p2: polygon[(i + 1) % polygon.length],
    });
  }
  return edges;
}

export function weightedRandomIndex(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ============ FOLD SIMULATION ============

export function simulateFolds(
  width,
  height,
  numFolds,
  seed,
  weightRange = { min: 0.0, max: 1.0 },
  strategyOverride = null
) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { creases: [], finalShape: [] };
  }

  const strategy = strategyOverride || generateFoldStrategy(seed);
  const maxFolds = generateMaxFolds(seed);

  let shape = ensureCCW([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]);

  const creases = [];
  let lastFoldTarget = null;

  if (!numFolds || numFolds <= 0) {
    return { creases: [], finalShape: shape, maxFolds, lastFoldTarget: null };
  }

  let currentSeed = seed;
  const weightRng = seededRandom(seed + 8888);

  const freqRng = seededRandom(seed + 3333);
  const freqX = 0.05 + freqRng() * 0.15;
  const freqY = 0.05 + freqRng() * 0.15;
  const phaseX = freqRng() * Math.PI * 2;
  const phaseY = freqRng() * Math.PI * 2;

  const reductionMultipliers = [];
  const reductionRng = seededRandom(seed + 1111);
  for (let i = 0; i < maxFolds; i++) {
    reductionMultipliers[i] = 0.001 + reductionRng() * 0.25;
  }

  for (let f = 0; f < numFolds; f++) {
    const cyclePosition = f % maxFolds;
    const currentCycle = Math.floor(f / maxFolds);

    if (cyclePosition === 0 && currentCycle > 0) {
      for (const crease of creases) {
        if (crease.reductionMultiplier !== undefined) {
          crease.weight = Math.max(
            0.01,
            crease.weight * crease.reductionMultiplier
          );
        }
      }
    }
    if (!shape || shape.length < 3) break;

    const rng = seededRandom(currentSeed);

    if (f > 0 && f % 5 === 0) {
      shape = normalizePolygon(shape, width, height, 0);
      shape = ensureCCW(shape);
    }

    const currentBounds = polygonBounds(shape);
    const currentW = currentBounds.maxX - currentBounds.minX;
    const currentH = currentBounds.maxY - currentBounds.minY;

    const fromIdx = Math.floor(rng() * shape.length);
    const fromVertex = shape[fromIdx];

    const targetOptions = [];

    for (let i = 0; i < shape.length; i++) {
      if (i === fromIdx) continue;
      targetOptions.push(shape[i]);
    }

    for (let i = 0; i < shape.length; i++) {
      const p1 = shape[i];
      const p2 = shape[(i + 1) % shape.length];
      const t = 0.2 + rng() * 0.6;
      targetOptions.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }

    let target = targetOptions[Math.floor(rng() * targetOptions.length)];

    if (f === 0) {
      target = {
        x: Math.max(0, Math.min(width * 0.95, target.x)),
        y: Math.max(0, Math.min(height * 0.95, target.y)),
      };
    }

    const dist = V.dist(fromVertex, target);
    const minDist = Math.min(currentW, currentH) * 0.05;
    if (dist < minDist) {
      currentSeed = hashSeed(currentSeed, "skip" + f);
      continue;
    }

    const mid = V.mid(fromVertex, target);
    const toTarget = V.norm(V.sub(target, fromVertex));
    const creaseDir = V.perp(toTarget);

    const extent = Math.max(currentW, currentH) * 3;
    const lineP1 = {
      x: mid.x - creaseDir.x * extent,
      y: mid.y - creaseDir.y * extent,
    };
    const lineP2 = {
      x: mid.x + creaseDir.x * extent,
      y: mid.y + creaseDir.y * extent,
    };

    const { left, right } = splitPolygon(shape, lineP1, lineP2);

    if (left.length < 3 || right.length < 3) {
      currentSeed = hashSeed(currentSeed, "badsplit" + f);
      continue;
    }

    const leftHasSource = left.some((p) => V.dist(p, fromVertex) < 1);

    const foldingSide = leftHasSource ? left : right;
    const stayingSide = leftHasSource ? right : left;

    const reflected = reflectPolygon(foldingSide, lineP1, lineP2);

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

    const amplitude = 0.3 + Math.min(f * 0.002, 0.2);
    const offsetX = Math.sin(f * freqX + phaseX) * width * amplitude;
    const offsetY = Math.sin(f * freqY + phaseY) * height * amplitude;

    const canvasCrease = clipToRect(
      { x: mid.x + offsetX, y: mid.y + offsetY },
      creaseDir,
      width,
      height
    );

    if (canvasCrease) {
      const newWeight =
        weightRange.min + weightRng() * (weightRange.max - weightRange.min);

      creases.push({
        p1: V.copy(canvasCrease.p1),
        p2: V.copy(canvasCrease.p2),
        depth: creases.length,
        weight: newWeight,
        cyclePosition: cyclePosition,
        reductionMultiplier: reductionMultipliers[cyclePosition],
      });

      lastFoldTarget = {
        x: Math.max(0, Math.min(width - 1, target.x)),
        y: Math.max(0, Math.min(height - 1, target.y)),
      };
    }

    shape = ensureCCW(newShape);
    currentSeed = hashSeed(currentSeed, "fold" + f);
  }

  shape = normalizePolygon(shape, width, height, 0);
  shape = ensureCCW(shape);

  return { creases, finalShape: shape, maxFolds, lastFoldTarget };
}

// ============ INTERSECTIONS ============

export function findIntersections(creases) {
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

export function processCreases(
  creases,
  gridCols,
  gridRows,
  cellWidth,
  cellHeight,
  maxFolds = null
) {
  const intersections = findIntersections(creases);

  const cellWeights = {};
  const cellMaxGap = {};
  const cellIntersectionCounts = {};

  for (const inter of intersections) {
    const col = Math.floor(inter.x / cellWidth);
    const row = Math.floor(inter.y / cellHeight);
    if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
      const key = `${col},${row}`;
      cellWeights[key] = (cellWeights[key] || 0) + inter.weight;
      cellMaxGap[key] = Math.max(cellMaxGap[key] || 0, inter.gap);
      cellIntersectionCounts[key] = (cellIntersectionCounts[key] || 0) + 1;
    }
  }

  return {
    activeCreases: creases,
    intersections,
    cellWeights,
    cellMaxGap,
    cellIntersectionCounts,
    destroyed: 0,
    maxFolds,
  };
}

// ============ CANVAS RENDERING ============

export function renderToCanvas({
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
  showCreases = false,
  showPaperShape = false,
}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = 2;

  canvas.width = outputWidth * dpr;
  canvas.height = outputHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  const scaleX = outputWidth / REFERENCE_WIDTH;
  const scaleY = outputHeight / REFERENCE_HEIGHT;

  const refDrawWidth = REFERENCE_WIDTH - DRAWING_MARGIN * 2;
  const refDrawHeight = REFERENCE_HEIGHT - DRAWING_MARGIN * 2;
  const refOffsetX = DRAWING_MARGIN;
  const refOffsetY = DRAWING_MARGIN;

  const cols = Math.max(1, Math.floor(refDrawWidth / cellWidth));
  const rows = Math.max(1, Math.floor(refDrawHeight / cellHeight));

  const refCellWidth = refDrawWidth / cols;
  const refCellHeight = refDrawHeight / rows;

  const drawWidth = refDrawWidth * scaleX;
  const drawHeight = refDrawHeight * scaleY;
  const offsetX = refOffsetX * scaleX;
  const offsetY = refOffsetY * scaleY;
  const actualCellWidth = refCellWidth * scaleX;
  const actualCellHeight = refCellHeight * scaleY;

  const weightRange = generateWeightRange(seed);

  const { creases, finalShape, maxFolds, lastFoldTarget } = simulateFolds(
    refDrawWidth,
    refDrawHeight,
    folds,
    seed,
    weightRange,
    foldStrategy
  );

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

  const accentCells = new Set();
  if (Object.keys(cellMaxGap).length > 0) {
    const maxGap = Math.max(...Object.values(cellMaxGap));
    for (const [key, gap] of Object.entries(cellMaxGap)) {
      if (gap === maxGap) {
        accentCells.add(key);
      }
    }
  }

  ctx.font = `${
    actualCellHeight - 2 * scaleY
  }px "Courier New", Courier, monospace`;
  ctx.textBaseline = "top";

  const shadeChars = [" ", "░", "▒", "▓"];

  const thresholds = calculateAdaptiveThresholds(intersectionWeight);

  const getColorForLevel = (level, cellKey) => {
    if (multiColor && levelColors) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(offsetX + col * actualCellWidth);
      const y = Math.round(offsetY + row * actualCellHeight);
      const key = `${col},${row}`;
      const weight = intersectionWeight[key] || 0;

      let char = null;
      let color = textColor;
      let level = -1;

      if (lastFoldTargetCell === key) {
        char = shadeChars[3];
        level = 3;
        color = accentColor || textColor;
      } else if (accentCells.has(key) && weight > 0) {
        char = shadeChars[2];
        level = 2;
        color = accentColor;
      } else if (weight >= 1.5) {
        const extremeAmount = weight - 1.5;
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
        const finalColor = getColorForLevel(
          countToLevelAdaptive(weight, thresholds),
          key
        );
        ctx.fillStyle =
          lastFoldTargetCell === key
            ? accentColor || textColor
            : accentCells.has(key) && weight > 0
            ? accentColor
            : finalColor;

        const measuredCharWidth = ctx.measureText(char).width;
        const cellEndX = Math.round(offsetX + (col + 1) * actualCellWidth);

        let currentX = x;
        let charIndex = 0;
        const overlapFactor = 0.95;

        while (currentX < cellEndX && level >= 0) {
          let nextChar = char;
          if (level >= 2 && charIndex > 0 && charIndex % 2 === 0) {
            nextChar = shadeChars[Math.max(0, level - 1)];
          }

          const nextCharWidth = ctx.measureText(nextChar).width;
          const remainingWidth = cellEndX - currentX;

          if (remainingWidth <= 0) break;

          if (remainingWidth < nextCharWidth * 1.1) {
            ctx.fillText(nextChar, cellEndX - nextCharWidth, y);
            break;
          } else {
            ctx.fillText(nextChar, currentX, y);
            currentX += nextCharWidth * overlapFactor;
          }

          charIndex++;
        }
      }
    }
  }

  if (showCreases) {
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    for (const crease of activeCreases) {
      ctx.beginPath();
      ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
      ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (showPaperShape) {
    const scaledFinalShape = finalShape.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }));

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

      ctx.fillStyle = "#00ffff";
      ctx.globalAlpha = 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  return canvas.toDataURL("image/png");
}

// ============ PARAMETER GENERATION ============

export function generateAllParams(
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

  let foldCount = folds;
  if (foldCount === null) {
    const foldRng = seededRandom(seed + 9999);
    foldCount = Math.floor(1 + foldRng() * 500);
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

// ============ METADATA GENERATION ============

export function generateMetadata(tokenId, seed, foldCount, imageBaseUrl = "") {
  const params = generateAllParams(seed, 1200, 1500, 0, foldCount);

  // Calculate crease count by running simulation
  const weightRange = generateWeightRange(seed);
  const refDrawWidth = REFERENCE_WIDTH - DRAWING_MARGIN * 2;
  const refDrawHeight = REFERENCE_HEIGHT - DRAWING_MARGIN * 2;
  const { creases } = simulateFolds(
    refDrawWidth,
    refDrawHeight,
    foldCount,
    seed,
    weightRange,
    params.foldStrategy
  );

  return {
    name: `Fold #${tokenId}`,
    description: "On-chain generative paper folding art",
    image: imageBaseUrl ? `${imageBaseUrl}/${tokenId}` : "",
    attributes: [
      { trait_type: "Fold Strategy", value: params.foldStrategy.type },
      { trait_type: "Render Mode", value: params.renderMode },
      { trait_type: "Multi-Color", value: params.multiColor ? "Yes" : "No" },
      { trait_type: "Cell Size", value: `${params.cells.cellW}x${params.cells.cellH}` },
      { trait_type: "Fold Count", value: foldCount },
      { trait_type: "Max Folds", value: params.maxFolds },
      { trait_type: "Crease Count", value: creases.length },
      { trait_type: "Palette Strategy", value: params.palette.strategy },
    ],
  };
}

// ============ ON-CHAIN ENTRY POINT ============

// Auto-render if global variables are set (for on-chain use)
export function initOnChain() {
  const seed = typeof window !== 'undefined' && window.SEED;
  const foldCount = typeof window !== 'undefined' && window.FOLD_COUNT;

  if (seed && foldCount !== undefined) {
    const canvas = document.getElementById('c') || document.querySelector('canvas');
    if (canvas) {
      const params = generateAllParams(seed, 1200, 1500, 0, foldCount);

      // Render directly to existing canvas
      const dataUrl = renderToCanvas({
        folds: foldCount,
        seed: seed,
        outputWidth: 1200,
        outputHeight: 1500,
        bgColor: params.palette.bg,
        textColor: params.palette.text,
        accentColor: params.palette.accent,
        cellWidth: params.cells.cellW,
        cellHeight: params.cells.cellH,
        renderMode: params.renderMode,
        multiColor: params.multiColor,
        levelColors: params.levelColors,
        foldStrategy: params.foldStrategy,
      });

      // Load into canvas
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        canvas.width = 1200;
        canvas.height = 1500;
        ctx.drawImage(img, 0, 0);
      };
      img.src = dataUrl;
    }
  }
}

// Auto-init when DOM is ready (for on-chain use)
if (typeof window !== 'undefined' && (window.SEED || window.FOLD_COUNT !== undefined)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnChain);
  } else {
    initOnChain();
  }
}
