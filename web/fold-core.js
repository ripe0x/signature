// ============ FOLD CORE ============
// Pure rendering logic for on-chain generative art
// This module has no React dependencies and can be used standalone

// ============ GLOBAL CONSTANTS ============
const FORCE_GRADIENT_MODE = false; // Toggle: force all outputs to use gradient mode
export const CELL_MIN = 20;
export const CELL_MAX = 600;
export const CELL_ASPECT_MAX = 3;
export const DRAWING_MARGIN = 145; // ~12.1% of width (1 inch margin for A4)
export const REFERENCE_WIDTH = 1200;
export const REFERENCE_HEIGHT = 1697; // A4 aspect ratio (1:√2)

// On-chain font configuration
// Courier New subset (904 bytes) - contains only: space, ░, ▒, ▓
export const ONCHAIN_FONT_NAME = "FoldMono";
export const ONCHAIN_FONT_DATA_URI =
  "data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAAOIAA4AAAAADAQAAAM2AAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhYbEBwmBmAAPBEQCo9sjiABNgIkAwwLDAAEIAWCfAcgGzkKIK4GbGOy2GicLj5u8RpRKYyZuIy26Oe9GkG0llXPQhAUoVLRQOiIjYYnUuLluRfqlUh8nv35d3DbeacPRpI7wLzuWl2XGTr+R4rdqk48ecPEg8A0wvynUz9VJ0gGYLd1C/5xl7xv3SZnBWzBGr8QtP8P9KU3gF/4v///XtV/LeBjv+MBmzYJYqG96Ce0h6/5XmbHBNnLAlygYMFqXKAK1bYRcgkLxgZhXaf627YE6gFJIBcCteo1AuwbDBChbA4tEHHa8CDi2utCBABSXokNorp4phkhurc/Cdkmqp0bWqrKalIqUp4jaAbAzD4U5MOrPfX1JpR/yDVAQLZF3YE+VCRkaEcRaEc1Bkq5kJLE/gHUNnm3+zdMKK9aMhR+h189BajFT9I/lJ0BIAcwLMQ2l3Yj73wvYnyWbjmo3XbjJ0eY8W5h/BrjMzLJ2VlnUo3PYuKqtuQN3OLm3X+/upK1DTdwjZsDyUyqec6GEF09syI3F92yUZdMJ62DE7XK6uCueMYse9occDNSOJk2TzuvAA1ohsS27Vw8Tqt1nSmHabjbFnGndFO5K3PzpJ4CUz1JBorMmHHLdmQwBHRTnMkKhQ2QvVOwlGW8DcP5FqbrJJvdjsuaDB97D7UPuQfMWVxWiURGZPMptIkVhKEJKCNQDIyTFKlyZLbV+p53gX4egWr7bX73rYYTy+fRt6NAzImHc31/acg9fC0EFH1/obMyd7VtOx4JfU3acYK4OL1wfhzUFbtqf+2dJ+YG3K/voIAkorej7to5G4ZgZG5J17dlDgasZyO9xT2bOM2geuh5N335H/05CBAo+D8a3teHrs9kVYNvlTICfznXj/qG+mEqQY0AQfnnlyCvvGfUD0jWq5FXOCj0rhgQshT513IJVZZQRF6DIzii0KmJkkZPKLNkNZ7LUKHHe3ulrkb3x2Kgo2PDk1VXwRPT09UzttAnIRgd6m8KBWMNkbgGj19b25mmG2vqxkaEs7LdVDE0VVGmSeKcTHfjguaJm3smpWsmdnzBsDSJIzDqMKW8o1bEecw0dHS0TGzyS4Z6n9NTNSaXDzlPw2BeyPLakJQRk0Wx9HurZUEAAA==";
// Fallback for local development when font isn't loaded
export const FALLBACK_FONT = '"Courier New", Courier, monospace';
// Use on-chain font if available, otherwise fallback
export const FONT_STACK = `"${ONCHAIN_FONT_NAME}", ${FALLBACK_FONT}`;

// Character glyph metrics (measured at 100px, expressed as ratios of fontSize)
// The CSS box is 60x100 at 100px font, but glyphs extend beyond
export const CHAR_WIDTH_RATIO = 0.6; // CSS box width / fontSize
export const CHAR_TOP_OVERFLOW = 0.08; // All chars extend 8% above CSS box
export const CHAR_BOTTOM_OVERFLOW_DARK = 0.06; // ▓ extends 6% below
export const CHAR_BOTTOM_OVERFLOW_OTHER = 0.03; // ░▒ extend 3% below
export const CHAR_LIGHT_LEFT_OFFSET = 0.05; // ░ is offset 5% to the left

// ============ CGA 13-COLOR PALETTE SYSTEM ============
// Pure CGA with Albers-inspired contrast logic.
// No brown (muddy), no grays (uncommitted mid-values).

export function getLuminance(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  return (0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm) * 100;
}

// The 13 CGA colors - brown and grays removed
export const CGA_PALETTE = [
  // Darks (valid grounds) - luminance < 30
  {
    hex: "#000000",
    name: "black",
    luminance: 0,
    temperature: "neutral",
    r: 0,
    g: 0,
    b: 0,
  },
  {
    hex: "#0000AA",
    name: "blue",
    luminance: 10,
    temperature: "cool",
    r: 0,
    g: 0,
    b: 170,
  },
  {
    hex: "#AA0000",
    name: "red",
    luminance: 20,
    temperature: "warm",
    r: 170,
    g: 0,
    b: 0,
  },
  {
    hex: "#AA00AA",
    name: "magenta",
    luminance: 25,
    temperature: "warm",
    r: 170,
    g: 0,
    b: 170,
  },

  // Lights (valid grounds) - luminance > 70
  {
    hex: "#FFFFFF",
    name: "white",
    luminance: 100,
    temperature: "neutral",
    r: 255,
    g: 255,
    b: 255,
  },
  {
    hex: "#FFFF55",
    name: "yellow",
    luminance: 93,
    temperature: "warm",
    r: 255,
    g: 255,
    b: 85,
  },
  {
    hex: "#55FFFF",
    name: "lightCyan",
    luminance: 85,
    temperature: "cool",
    r: 85,
    g: 255,
    b: 255,
  },
  {
    hex: "#55FF55",
    name: "lightGreen",
    luminance: 77,
    temperature: "cool",
    r: 85,
    g: 255,
    b: 85,
  },

  // Mids (marks only, never grounds) - luminance 30-70
  {
    hex: "#00AA00",
    name: "green",
    luminance: 30,
    temperature: "cool",
    r: 0,
    g: 170,
    b: 0,
  },
  {
    hex: "#00AAAA",
    name: "cyan",
    luminance: 40,
    temperature: "cool",
    r: 0,
    g: 170,
    b: 170,
  },
  {
    hex: "#5555FF",
    name: "lightBlue",
    luminance: 45,
    temperature: "cool",
    r: 85,
    g: 85,
    b: 255,
  },
  {
    hex: "#FF5555",
    name: "lightRed",
    luminance: 45,
    temperature: "warm",
    r: 255,
    g: 85,
    b: 85,
  },
  {
    hex: "#FF55FF",
    name: "lightMagenta",
    luminance: 60,
    temperature: "warm",
    r: 255,
    g: 85,
    b: 255,
  },
];

// Role pools
// Grounds must be value-committed (dark or light, never mid)
export const GROUND_POOL = CGA_PALETTE.filter(
  (c) => c.luminance < 30 || c.luminance > 70
);
// black, blue, red, magenta, white, yellow, lightCyan, lightGreen

// Ground weights - prevent any single color from dominating
// Black and white anchor more often. Magenta is spice, not staple.
const GROUND_WEIGHTS = {
  black: 0.2, // strongest ground, increase
  white: 0.15, // rare but powerful, increase
  blue: 0.15, // classic CGA
  red: 0.15, // classic CGA
  magenta: 0.1, // decrease - was overrepresented
  yellow: 0.1, // complement anchor
  lightCyan: 0.08, // light grounds are rarer
  lightGreen: 0.07, // light grounds are rarer
};

// Marks can be anything with sufficient contrast to ground
export const MARK_POOL = CGA_PALETTE;

// Accents must be chromatic (not black or white)
export const ACCENT_POOL = CGA_PALETTE.filter(
  (c) => c.temperature !== "neutral"
);

// Chromatic colors for monochrome "key" selection
// These are the 11 non-neutral colors that can be the single voice
const CHROMATIC_POOL = CGA_PALETTE.filter((c) => c.temperature !== "neutral");

// Legacy exports for compatibility (point to CGA_PALETTE)
export const VGA_PALETTE = CGA_PALETTE;
export const PALETTE_BY_LUMINANCE = {
  dark: CGA_PALETTE.filter((c) => c.luminance < 30),
  light: CGA_PALETTE.filter((c) => c.luminance > 70),
};
export const PALETTE_BY_TEMPERATURE = {
  warm: CGA_PALETTE.filter((c) => c.temperature === "warm"),
  cool: CGA_PALETTE.filter((c) => c.temperature === "cool"),
  neutral: CGA_PALETTE.filter((c) => c.temperature === "neutral"),
};

// ============ COLOR UTILITIES ============

export function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

// Interpolate colors by luminance (simplified for CGA)
export function interpolateByLuminance(startColor, endColor, steps) {
  const startLum = startColor.luminance;
  const endLum = endColor.luminance;

  const path = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const targetLum = startLum + (endLum - startLum) * t;

    const candidates = CGA_PALETTE.filter(
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

// Weighted random selection from pool using weights object
function pickWeighted(rng, pool, weights) {
  const roll = rng();
  let cumulative = 0;
  for (const color of pool) {
    cumulative += weights[color.name] || 0;
    if (roll < cumulative) {
      return color;
    }
  }
  // Fallback to last item (shouldn't happen if weights sum to 1)
  return pool[pool.length - 1];
}

// ============ HSL UTILITIES ============

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

// ============ CGA ALBERS COLOR SYSTEM ============
// Ground first. Contrast type second. Derive, don't pick.
// Only 13 CGA colors. Every palette has an argument.

// Complement pairs lookup
const COMPLEMENT_PAIRS = {
  red: ["cyan", "lightCyan"],
  magenta: ["green", "lightGreen"],
  blue: ["yellow"],
  lightRed: ["cyan", "lightCyan"],
  lightMagenta: ["green", "lightGreen"],
  lightBlue: ["yellow"],
  cyan: ["red", "lightRed"],
  lightCyan: ["red", "lightRed"],
  green: ["magenta", "lightMagenta"],
  lightGreen: ["magenta", "lightMagenta"],
  yellow: ["blue", "lightBlue"],
  black: ["white", "yellow", "lightCyan"],
  white: ["black", "blue", "magenta"],
};

// Derive mark based on contrast type
function deriveMark(ground, contrastType, rng) {
  const MIN_LUM_DIFF = 25;
  let candidates = [];

  switch (contrastType) {
    case "value": {
      // Dark ground → light mark, or vice versa
      const needsLight = ground.luminance < 50;
      candidates = MARK_POOL.filter((c) =>
        needsLight ? c.luminance > 60 : c.luminance < 40
      );
      break;
    }

    case "temperature": {
      // Warm ground → cool mark, or vice versa
      if (ground.temperature === "neutral") {
        // Neutral ground: pick any chromatic with contrast
        candidates = MARK_POOL.filter(
          (c) =>
            c.temperature !== "neutral" &&
            Math.abs(c.luminance - ground.luminance) > MIN_LUM_DIFF
        );
      } else {
        const targetTemp = ground.temperature === "warm" ? "cool" : "warm";
        candidates = MARK_POOL.filter(
          (c) =>
            c.temperature === targetTemp &&
            Math.abs(c.luminance - ground.luminance) > MIN_LUM_DIFF
        );
      }
      break;
    }

    case "complement": {
      // Opposite hue: red↔cyan, blue↔yellow, magenta↔green
      const complements = COMPLEMENT_PAIRS[ground.name] || [];
      candidates = MARK_POOL.filter((c) => complements.includes(c.name));
      // If no complements found, fall back to value contrast
      if (candidates.length === 0) {
        const needsLight = ground.luminance < 50;
        candidates = MARK_POOL.filter((c) =>
          needsLight ? c.luminance > 60 : c.luminance < 40
        );
      }
      break;
    }

    case "clash": {
      // Intentional discord - readable but wrong
      candidates = MARK_POOL.filter(
        (c) =>
          c.name !== ground.name &&
          Math.abs(c.luminance - ground.luminance) > 20 &&
          Math.abs(c.luminance - ground.luminance) < 50
      );
      break;
    }
  }

  // Sort by contrast strength
  candidates.sort(
    (a, b) =>
      Math.abs(b.luminance - ground.luminance) -
      Math.abs(a.luminance - ground.luminance)
  );

  if (candidates.length > 0) {
    return pickRandom(rng, candidates);
  }

  // Fallback: black/white based on ground
  return ground.luminance < 50
    ? CGA_PALETTE.find((c) => c.name === "white")
    : CGA_PALETTE.find((c) => c.name === "black");
}

// Derive accent - optional third color
function deriveAccent(ground, mark, rng) {
  // 40% of pieces: no distinct accent (2-color palette)
  if (rng() < 0.4) return mark;

  // Accent must differ from both ground and mark
  const candidates = ACCENT_POOL.filter(
    (c) =>
      c.name !== ground.name &&
      c.name !== mark.name &&
      Math.abs(c.luminance - ground.luminance) > 20
  );

  if (candidates.length === 0) return mark;

  // Prefer high-energy accents: yellow, lightCyan, lightMagenta, lightGreen
  const hotAccents = candidates.filter((c) =>
    ["yellow", "lightCyan", "lightMagenta", "lightGreen"].includes(c.name)
  );

  if (hotAccents.length > 0 && rng() < 0.6) {
    return pickRandom(rng, hotAccents);
  }

  return pickRandom(rng, candidates);
}

// True monochrome: one chromatic voice on neutral ground
// The "key" color defines the piece. Shade characters create value through density.
function generateMonochrome(rng) {
  // Pick the key color - the single chromatic voice
  const keyColor = pickRandom(rng, CHROMATIC_POOL);

  // Ground: black or white based on key luminance
  // Light keys (yellow, lightCyan, etc) → black ground for contrast
  // Dark keys (blue, red) → prefer black, sometimes white
  // Mid keys → either works
  let groundColor;
  if (keyColor.luminance > 50) {
    // Light color → always black ground
    groundColor = CGA_PALETTE.find((c) => c.name === "black");
  } else if (keyColor.luminance < 30) {
    // Dark color → mostly black (classic terminal), sometimes white (blueprint)
    groundColor =
      rng() < 0.75
        ? CGA_PALETTE.find((c) => c.name === "black")
        : CGA_PALETTE.find((c) => c.name === "white");
  } else {
    // Mid color → either works
    groundColor =
      rng() < 0.6
        ? CGA_PALETTE.find((c) => c.name === "black")
        : CGA_PALETTE.find((c) => c.name === "white");
  }

  return {
    bg: groundColor.hex,
    text: keyColor.hex,
    accent: keyColor.hex, // Same as text - true 2-color
    strategy: `monochrome/${keyColor.name}`,
    colorCount: 2,
  };
}

export function generatePalette(seed) {
  const rng = seededRandom(seed);

  // ============ MONOCHROME CHECK ============
  // 12% chance of true monochrome - one chromatic voice on neutral ground
  // This is its own complete pathway, not a contrast type
  if (rng() < 0.12) {
    return generateMonochrome(rng);
  }

  // ============ STEP 1: GROUND ============
  // Ground is the dominant field. Dark or light. Never mid.
  // Weighted selection prevents any single color from dominating.
  // Black and white anchor more often. Magenta is spice, not staple.

  const ground = pickWeighted(rng, GROUND_POOL, GROUND_WEIGHTS);

  // ============ STEP 2: CONTRAST TYPE ============
  // Pick ONE contrast relationship. Commit to it.
  // Weights: value 40%, temperature 28%, complement 22%, clash 10%

  const contrastRoll = rng();
  let contrastType;
  if (contrastRoll < 0.4) {
    contrastType = "value";
  } else if (contrastRoll < 0.68) {
    contrastType = "temperature";
  } else if (contrastRoll < 0.9) {
    contrastType = "complement";
  } else {
    contrastType = "clash"; // 10% - intentional discord
  }

  // ============ STEP 3: DERIVE MARK ============
  // Mark is the ANSWER to the ground + contrast type

  const mark = deriveMark(ground, contrastType, rng);

  // ============ STEP 4: DERIVE ACCENT ============
  // 40% get no accent (2-color), 60% get distinct third color

  const accent = deriveAccent(ground, mark, rng);

  // ============ STEP 5: VALIDATE ============
  // Safety check - should always pass with this system

  // Compute RNG-based colorCount (for metadata consistency)
  const rngColorCount = accent.hex === mark.hex ? 2 : 3;

  if (Math.abs(ground.luminance - mark.luminance) < 25) {
    // Contrast failure - force black/white fallback colors
    // Keep original contrastType and RNG-based colorCount for metadata consistency
    return {
      bg: ground.luminance < 50 ? "#000000" : "#FFFFFF",
      text: ground.luminance < 50 ? "#FFFFFF" : "#000000",
      accent: "#FFFF55",
      strategy: contrastType,
      colorCount: rngColorCount,
    };
  }

  return {
    bg: ground.hex,
    text: mark.hex,
    accent: accent.hex,
    strategy: contrastType,
    colorCount: rngColorCount,
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

export function generateCellDimensions(width, height, padding, seed) {
  // Resolution-independent layout:
  // Work entirely in reference coordinates so a given seed produces the same
  // grid at any output resolution (with the same aspect ratio). We define the
  // inner drawing area exactly the same way that `renderToCanvas` does: by
  // subtracting both padding and DRAWING_MARGIN from each side of the
  // REFERENCE canvas.
  const innerW = REFERENCE_WIDTH - padding * 2 - DRAWING_MARGIN * 2;
  const innerH = REFERENCE_HEIGHT - padding * 2 - DRAWING_MARGIN * 2;

  const validWidths = getDivisors(innerW, CELL_MIN, CELL_MAX);
  const validHeights = getDivisors(innerH, CELL_MIN, CELL_MAX);

  if (validWidths.length === 0) validWidths.push(8);
  if (validHeights.length === 0) validHeights.push(12);

  const rng = seededRandom(seed + 9999);

  // Grid cell requirements:
  // 1. Aspect ratio <= CELL_ASPECT_MAX (currently 3)
  // 2. Cell width must fit at least one character
  //    - fontSize = cellHeight / glyphHeightRatio (1.14)
  //    - charWidth = fontSize * CHAR_WIDTH_RATIO (0.6)
  //    - So: cellWidth >= cellHeight * 0.6 / 1.14 ≈ cellHeight * 0.526
  const glyphHeightRatio = 1 + CHAR_TOP_OVERFLOW + CHAR_BOTTOM_OVERFLOW_DARK;
  const minWidthRatio = CHAR_WIDTH_RATIO / glyphHeightRatio; // ~0.526

  const validPairs = [];
  for (const w of validWidths) {
    for (const h of validHeights) {
      const ratio = Math.max(w / h, h / w);
      const minWidthForChar = h * minWidthRatio;
      if (ratio <= CELL_ASPECT_MAX && w >= minWidthForChar) {
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

  // Size distribution with rare extremes:
  // 3% very small (bottom 10%), 7% small (10-25%), 35% medium (25-75%), 50% large (75-90%), 5% very large (top 10%)
  if (sizeBias < 0.03) {
    // Very small cells - very rare
    const endIdx = Math.max(1, Math.ceil(validPairs.length * 0.1));
    const idx = Math.floor(rng() * endIdx);
    pair = validPairs[idx];
  } else if (sizeBias < 0.1) {
    // Small cells - rare
    const startIdx = Math.floor(validPairs.length * 0.1);
    const endIdx = Math.floor(validPairs.length * 0.25);
    const idx = startIdx + Math.floor(rng() * Math.max(1, endIdx - startIdx));
    pair = validPairs[Math.min(idx, validPairs.length - 1)];
  } else if (sizeBias < 0.45) {
    // Medium cells - common
    const startIdx = Math.floor(validPairs.length * 0.25);
    const endIdx = Math.floor(validPairs.length * 0.75);
    const idx = startIdx + Math.floor(rng() * (endIdx - startIdx));
    pair = validPairs[Math.min(idx, validPairs.length - 1)];
  } else if (sizeBias < 0.95) {
    // Large cells - most common
    const startIdx = Math.floor(validPairs.length * 0.75);
    const endIdx = Math.floor(validPairs.length * 0.9);
    const idx = startIdx + Math.floor(rng() * Math.max(1, endIdx - startIdx));
    pair = validPairs[Math.min(idx, validPairs.length - 1)];
  } else {
    // Very large cells - rare
    const startIdx = Math.floor(validPairs.length * 0.9);
    const idx = startIdx + Math.floor(rng() * (validPairs.length - startIdx));
    pair = validPairs[Math.min(idx, validPairs.length - 1)];
  }

  return { cellW: pair.w, cellH: pair.h };
}

export function generateRenderMode(seed) {
  const rng = seededRandom(seed + 5555);
  const roll = rng();

  // normal 40%, inverted 30%, binary 10%, sparse 10%, dense 10%
  if (roll < 0.4) return "normal";
  if (roll < 0.7) return "inverted";
  if (roll < 0.8) return "binary";
  if (roll < 0.9) return "sparse";
  return "dense";
}

// Whether to show 10% opacity fill in empty cells (for binary/sparse/dense modes)
// 30% chance to show empty cells in these modes
export function generateShowEmptyCells(seed) {
  const rng = seededRandom(seed + 5556);
  return rng() < 0.3;
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

export function generateOverlapInfo(seed) {
  const overlapRng = seededRandom(seed + 11111);
  const hasOverlap = overlapRng() >= 0.5;

  if (!hasOverlap) {
    return { hasOverlap: false, amount: "none" };
  }

  const roll = overlapRng();
  let amount;
  if (roll < 0.2) amount = "5%";
  else if (roll < 0.4) amount = "25%";
  else if (roll < 0.6) amount = "50%";
  else if (roll < 0.8) amount = "75%";
  else amount = "95%";

  return { hasOverlap: true, amount };
}

// Generate gap ratio info for a given seed and cell dimensions
export function generateGapInfo(
  seed,
  cellWidth,
  cellHeight,
  innerWidth,
  innerHeight
) {
  // Run the gap calculation to get actual values
  const grid = calculateGridWithGaps(
    seed,
    cellWidth,
    cellHeight,
    innerWidth,
    innerHeight
  );

  const colGapRatio = grid.colGap / grid.cellWidth;
  const rowGapRatio = grid.rowGap / grid.cellHeight;

  // Map ratio to readable label (matches ALLOWED_GAP_RATIOS)
  const ratioToLabel = (ratio) => {
    if (Math.abs(ratio) < 0.01) return "none";
    if (Math.abs(ratio + 1) < 0.01) return "-1 (100% overlap)";
    if (Math.abs(ratio + 0.5) < 0.01) return "-1/2 (50% overlap)";
    if (Math.abs(ratio + 0.25) < 0.01) return "-1/4 (25% overlap)";
    if (Math.abs(ratio + 0.125) < 0.01) return "-1/8 (12.5% overlap)";
    if (Math.abs(ratio + 0.0625) < 0.01) return "-1/16 (6.25% overlap)";
    if (Math.abs(ratio - 0.015625) < 0.01) return "1/64";
    if (Math.abs(ratio - 0.03125) < 0.01) return "1/32";
    if (Math.abs(ratio - 0.0625) < 0.01) return "1/16";
    if (Math.abs(ratio - 0.125) < 0.01) return "1/8";
    if (Math.abs(ratio - 0.25) < 0.01) return "1/4";
    if (Math.abs(ratio - 0.5) < 0.01) return "1/2";
    if (Math.abs(ratio - 1) < 0.01) return "1x";
    if (Math.abs(ratio - 2) < 0.01) return "2x";
    // Fallback for non-standard values
    if (ratio < 0) return `${Math.round(ratio * 100)}% overlap`;
    return `${Math.round(ratio * 100)}%`;
  };

  return {
    colGapRatio,
    rowGapRatio,
    colGapCategory: ratioToLabel(colGapRatio),
    rowGapCategory: ratioToLabel(rowGapRatio),
    hasGaps: Math.abs(colGapRatio) > 0.01 || Math.abs(rowGapRatio) > 0.01,
    hasOverlap: colGapRatio < -0.01 || rowGapRatio < -0.01,
  };
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
  // Generates 4 colors for intensity levels, strictly from CGA_PALETTE
  const rng = seededRandom(seed + 3333);

  const bgVGA = findVGAColor(bgColor);
  const textVGA = findVGAColor(textColor);
  const isLightBg = bgVGA.luminance > 50;

  const sortByLum = (a, b) =>
    isLightBg ? b.luminance - a.luminance : a.luminance - b.luminance;

  const strategy = rng();

  if (strategy < 0.5) {
    // Strategy 1: Luminance interpolation within same temperature family
    // This creates a smooth gradient from bg toward text using CGA colors
    const path = interpolateByLuminance(bgVGA, textVGA, 6);
    return [
      path[0].hex,
      path[Math.floor(path.length * 0.33)].hex,
      path[Math.floor(path.length * 0.66)].hex,
      path[path.length - 1].hex,
    ];
  } else {
    // Strategy 2: Temperature-based selection from CGA palette
    // Pick colors from same and opposite temperature families
    const textTemp = textVGA.temperature;
    const oppositeTemp =
      textTemp === "warm" ? "cool" : textTemp === "cool" ? "warm" : "warm";

    // Get CGA colors with good contrast against background
    const sameTemp = PALETTE_BY_TEMPERATURE[textTemp]
      .filter((c) => hasGoodContrast(bgVGA, c, 2.0))
      .sort(sortByLum);
    const oppTemp = PALETTE_BY_TEMPERATURE[oppositeTemp]
      .filter((c) => hasGoodContrast(bgVGA, c, 2.0))
      .sort(sortByLum);

    const colors = [];
    const used = new Set();

    // Level 1: lightest visible mark from same temperature
    if (sameTemp.length > 0) {
      colors.push(sameTemp[0].hex);
      used.add(sameTemp[0].hex);
    } else {
      colors.push(textVGA.hex);
      used.add(textVGA.hex);
    }

    // Level 2: mid-tone from same temperature
    const mid1 = sameTemp.filter((c) => !used.has(c.hex));
    if (mid1.length > 0) {
      const pick = mid1[Math.floor(mid1.length * 0.4)];
      colors.push(pick.hex);
      used.add(pick.hex);
    } else {
      colors.push(textVGA.hex);
    }

    // Level 3: add contrast with opposite temperature if available
    const mid2 = oppTemp.filter((c) => !used.has(c.hex));
    if (mid2.length > 0) {
      const pick = mid2[Math.floor(mid2.length * 0.5)];
      colors.push(pick.hex);
      used.add(pick.hex);
    } else {
      colors.push(textVGA.hex);
    }

    // Level 4: darkest/most saturated unused color
    const remaining = [...sameTemp, ...oppTemp]
      .filter((c) => !used.has(c.hex))
      .sort(sortByLum);
    if (remaining.length > 0) {
      colors.push(remaining[remaining.length - 1].hex);
    } else {
      colors.push(textVGA.hex);
    }

    return colors;
  }
}

export function generateMultiColorEnabled(seed) {
  const rng = seededRandom(seed + 4444);
  return rng() < 0.25;
}

// ============ WEB-SAFE GRADIENT MODE ============
// 25% of outputs use "gradient mode" where one CGA color anchors the piece
// and other colors derive from it through web-safe interpolation space.

// Gradient probability decreases with crease count - sparse pieces are more atmospheric,
// dense pieces are more compressed. Uses exponential decay with floor.
export function getGradientProbability(creaseCount) {
  const maxProb = 0.35; // 35% at zero creases
  const floorProb = 0.08; // 8% floor at high crease counts
  const decay = 0.03; // decay rate
  return floorProb + (maxProb - floorProb) * Math.exp(-decay * creaseCount);
}

export function generateGradientMode(seed, creaseCount = 0) {
  if (FORCE_GRADIENT_MODE) return true;
  const rng = seededRandom(seed + 77777);
  const threshold = getGradientProbability(creaseCount);
  return rng() < threshold;
}

// Anchor types for gradient mode:
// - background: Pure CGA ground, derived text/accent (bold ground, soft marks)
// - text: Pure CGA text, derived background/accent (soft ground, bold marks)
// - accent: Pure CGA accent, derived background/text (soft everything, CGA pop)
export function generateAnchorType(seed) {
  const rng = seededRandom(seed + 88888);
  const roll = rng();
  if (roll < 0.5) return "background"; // 50%
  if (roll < 0.85) return "text"; // 35%
  return "accent"; // 15%
}

// Snap an RGB value to the nearest web-safe value (00, 33, 66, 99, CC, FF)
function snapToWebSafe(value) {
  const webSafeValues = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];
  let closest = webSafeValues[0];
  let minDist = Math.abs(value - closest);
  for (const wsv of webSafeValues) {
    const dist = Math.abs(value - wsv);
    if (dist < minDist) {
      minDist = dist;
      closest = wsv;
    }
  }
  return closest;
}

// Convert RGB to web-safe hex color
function rgbToWebSafeHex(r, g, b) {
  const sr = snapToWebSafe(r);
  const sg = snapToWebSafe(g);
  const sb = snapToWebSafe(b);
  return (
    "#" +
    sr.toString(16).padStart(2, "0").toUpperCase() +
    sg.toString(16).padStart(2, "0").toUpperCase() +
    sb.toString(16).padStart(2, "0").toUpperCase()
  );
}

// Parse hex color to RGB components
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// Calculate luminance of a hex color (0-1 range)
function getLuminanceFromHex(hex) {
  const rgb = hexToRgb(hex);
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

// Shift a color toward white or black by N web-safe steps
// direction: 1 = toward white, -1 = toward black
// steps: 1-3 (each step is 0x33 = 51 in RGB space)
export function shiftTowardWebSafe(hexColor, direction, steps) {
  const rgb = hexToRgb(hexColor);
  const stepSize = 0x33; // 51 - one web-safe increment
  const shift = direction * steps * stepSize;

  // Apply shift and clamp to valid range
  const r = Math.max(0, Math.min(255, rgb.r + shift));
  const g = Math.max(0, Math.min(255, rgb.g + shift));
  const b = Math.max(0, Math.min(255, rgb.b + shift));

  return rgbToWebSafeHex(r, g, b);
}

// Derive a web-safe color from a CGA color by shifting through web-safe space
// Considers contrast with the anchor color to ensure readability
export function deriveWebSafeColor(seed, cgaColor, anchorColor, role) {
  // Different offset per role to decorrelate
  const roleOffset = role === "background" ? 11111 : role === "text" ? 22222 : 33333;
  const rng = seededRandom(seed + roleOffset);

  const colorLum = getLuminanceFromHex(cgaColor);
  const anchorLum = getLuminanceFromHex(anchorColor);

  // Determine shift direction based on role and contrast needs
  let direction;
  if (role === "background") {
    // Background derivation: shift to create atmospheric ground
    // Dark colors: mostly toward white (soft grays), sometimes toward black (deeper)
    // Light colors: mostly toward black (muted), sometimes toward white (creams)
    if (colorLum < 0.3) {
      direction = rng() < 0.75 ? 1 : -1;
    } else if (colorLum > 0.7) {
      direction = rng() < 0.75 ? -1 : 1;
    } else {
      direction = rng() < 0.5 ? 1 : -1;
    }
  } else if (role === "text") {
    // Text derivation: shift to create softer marks
    // Consider anchor (background) luminance for contrast
    if (anchorLum < 0.4) {
      // Dark anchor: text should stay light or go lighter
      direction = colorLum > 0.5 ? (rng() < 0.6 ? -1 : 1) : 1;
    } else {
      // Light anchor: text should stay dark or go darker
      direction = colorLum < 0.5 ? (rng() < 0.6 ? 1 : -1) : -1;
    }
  } else {
    // Accent derivation: shift for visual interest
    direction = rng() < 0.5 ? 1 : -1;
  }

  // Steps: 1 step (subtle) 50%, 2 steps (moderate) 35%, 3 steps (strong) 15%
  const stepRoll = rng();
  const steps = stepRoll < 0.5 ? 1 : stepRoll < 0.85 ? 2 : 3;

  const derived = shiftTowardWebSafe(cgaColor, direction, steps);

  // Verify contrast - if too low, try opposite direction or more steps
  const derivedLum = getLuminanceFromHex(derived);
  const contrast = Math.abs(derivedLum - anchorLum);

  if (role !== "accent" && contrast < 0.2) {
    // Try opposite direction with more steps for better contrast
    const opposite = shiftTowardWebSafe(cgaColor, -direction, steps + 1);
    const oppositeLum = getLuminanceFromHex(opposite);
    if (Math.abs(oppositeLum - anchorLum) > contrast) {
      return opposite;
    }
  }

  return derived;
}

// Build gradient mode palette with anchor concept
// One CGA color stays pure, others derive through web-safe space
export function buildGradientPalette(seed, cgaPalette, anchorType) {
  const result = {
    ...cgaPalette,
    anchorType,
    cgaBg: cgaPalette.bg,
    cgaText: cgaPalette.text,
    cgaAccent: cgaPalette.accent,
  };

  if (anchorType === "background") {
    // Background is pure CGA, derive text and accent
    result.bg = cgaPalette.bg; // Pure CGA anchor
    result.text = deriveWebSafeColor(
      seed,
      cgaPalette.text,
      cgaPalette.bg,
      "text"
    );
    result.accent = deriveWebSafeColor(
      seed + 1,
      cgaPalette.accent,
      cgaPalette.bg,
      "accent"
    );
  } else if (anchorType === "text") {
    // Text is pure CGA, derive background and accent
    result.bg = deriveWebSafeColor(
      seed,
      cgaPalette.bg,
      cgaPalette.text,
      "background"
    );
    result.text = cgaPalette.text; // Pure CGA anchor
    result.accent = deriveWebSafeColor(
      seed + 1,
      cgaPalette.accent,
      cgaPalette.text,
      "accent"
    );
  } else {
    // Accent is pure CGA, derive background and text
    result.bg = deriveWebSafeColor(
      seed,
      cgaPalette.bg,
      cgaPalette.accent,
      "background"
    );
    result.text = deriveWebSafeColor(
      seed + 1,
      cgaPalette.text,
      result.bg,
      "text"
    );
    result.accent = cgaPalette.accent; // Pure CGA anchor
  }

  return result;
}

// Generate 4 web-safe colors interpolating from background to mark
// Level 0 is closest to background (used with ░ for lightest marks)
// Level 3 is the mark color itself (used with ▓ for heaviest marks)
// Works with any hex colors, not just CGA palette colors
export function generateWebSafeGradientPalette(bgColor, textColor) {
  const bgRgb = hexToRgb(bgColor);
  const textRgb = hexToRgb(textColor);

  // Interpolation steps from background toward mark
  // We want: level 0 = subtle, level 1 = light, level 2 = medium, level 3 = mark
  const steps = [0.25, 0.5, 0.75, 1.0];

  const colors = steps.map((t) => {
    // Linear interpolation in RGB space
    const r = Math.round(bgRgb.r + (textRgb.r - bgRgb.r) * t);
    const g = Math.round(bgRgb.g + (textRgb.g - bgRgb.g) * t);
    const b = Math.round(bgRgb.b + (textRgb.b - bgRgb.b) * t);
    return rgbToWebSafeHex(r, g, b);
  });

  return colors;
}

export function generateRareCellOutlines(seed) {
  const rng = seededRandom(seed + 7777);
  return rng() < 0.008;
}

export function generateRareHitCounts(seed) {
  const rng = seededRandom(seed + 8888);
  return rng() < 0.008;
}

export function generateRareCreaseLines(seed) {
  const rng = seededRandom(seed + 9191);
  return rng() < 0.008;
}

export function generateRareAnalyticsMode(seed) {
  const rng = seededRandom(seed + 9393);
  return rng() < 0.008;
}

export function generateDrawDirection(seed) {
  const rng = seededRandom(seed + 33333);
  const roll = rng();
  if (roll < 0.22) return "ltr";
  if (roll < 0.44) return "rtl";
  if (roll < 0.65) return "center";
  if (roll < 0.8) return "alternate";
  if (roll < 0.9) return "diagonal";
  if (roll < 0.96) return "randomMid";
  return "checkerboard";
}

// ============ PAPER PROPERTIES ============
// These properties control how folds register on the paper,
// breaking the 1:1 relationship between fold count and visual density.

export function generatePaperProperties(seed) {
  const rng = seededRandom(seed + 5555);

  // Absorbency: probability a crease "takes" and leaves a visible mark
  // Low = resistant paper (few marks), High = soft paper (most folds show)
  // Range: 0.1 to 0.9
  const absorbency = 0.1 + rng() * 0.8;

  // Intersection threshold (disabled - always 0)
  const intersectionThreshold = 0;

  // Angle affinity: preferred crease angle (null = no preference)
  // Creases aligned with affinity are stronger
  const hasAngleAffinity = rng() < 0.4; // 40% of pieces have angle affinity
  const angleAffinity = hasAngleAffinity ? rng() * 180 : null; // 0-180 degrees

  // Affinity strength: how strongly biased toward the affinity angle
  // 0 = no effect, 0.8 = strong bias
  const affinityStrength = hasAngleAffinity ? 0.2 + rng() * 0.6 : 0;

  // Saturation ceiling: maximum total weight the canvas can hold
  // Based on canvas area, with variation per piece
  // Lower ceiling = more "worn" look, earlier saturation
  const ceilingMultiplier = 0.3 + rng() * 1.4; // 0.3x to 1.7x base ceiling

  return {
    absorbency,
    intersectionThreshold,
    angleAffinity,
    affinityStrength,
    ceilingMultiplier,
  };
}

// Helper to get descriptive name for paper properties
export function getPaperDescription(props) {
  const absDesc =
    props.absorbency < 0.35
      ? "Resistant"
      : props.absorbency < 0.65
      ? "Standard"
      : "Absorbent";

  const threshDesc =
    props.intersectionThreshold < 0.15
      ? "Fine"
      : props.intersectionThreshold < 0.35
      ? "Medium"
      : "Coarse";

  const affinityDesc = props.angleAffinity !== null ? "Grain" : "Uniform";

  return `${absDesc}/${threshDesc}/${affinityDesc}`;
}

// Scale absorbency based on grid density (currently disabled, returns unmodified props)
export function scaleAbsorbencyForGrid(paperProps, cols, rows) {
  return paperProps;
}

// ============ MARGIN VARIANTS ============
// Margin size affects the whitespace border around the drawing area.
// Most pieces have full margin, with rarer variants having reduced/no margin.

// Margin multipliers (applied to DRAWING_MARGIN base of 145)
export const MARGIN_FULL = 1.0; // 145px - standard ~12% margin
export const MARGIN_HALF = 0.5; // ~72px - reduced margin
export const MARGIN_QUARTER = 0.25; // ~36px - minimal margin
export const MARGIN_NONE = 0; // 0px - edge-to-edge (bleed)

export function generateMarginSize(seed) {
  const rng = seededRandom(seed + 7777);
  const roll = rng() * 100;

  // Distribution: 50% full, 25% half, 20% quarter, 5% none
  if (roll < 50) {
    return { multiplier: MARGIN_FULL, name: "Full" };
  } else if (roll < 75) {
    return { multiplier: MARGIN_HALF, name: "Half" };
  } else if (roll < 95) {
    return { multiplier: MARGIN_QUARTER, name: "Quarter" };
  } else {
    return { multiplier: MARGIN_NONE, name: "Bleed" };
  }
}

// Get the actual margin in reference coordinates
export function getMarginValue(marginInfo) {
  return Math.round(DRAWING_MARGIN * marginInfo.multiplier);
}

// ============ GAP CALCULATION ============

const ALLOWED_GAP_RATIOS = [
  // Negative (overlap)
  -1 / 1,
  -1 / 2,
  -1 / 4,
  -1 / 8,
  -1 / 16,
  // Positive (spacing)
  1 / 64,
  1 / 32,
  1 / 16,
  1 / 8,
  1 / 4,
  1 / 2,
  1.0,
  2.0,
];

export function calculateGridWithGaps(
  seed,
  cellWidth,
  cellHeight,
  innerWidth,
  innerHeight
) {
  const gapRng = seededRandom(seed + 12345);

  // 40% chance of having any gaps at all
  const useGaps = gapRng() < 0.6;

  let useColGaps = false;
  let useRowGaps = false;
  let forceNegativeCol = false;
  let forceNegativeRow = false;

  if (useGaps) {
    const gapTypeRoll = gapRng();
    if (gapTypeRoll < 0.33) {
      useColGaps = true;
    } else if (gapTypeRoll < 0.66) {
      useRowGaps = true;
    } else {
      useColGaps = true;
      useRowGaps = true;
    }

    // 30% chance to force negative (overlap) gaps when gaps are enabled
    if (useColGaps && gapRng() < 0.3) {
      forceNegativeCol = true;
    }
    if (useRowGaps && gapRng() < 0.3) {
      forceNegativeRow = true;
    }
  }

  // Negative ratios that work well (not too extreme)
  const NEGATIVE_RATIOS = [-1 / 16, -1 / 8, -1 / 4, -1 / 2];

  // Weighted gap selection: smaller gaps are more common
  // Distribution: none 40%, tiny 25%, small 20%, medium 10%, large 5%
  const pickWeightedGapRatio = (forceNegative) => {
    if (forceNegative) {
      return NEGATIVE_RATIOS[Math.floor(gapRng() * NEGATIVE_RATIOS.length)];
    }
    const roll = gapRng();
    if (roll < 0.40) return 0;           // 40% no gap
    if (roll < 0.525) return 1 / 64;     // 12.5% tiny
    if (roll < 0.65) return 1 / 32;      // 12.5% tiny
    if (roll < 0.75) return 1 / 16;      // 10% small
    if (roll < 0.85) return 1 / 8;       // 10% small
    if (roll < 0.90) return 1 / 4;       // 5% medium
    if (roll < 0.95) return 1 / 2;       // 5% medium
    if (roll < 0.98) return 1.0;         // 3% large
    return 2.0;                          // 2% large
  };

  let refCellWidth = cellWidth;
  let refCellHeight = cellHeight;

  // Pick gap ratio and calculate column configuration
  const colGapRatio = useColGaps ? pickWeightedGapRatio(forceNegativeCol) : 0;
  const colGapCalc = refCellWidth * colGapRatio;
  const colStride = refCellWidth + colGapCalc;
  let bestCols = colStride > 0 ? Math.max(1, Math.floor((innerWidth + colGapCalc) / colStride)) : 1;
  let bestColGap = bestCols > 1 ? colGapCalc : 0;

  // Handle single column case
  if (bestCols === 1 && refCellWidth < innerWidth) {
    refCellWidth = innerWidth;
    bestColGap = 0;
  }

  // Pick gap ratio and calculate row configuration
  const rowGapRatio = useRowGaps ? pickWeightedGapRatio(forceNegativeRow) : 0;
  const rowGapCalc = refCellHeight * rowGapRatio;
  const rowStride = refCellHeight + rowGapCalc;
  let bestRows = rowStride > 0 ? Math.max(1, Math.floor((innerHeight + rowGapCalc) / rowStride)) : 1;
  let bestRowGap = bestRows > 1 ? rowGapCalc : 0;

  // Handle single row case
  if (bestRows === 1 && refCellHeight < innerHeight) {
    refCellHeight = innerHeight;
    bestRowGap = 0;
  }

  const cols = bestCols;
  const rows = bestRows;
  const colGap = bestColGap;
  const rowGap = bestRowGap;

  const actualGridWidth =
    cols * refCellWidth + (cols > 1 ? (cols - 1) * colGap : 0);
  const actualGridHeight =
    rows * refCellHeight + (rows > 1 ? (rows - 1) * rowGap : 0);

  const widthDiff = innerWidth - actualGridWidth;
  const heightDiff = innerHeight - actualGridHeight;

  return {
    cols,
    rows,
    cellWidth: refCellWidth,
    cellHeight: refCellHeight,
    colGap,
    rowGap,
    strideX: refCellWidth + colGap,
    strideY: refCellHeight + rowGap,
    gridOffsetX: widthDiff > 0 ? widthDiff / 2 : 0,
    gridOffsetY: heightDiff > 0 ? heightDiff / 2 : 0,
    actualGridWidth,
    actualGridHeight,
  };
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
// Uses BigInt for precise arithmetic matching Solidity uint256

const LCG_MULT = 1103515245n;
const LCG_INC = 12345n;
const LCG_MASK = 0x7fffffffn;

export function seededRandom(seed) {
  let state = BigInt(Math.abs(seed) || 1);
  return () => {
    state = (state * LCG_MULT + LCG_INC) & LCG_MASK;
    return Number(state) / Number(LCG_MASK);
  };
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

// ============ EDGE-TO-EDGE FOLD SYSTEM ============

// Edge constants
const EDGE_TOP = 0;
const EDGE_RIGHT = 1;
const EDGE_BOTTOM = 2;
const EDGE_LEFT = 3;

// Get point on canvas edge
function getEdgePoint(edge, t, w, h) {
  switch (edge) {
    case EDGE_TOP:
      return { x: t * w, y: 0 };
    case EDGE_RIGHT:
      return { x: w, y: t * h };
    case EDGE_BOTTOM:
      return { x: (1 - t) * w, y: h }; // Reverse direction for visual consistency
    case EDGE_LEFT:
      return { x: 0, y: (1 - t) * h };
    default:
      return { x: t * w, y: 0 };
  }
}

// Get corner point
function getCornerPoint(corner, w, h) {
  switch (corner) {
    case 0:
      return { x: 0, y: 0 }; // top-left
    case 1:
      return { x: w, y: 0 }; // top-right
    case 2:
      return { x: w, y: h }; // bottom-right
    case 3:
      return { x: 0, y: h }; // bottom-left
    default:
      return { x: 0, y: 0 };
  }
}

// Get point on existing crease
function getCreasePoint(crease, t) {
  return {
    x: crease.p1.x + (crease.p2.x - crease.p1.x) * t,
    y: crease.p1.y + (crease.p2.y - crease.p1.y) * t,
  };
}

// Calculate angle of a line segment (0-180 degrees)
function getCreaseAngle(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 180;
  if (angle >= 180) angle -= 180;
  return angle;
}

// Pick anchor point for a crease
function pickAnchor(
  foldIndex,
  existingCreases,
  intersections,
  w,
  h,
  rng,
  strategy
) {
  // Strategy-specific edge selection
  // Edge mapping: 0=top, 1=right, 2=bottom, 3=left
  // Horizontal edges: 0, 2 (top, bottom)
  // Vertical edges: 1, 3 (right, left)

  const getStrategyEdges = () => {
    if (!strategy) return [0, 1, 2, 3];

    switch (strategy.type) {
      case "horizontal":
        // Horizontal crease lines anchor on left/right edges
        return [1, 3];
      case "vertical":
        // Vertical crease lines anchor on top/bottom edges
        return [0, 2];
      case "grid":
        // Alternate between horizontal and vertical crease lines
        return foldIndex % 2 === 0 ? [1, 3] : [0, 2];
      case "diagonal":
        // Diagonal prefers corners, but can use any edge
        return [0, 1, 2, 3];
      case "radial":
      case "clustered":
      case "random":
      default:
        return [0, 1, 2, 3];
    }
  };

  const strategyEdges = getStrategyEdges();

  // For radial strategy, bias anchor toward focal point
  if (strategy && strategy.type === "radial") {
    const focalX = strategy.focalX * w;
    const focalY = strategy.focalY * h;

    // Early folds: start from edges near focal point
    // Later folds: can start from existing creases
    if (foldIndex < 10 || existingCreases.length === 0 || rng() < 0.6) {
      // Pick edge closest to focal point
      const edgeDistances = [
        { edge: 0, dist: focalY }, // top
        { edge: 1, dist: w - focalX }, // right
        { edge: 2, dist: h - focalY }, // bottom
        { edge: 3, dist: focalX }, // left
      ];
      edgeDistances.sort((a, b) => a.dist - b.dist);

      // Weight toward closer edges
      const roll = rng();
      const edge =
        roll < 0.5
          ? edgeDistances[0].edge
          : roll < 0.8
          ? edgeDistances[1].edge
          : edgeDistances[Math.floor(rng() * 4)].edge;

      // Position along edge biased toward focal point projection
      let t;
      if (edge === 0 || edge === 2) {
        // Top or bottom edge - bias toward focalX
        t = 0.1 + (focalX / w) * 0.8 + (rng() - 0.5) * 0.3;
      } else {
        // Left or right edge - bias toward focalY
        t = 0.1 + (focalY / h) * 0.8 + (rng() - 0.5) * 0.3;
      }
      t = Math.max(0.05, Math.min(0.95, t));

      return {
        point: getEdgePoint(edge, t, w, h),
        type: "edge",
        edge,
        t,
      };
    }
  }

  // For clustered strategy, bias anchor toward cluster area
  if (strategy && strategy.type === "clustered") {
    const clusterX = strategy.clusterX * w;
    const clusterY = strategy.clusterY * h;
    const spread = strategy.spread;

    // Higher chance to use edges that pass near cluster
    if (foldIndex < 15 || rng() < 0.7) {
      // Pick edge that will allow fold to pass through cluster
      const edgeWeights = [
        { edge: 0, weight: 1 + (1 - Math.abs(clusterY / h)) * 2 }, // top - better if cluster is high
        { edge: 1, weight: 1 + (clusterX / w) * 2 }, // right - better if cluster is right
        { edge: 2, weight: 1 + (clusterY / h) * 2 }, // bottom - better if cluster is low
        { edge: 3, weight: 1 + (1 - clusterX / w) * 2 }, // left - better if cluster is left
      ];

      const totalWeight = edgeWeights.reduce((sum, e) => sum + e.weight, 0);
      let roll = rng() * totalWeight;
      let edge = 0;
      for (const ew of edgeWeights) {
        roll -= ew.weight;
        if (roll <= 0) {
          edge = ew.edge;
          break;
        }
      }

      // Position along edge biased toward cluster projection
      let t;
      if (edge === 0 || edge === 2) {
        t = clusterX / w + (rng() - 0.5) * spread;
      } else {
        t = clusterY / h + (rng() - 0.5) * spread;
      }
      t = Math.max(0.05, Math.min(0.95, t));

      return {
        point: getEdgePoint(edge, t, w, h),
        type: "edge",
        edge,
        t,
      };
    }
  }

  // Early folds: strongly prefer canvas edges
  // Later folds: increasingly prefer existing creases/intersections
  const edgeProbability = Math.max(0.2, 1.0 - foldIndex * 0.015);

  // Grid/horizontal/vertical strategies must always use edge anchors for straight lines
  const forceEdge =
    strategy &&
    (strategy.type === "horizontal" ||
      strategy.type === "vertical" ||
      strategy.type === "grid");

  const useEdge =
    forceEdge ||
    rng() < edgeProbability ||
    (existingCreases.length === 0 && intersections.length === 0);

  if (useEdge) {
    // Pick from canvas boundary (edges or corners)
    // Diagonal strategy prefers corners; grid/horizontal/vertical never use corners
    const cornerChance = forceEdge
      ? 0
      : strategy && strategy.type === "diagonal"
      ? 0.5
      : 0.15;
    const useCorner = rng() < cornerChance;

    if (useCorner) {
      const corner = Math.floor(rng() * 4);
      return {
        point: getCornerPoint(corner, w, h),
        type: "corner",
        corner,
      };
    } else {
      // Pick from strategy-appropriate edges
      const edge = strategyEdges[Math.floor(rng() * strategyEdges.length)];
      // Apply jitter to position if strategy has it
      const jitter = strategy && strategy.jitter ? strategy.jitter / 100 : 0;
      const baseT = 0.05 + rng() * 0.9;
      const t = Math.max(0.05, Math.min(0.95, baseT + (rng() - 0.5) * jitter));
      return {
        point: getEdgePoint(edge, t, w, h),
        type: "edge",
        edge,
        t,
      };
    }
  } else {
    // Pick from existing structure
    const useIntersection = intersections.length > 0 && rng() < 0.35; // 35% chance if available

    if (useIntersection) {
      const inter = intersections[Math.floor(rng() * intersections.length)];
      return {
        point: { x: inter.x, y: inter.y },
        type: "intersection",
        intersectionIndex: intersections.indexOf(inter),
      };
    } else if (existingCreases.length > 0) {
      // Pick point on existing crease
      const crease =
        existingCreases[Math.floor(rng() * existingCreases.length)];
      // Avoid endpoints, stay in middle 80%
      const t = 0.1 + rng() * 0.8;
      return {
        point: getCreasePoint(crease, t),
        type: "crease",
        creaseIndex: existingCreases.indexOf(crease),
        t,
      };
    } else {
      // Fallback to edge
      const edge = strategyEdges[Math.floor(rng() * strategyEdges.length)];
      const t = 0.05 + rng() * 0.9;
      return {
        point: getEdgePoint(edge, t, w, h),
        type: "edge",
        edge,
        t,
      };
    }
  }
}

// Pick terminus point for a crease (must create valid line from anchor)
function pickTerminus(
  anchor,
  foldIndex,
  existingCreases,
  intersections,
  w,
  h,
  rng,
  relationshipBias,
  strategy
) {
  const minCreaseLength = Math.min(w, h) * 0.15; // Minimum crease length

  // Strategy-specific terminus selection
  // Edge mapping: 0=top, 1=right, 2=bottom, 3=left
  const isHorizontalEdge = (edge) => edge === 0 || edge === 2;
  const isVerticalEdge = (edge) => edge === 1 || edge === 3;

  // For horizontal/vertical/grid strategies, enforce straight folds
  if (
    strategy &&
    (strategy.type === "horizontal" ||
      strategy.type === "vertical" ||
      strategy.type === "grid")
  ) {
    const wantHorizontalFold =
      strategy.type === "horizontal" ||
      (strategy.type === "grid" && foldIndex % 2 === 0);

    if (anchor.type === "edge") {
      // For straight folds: go to opposite edge
      const oppositeEdge = (anchor.edge + 2) % 4;

      // Check if this creates the right fold direction
      // Anchor on vertical edge (left/right) creates horizontal crease
      const createsHorizontalFold = isVerticalEdge(anchor.edge);

      if (
        (wantHorizontalFold && createsHorizontalFold) ||
        (!wantHorizontalFold && !createsHorizontalFold)
      ) {
        // Good - anchor is on correct edge type, go to opposite
        const jitter = strategy.jitter ? strategy.jitter / 100 : 0;
        const baseT = anchor.t !== undefined ? anchor.t : 0.5;
        // Only apply small jitter - keep lines nearly straight
        let t = Math.max(0.05, Math.min(0.95, baseT + (rng() - 0.5) * jitter));

        // getEdgePoint uses t for edges 0,1 and (1-t) for edges 2,3
        // Opposite edges always have different conventions, so always invert
        t = 1 - t;

        return {
          point: getEdgePoint(oppositeEdge, t, w, h),
          type: "edge",
          edge: oppositeEdge,
        };
      }
    }
  }

  // For diagonal strategy, enforce 45° or 135° angles
  if (strategy && strategy.type === "diagonal") {
    const targetAngle = strategy.angle || (rng() < 0.5 ? 45 : 135);

    if (anchor.type === "corner") {
      // From corner, go to opposite corner for perfect diagonal
      const oppositeCorner = (anchor.corner + 2) % 4;
      return {
        point: getCornerPoint(oppositeCorner, w, h),
        type: "corner",
      };
    } else if (anchor.type === "edge") {
      // Calculate terminus to achieve target angle
      const jitter = strategy.jitter ? (rng() - 0.5) * strategy.jitter : 0;
      const angle = ((targetAngle + jitter) * Math.PI) / 180;

      // Project from anchor point at target angle to find edge intersection
      const ax = anchor.point.x;
      const ay = anchor.point.y;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      // Find intersection with canvas edges
      let bestPoint = null;
      let bestDist = 0;

      // Check all four edges
      const edges = [
        { edge: 0, y: 0 }, // top
        { edge: 2, y: h }, // bottom
        { edge: 3, x: 0 }, // left
        { edge: 1, x: w }, // right
      ];

      for (const e of edges) {
        let point = null;
        if (e.y !== undefined) {
          // Horizontal edge
          const t = (e.y - ay) / dy;
          if (t > 0) {
            const x = ax + dx * t;
            if (x >= 0 && x <= w) {
              point = { x, y: e.y };
            }
          }
        } else {
          // Vertical edge
          const t = (e.x - ax) / dx;
          if (t > 0) {
            const y = ay + dy * t;
            if (y >= 0 && y <= h) {
              point = { x: e.x, y };
            }
          }
        }

        if (point) {
          const dist = V.dist(anchor.point, point);
          if (dist > bestDist && dist >= minCreaseLength) {
            bestDist = dist;
            bestPoint = point;
          }
        }
      }

      if (bestPoint) {
        return { point: bestPoint, type: "edge" };
      }
    }
  }

  // For radial strategy, terminus should radiate from focal point
  if (strategy && strategy.type === "radial") {
    const focalX = strategy.focalX * w;
    const focalY = strategy.focalY * h;
    const focal = { x: focalX, y: focalY };

    // Calculate direction from focal point through anchor
    const dx = anchor.point.x - focalX;
    const dy = anchor.point.y - focalY;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0) {
      // Extend line from focal through anchor to opposite edge
      const ndx = dx / len;
      const ndy = dy / len;

      // Find where this ray exits the canvas
      let maxT = Infinity;
      if (ndx > 0) maxT = Math.min(maxT, (w - anchor.point.x) / ndx);
      if (ndx < 0) maxT = Math.min(maxT, -anchor.point.x / ndx);
      if (ndy > 0) maxT = Math.min(maxT, (h - anchor.point.y) / ndy);
      if (ndy < 0) maxT = Math.min(maxT, -anchor.point.y / ndy);

      const terminus = {
        x: Math.max(0, Math.min(w, anchor.point.x + ndx * maxT * 0.95)),
        y: Math.max(0, Math.min(h, anchor.point.y + ndy * maxT * 0.95)),
      };

      if (V.dist(anchor.point, terminus) >= minCreaseLength) {
        return { point: terminus, type: "edge" };
      }
    }
  }

  // For clustered strategy, bias terminus toward cluster
  if (strategy && strategy.type === "clustered") {
    const clusterX = strategy.clusterX * w;
    const clusterY = strategy.clusterY * h;
    const cluster = { x: clusterX, y: clusterY };

    // Create candidates that pass through or near cluster
    const clusterCandidates = [];

    for (let edge = 0; edge < 4; edge++) {
      for (let i = 0; i < 3; i++) {
        const t = 0.1 + rng() * 0.8;
        const point = getEdgePoint(edge, t, w, h);

        // Weight by how close the fold line passes to cluster
        const lineDistToCluster = pointToLineDistance(
          cluster,
          anchor.point,
          point
        );
        const maxDist = Math.max(w, h) * 0.5;
        const proximityWeight =
          Math.max(0.1, 1 - lineDistToCluster / maxDist) * 3;

        clusterCandidates.push({
          point,
          type: "edge",
          edge,
          weight: proximityWeight,
        });
      }
    }

    // Filter and select
    const validClusterCandidates = clusterCandidates.filter(
      (c) => V.dist(anchor.point, c.point) >= minCreaseLength
    );

    if (validClusterCandidates.length > 0) {
      const weights = validClusterCandidates.map((c) => c.weight);
      const idx = weightedRandomIndex(weights, rng);
      return validClusterCandidates[idx];
    }
  }

  // Default behavior for random strategy or fallback
  const candidates = [];

  // Always consider opposite/adjacent edges for strong compositions
  if (anchor.type === "edge") {
    // Prefer opposite edge for primary folds
    const oppositeEdge = (anchor.edge + 2) % 4;
    const adjacentEdge1 = (anchor.edge + 1) % 4;
    const adjacentEdge2 = (anchor.edge + 3) % 4;

    // Opposite edge - high weight for early folds
    const oppositeWeight = foldIndex < 3 ? 3.0 : 1.5;
    for (let i = 0; i < 3; i++) {
      const t = 0.1 + rng() * 0.8;
      candidates.push({
        point: getEdgePoint(oppositeEdge, t, w, h),
        type: "edge",
        edge: oppositeEdge,
        weight: oppositeWeight,
      });
    }

    // Adjacent edges - create diagonals
    const adjacentWeight = 1.0;
    for (let i = 0; i < 2; i++) {
      const t = 0.1 + rng() * 0.8;
      candidates.push({
        point: getEdgePoint(adjacentEdge1, t, w, h),
        type: "edge",
        edge: adjacentEdge1,
        weight: adjacentWeight,
      });
      candidates.push({
        point: getEdgePoint(adjacentEdge2, t, w, h),
        type: "edge",
        edge: adjacentEdge2,
        weight: adjacentWeight,
      });
    }
  } else if (anchor.type === "corner") {
    // From corner: go to opposite corner or adjacent edges
    const oppositeCorner = (anchor.corner + 2) % 4;
    candidates.push({
      point: getCornerPoint(oppositeCorner, w, h),
      type: "corner",
      weight: 2.0,
    });

    // Adjacent edges
    for (let edge = 0; edge < 4; edge++) {
      // Skip edges that touch this corner
      const touchesCorner =
        edge === anchor.corner || edge === (anchor.corner + 3) % 4;
      if (!touchesCorner) {
        const t = 0.2 + rng() * 0.6;
        candidates.push({
          point: getEdgePoint(edge, t, w, h),
          type: "edge",
          edge,
          weight: 1.5,
        });
      }
    }
  } else {
    // Anchor is on crease or intersection - can go to any edge
    for (let edge = 0; edge < 4; edge++) {
      const t = 0.1 + rng() * 0.8;
      candidates.push({
        point: getEdgePoint(edge, t, w, h),
        type: "edge",
        edge,
        weight: 1.0,
      });
    }

    // Can also terminate on another crease (for subdivision)
    if (existingCreases.length > 1 && foldIndex > 3) {
      for (let i = 0; i < Math.min(3, existingCreases.length); i++) {
        const creaseIdx = Math.floor(rng() * existingCreases.length);
        const crease = existingCreases[creaseIdx];
        // Don't terminate on the same crease we anchored from
        if (anchor.type === "crease" && anchor.creaseIndex === creaseIdx)
          continue;
        const t = 0.15 + rng() * 0.7;
        candidates.push({
          point: getCreasePoint(crease, t),
          type: "crease",
          creaseIndex: creaseIdx,
          weight: 0.6,
        });
      }
    }
  }

  // Apply relationship bias to candidate weights
  if (existingCreases.length > 0 && relationshipBias) {
    for (const cand of candidates) {
      const proposedAngle = getCreaseAngle(anchor.point, cand.point);

      for (const existing of existingCreases) {
        const existingAngle = getCreaseAngle(existing.p1, existing.p2);
        let angleDiff = Math.abs(proposedAngle - existingAngle);
        if (angleDiff > 90) angleDiff = 180 - angleDiff;

        // Parallel bias: boost weight if angles are similar
        if (relationshipBias.parallel > 0 && angleDiff < 15) {
          cand.weight *= 1 + relationshipBias.parallel;
        }

        // Perpendicular bias: boost weight if angles are ~90° apart
        if (relationshipBias.perpendicular > 0 && angleDiff > 75) {
          cand.weight *= 1 + relationshipBias.perpendicular;
        }
      }
    }
  }

  // Filter candidates by minimum length
  const validCandidates = candidates.filter((cand) => {
    const dist = V.dist(anchor.point, cand.point);
    return dist >= minCreaseLength;
  });

  if (validCandidates.length === 0) {
    // Fallback: pick any edge point far enough away
    for (let edge = 0; edge < 4; edge++) {
      const t = 0.5;
      const point = getEdgePoint(edge, t, w, h);
      if (V.dist(anchor.point, point) >= minCreaseLength) {
        return { point, type: "edge", edge };
      }
    }
    // Last resort: opposite edge center
    const edge = anchor.type === "edge" ? (anchor.edge + 2) % 4 : 0;
    return {
      point: getEdgePoint(edge, 0.5, w, h),
      type: "edge",
      edge,
    };
  }

  // Weighted random selection
  const weights = validCandidates.map((c) => c.weight);
  const idx = weightedRandomIndex(weights, rng);
  return validCandidates[idx];
}

// Helper: calculate distance from point to line segment
function pointToLineDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return V.dist(point, lineStart);

  let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };

  return V.dist(point, closest);
}

// Find intersections between creases (for anchor picking)
function findCreaseIntersections(creases) {
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
        intersections.push({
          x: hit.point.x,
          y: hit.point.y,
          crease1: i,
          crease2: j,
        });
      }
    }
  }
  return intersections;
}

// ============ FOLD SIMULATION ============

export function simulateFolds(
  width,
  height,
  numFolds,
  seed,
  weightRange = { min: 0.0, max: 1.0 },
  strategyOverride = null,
  paperProperties = null
) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { creases: [], finalShape: [] };
  }

  const strategy = strategyOverride || generateFoldStrategy(seed);
  const maxFolds = generateMaxFolds(seed);

  // Canvas shape (for compatibility, though we're not using paper folding simulation)
  const shape = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  const creases = [];
  let firstFoldTarget = null;
  let lastFoldTarget = null;

  if (!numFolds || numFolds <= 0) {
    return {
      creases: [],
      finalShape: shape,
      maxFolds,
      firstFoldTarget: null,
      lastFoldTarget: null,
    };
  }

  // RNGs for different purposes
  const mainRng = seededRandom(seed);
  const weightRng = seededRandom(seed + 8888);
  const absorbencyRng = seededRandom(seed + 6666);

  // Paper properties
  const paper = paperProperties || {
    absorbency: 1.0,
    intersectionThreshold: 0,
    angleAffinity: null,
    affinityStrength: 0,
    ceilingMultiplier: 1.0,
  };

  // Breathing cycle: reduction multipliers
  const reductionMultipliers = [];
  const reductionRng = seededRandom(seed + 1111);
  for (let i = 0; i < maxFolds; i++) {
    reductionMultipliers[i] = 0.001 + reductionRng() * 0.25;
  }

  // Relationship bias: seeded per piece
  const biasRng = seededRandom(seed + 2222);
  const relationshipBias = {
    parallel: biasRng() * 0.8, // 0 to 0.8 boost for parallel
    perpendicular: biasRng() * 0.8, // 0 to 0.8 boost for perpendicular
  };

  // Margin for fold targets
  const cellMargin = Math.max(width, height) * 0.05;

  // Track intersections for anchor picking (updated as we add creases)
  let knownIntersections = [];

  for (let f = 0; f < numFolds; f++) {
    const cyclePosition = f % maxFolds;
    const currentCycle = Math.floor(f / maxFolds);

    // Breathing: reduce old crease weights at cycle boundaries
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

    // Periodically update intersection list (not every fold for performance)
    if (f % 5 === 0 && creases.length > 1) {
      knownIntersections = findCreaseIntersections(creases);
    }

    // Pick anchor and terminus
    const anchor = pickAnchor(
      f,
      creases,
      knownIntersections,
      width,
      height,
      mainRng,
      strategy
    );
    const terminus = pickTerminus(
      anchor,
      f,
      creases,
      knownIntersections,
      width,
      height,
      mainRng,
      relationshipBias,
      strategy
    );

    // Create the crease line
    const p1 = anchor.point;
    const p2 = terminus.point;

    // Absorbency check: does this crease register on the paper?
    const absorbencyRoll = absorbencyRng();
    const creaseRegisters = absorbencyRoll < paper.absorbency;

    // Calculate base weight
    let newWeight =
      weightRange.min + weightRng() * (weightRange.max - weightRange.min);

    // Apply angle affinity
    if (paper.angleAffinity !== null && paper.affinityStrength > 0) {
      const creaseAngle = getCreaseAngle(p1, p2);
      let angleDiff = Math.abs(creaseAngle - paper.angleAffinity);
      if (angleDiff > 90) angleDiff = 180 - angleDiff;
      const angleModifier = 1.0 - (angleDiff / 90) * paper.affinityStrength;
      newWeight *= angleModifier;
    }

    // Only add if it registers and has meaningful weight
    if (creaseRegisters && newWeight > 0.01) {
      creases.push({
        p1: V.copy(p1),
        p2: V.copy(p2),
        depth: creases.length,
        weight: newWeight,
        cyclePosition: cyclePosition,
        reductionMultiplier: reductionMultipliers[cyclePosition],
        anchorType: anchor.type,
        terminusType: terminus.type,
      });

      // Update intersections after adding new crease
      if (creases.length > 1) {
        const newCrease = creases[creases.length - 1];
        for (let i = 0; i < creases.length - 1; i++) {
          const hit = segmentIntersect(
            newCrease.p1,
            newCrease.p2,
            creases[i].p1,
            creases[i].p2
          );
          if (hit) {
            knownIntersections.push({
              x: hit.point.x,
              y: hit.point.y,
              crease1: i,
              crease2: creases.length - 1,
            });
          }
        }
      }
    }

    // Track fold targets (midpoint of crease, clamped to margin)
    const midpoint = V.mid(p1, p2);
    const foldTarget = {
      x: Math.max(cellMargin, Math.min(width - cellMargin, midpoint.x)),
      y: Math.max(cellMargin, Math.min(height - cellMargin, midpoint.y)),
    };

    if (f === 0 && firstFoldTarget === null) {
      firstFoldTarget = foldTarget;
    }
    lastFoldTarget = foldTarget;
  }

  return {
    creases,
    finalShape: shape,
    maxFolds,
    firstFoldTarget,
    lastFoldTarget,
  };
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
  maxFolds = null,
  paperProperties = null
) {
  const allIntersections = findIntersections(creases);

  // Paper properties for filtering
  const paper = paperProperties || {
    intersectionThreshold: 0,
    ceilingMultiplier: 1.0,
  };

  // Filter intersections below threshold
  const intersections = allIntersections.filter(
    (inter) => inter.weight >= paper.intersectionThreshold
  );

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

  // Apply saturation ceiling: normalize if total weight exceeds ceiling
  // Base ceiling scales with grid size
  const baseCeiling = gridCols * gridRows * 0.5; // ~0.5 weight per cell on average
  const ceiling = baseCeiling * paper.ceilingMultiplier;

  const totalWeight = Object.values(cellWeights).reduce((a, b) => a + b, 0);

  if (totalWeight > ceiling && totalWeight > 0) {
    // Apply soft cap: diminishing returns above ceiling
    // Uses logarithmic scaling to compress excess weight
    const ratio = ceiling / totalWeight;
    const softRatio = ratio + (1 - ratio) * 0.3; // Allow some overflow, but compressed

    for (const key of Object.keys(cellWeights)) {
      cellWeights[key] *= softRatio;
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
  showEmptyCells = false,
  multiColor,
  levelColors,
  foldStrategy = null,
  paperProperties = null,
  padding = 0,
  showCreases = false,
  showPaperShape = false,
  showFoldTargets = false,
  showIntersections = false,
  showGrid = false,
  showHitCounts = false,
  showCellOutlines = false,
  showCreaseLines = false,
  fontFamily = FONT_STACK,
  linesOnlyMode = false,
  analyticsMode = false,
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

  // Calculate inner dimensions accounting for padding and drawing margin
  const refInnerWidth = REFERENCE_WIDTH - padding * 2 - DRAWING_MARGIN * 2;
  const refInnerHeight = REFERENCE_HEIGHT - padding * 2 - DRAWING_MARGIN * 2;

  // Add background texture (edge to edge, scales consistently)
  {
    // Base size on reference dimensions (15px at 1200px width), then scale
    const refTextureFontSize = 15;
    const textureFontSize = refTextureFontSize * scaleX;
    ctx.font = `${textureFontSize}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.1;
    // Use established character dimensions for perfect tiling
    const charWidth = textureFontSize * CHAR_WIDTH_RATIO;
    const charHeight = textureFontSize * 1.13;
    // Draw edge to edge
    for (let y = 0; y < outputHeight + charHeight; y += charHeight) {
      for (let x = 0; x < outputWidth + charWidth; x += charWidth) {
        ctx.fillText("░", x, y + charHeight);
      }
    }
    ctx.globalAlpha = 1.0;
  }

  // Use gap calculation for grid layout
  const grid = calculateGridWithGaps(
    seed,
    cellWidth,
    cellHeight,
    refInnerWidth,
    refInnerHeight
  );
  const { cols, rows, strideX, strideY, gridOffsetX, gridOffsetY } = grid;
  const refCellWidth = grid.cellWidth;
  const refCellHeight = grid.cellHeight;

  const drawWidth = refInnerWidth * scaleX;
  const drawHeight = refInnerHeight * scaleY;
  const offsetX = (padding + DRAWING_MARGIN + gridOffsetX) * scaleX;
  const offsetY = (padding + DRAWING_MARGIN + gridOffsetY) * scaleY;
  const actualCellWidth = refCellWidth * scaleX;
  const actualCellHeight = refCellHeight * scaleY;
  const actualStrideX = strideX * scaleX;
  const actualStrideY = strideY * scaleY;

  const weightRange = generateWeightRange(seed);

  // Scale absorbency based on grid density
  const scaledPaperProps = scaleAbsorbencyForGrid(paperProperties, cols, rows);

  // Use actual grid dimensions for fold simulation
  const actualGridWidth = grid.actualGridWidth;
  const actualGridHeight = grid.actualGridHeight;

  const { creases, finalShape, maxFolds, firstFoldTarget, lastFoldTarget } =
    simulateFolds(
      actualGridWidth,
      actualGridHeight,
      folds,
      seed,
      weightRange,
      foldStrategy,
      scaledPaperProps
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

  let firstFoldTargetCell = null;
  if (firstFoldTarget) {
    // Fold target is in grid space - convert to cell coordinates using stride
    const targetCol = Math.max(
      0,
      Math.min(cols - 1, Math.floor(firstFoldTarget.x / strideX))
    );
    const targetRow = Math.max(
      0,
      Math.min(rows - 1, Math.floor(firstFoldTarget.y / strideY))
    );
    firstFoldTargetCell = `${targetCol},${targetRow}`;
  }

  let lastFoldTargetCell = null;
  if (lastFoldTarget) {
    // Fold target is in grid space - convert to cell coordinates using stride
    const targetCol = Math.max(
      0,
      Math.min(cols - 1, Math.floor(lastFoldTarget.x / strideX))
    );
    const targetRow = Math.max(
      0,
      Math.min(rows - 1, Math.floor(lastFoldTarget.y / strideY))
    );
    lastFoldTargetCell = `${targetCol},${targetRow}`;
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
    actualStrideX,
    actualStrideY,
    maxFolds,
    paperProperties
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

  // Size font to fit cell height (with 14% vertical overflow accounted for)
  const glyphHeightRatio = 1 + CHAR_TOP_OVERFLOW + CHAR_BOTTOM_OVERFLOW_DARK; // 1.14
  const fontSize = actualCellHeight / glyphHeightRatio;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";

  const shadeChars = [" ", "░", "▒", "▓"];

  // Cap shade level for small cells - ▓ becomes solid at small sizes
  // Use only ░ and ▒ when fontSize < 30 to maintain visible texture
  const maxShadeLevel = fontSize < 30 ? 2 : 3;

  // Use measured glyph metrics instead of unreliable measureText
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const charTopOverflow = fontSize * CHAR_TOP_OVERFLOW;
  const charBottomOverflowDark = fontSize * CHAR_BOTTOM_OVERFLOW_DARK;
  const charBottomOverflowOther = fontSize * CHAR_BOTTOM_OVERFLOW_OTHER;
  const charLightLeftOffset = fontSize * CHAR_LIGHT_LEFT_OFFSET;

  const thresholds = calculateAdaptiveThresholds(intersectionWeight);

  // Determine cell overflow amount (how many cells chars can extend into)
  // 0 = no overflow, 1-5 = that many cells overflow (capped to prevent solid fills)
  const cellOverflowRng = seededRandom(seed + 22222);
  const overflowRoll = cellOverflowRng();
  let cellOverflowAmount;
  if (overflowRoll < 0.6) {
    cellOverflowAmount = 0; // 60% no overflow
  } else if (overflowRoll < 0.8) {
    cellOverflowAmount = 1; // 20% one cell overflow
  } else if (overflowRoll < 0.9) {
    cellOverflowAmount = 2; // 10% two cells overflow
  } else if (overflowRoll < 0.97) {
    cellOverflowAmount = 3; // 7% three cells overflow
  } else {
    cellOverflowAmount = 5; // 3% five cells overflow (max)
  }

  // Determine draw direction mode
  // Controls how characters fill cells and overflow
  const drawDirectionRng = seededRandom(seed + 33333);
  const directionRoll = drawDirectionRng();
  let drawDirectionMode;
  if (directionRoll < 0.22) {
    drawDirectionMode = "ltr"; // 22% - overflow extends right
  } else if (directionRoll < 0.44) {
    drawDirectionMode = "rtl"; // 22% - overflow extends left
  } else if (directionRoll < 0.65) {
    drawDirectionMode = "center"; // 21% - expand from center outward
  } else if (directionRoll < 0.8) {
    drawDirectionMode = "alternate"; // 15% - alternate per row
  } else if (directionRoll < 0.9) {
    drawDirectionMode = "diagonal"; // 10% - diagonal seam
  } else if (directionRoll < 0.96) {
    drawDirectionMode = "randomMid"; // 6% - random switch point per row
  } else {
    drawDirectionMode = "checkerboard"; // 4% - alternate by row AND column
  }

  // For alternate mode: randomize which direction first row starts with
  const alternateStartsRtl = drawDirectionRng() < 0.5;

  // For diagonal mode: starting column and shift direction
  const diagonalStartCol = Math.floor(drawDirectionRng() * cols);
  const diagonalShiftRight = drawDirectionRng() < 0.5; // true = seam moves right each row

  // Determine overlap pattern based on seed
  // 50% no overlap, then for overlaps: 75%/95% are 20% total, rest split remaining 30%
  const overlapRng = seededRandom(seed + 11111);
  const hasOverlap = overlapRng() >= 0.65; // 50% chance of any overlap

  // Overlap factors and their weights when overlap is enabled
  // [factor, cumulative probability]: 1.0=none, 0.95=5%, 0.75=25%, 0.5=50%, 0.25=75%, 0.05=95%
  const getBaseOverlapFactor = () => {
    if (!hasOverlap) return 1.0;
    const roll = overlapRng();
    // 10% each for 5%, 25%, 50% overlap (30% total) -> 60% of the 50% overlap chance
    // 10% each for 75%, 95% overlap (20% total) -> 40% of the 50% overlap chance
    if (roll < 0.1) return 0.95; // 5% overlap
    if (roll < 0.2) return 0.75; // 25% overlap
    if (roll < 0.3) return 0.65; // 35% overlap
    if (roll < 0.6) return 0.5; // 50% overlap
    if (roll < 0.8) return 0.25; // 75% overlap
    return 0.05; // 95% overlap
  };
  const baseOverlapFactor = getBaseOverlapFactor();

  // Pattern types: 0 = uniform, 1 = row-based, 2 = col-based, 3 = checkerboard, 4 = diagonal
  const overlapPatternType = hasOverlap ? Math.floor(overlapRng() * 5) : 0;
  const overlapIntervals = [0.95, 0.75, 0.5, 0.25, 0.05];
  const baseOverlapIndex = overlapIntervals.indexOf(baseOverlapFactor);
  const overlapVariation = Math.floor(overlapRng() * 3) + 1; // 1-3 steps of variation

  // Sub-pattern mode: 0 = regular intervals, 1 = random selection, 2 = irregular
  const overlapSubPattern = Math.floor(overlapRng() * 3);
  // Variable interval: 1-4 (not always every 2)
  const overlapInterval = Math.floor(overlapRng() * 4) + 1;
  // Pre-generate random row/col/diag selections for random mode (indices 0-19 should cover most grids)
  const randomRowSelection = [];
  const randomColSelection = [];
  const randomDiagSelection = [];
  const rowSelectionProb = 0.3 + overlapRng() * 0.4; // 30-70% of rows get different overlap
  const colSelectionProb = 0.3 + overlapRng() * 0.4; // independent probability for cols
  const diagSelectionProb = 0.3 + overlapRng() * 0.4; // independent probability for diagonals
  for (let i = 0; i < 20; i++) {
    randomRowSelection.push(overlapRng() < rowSelectionProb);
    randomColSelection.push(overlapRng() < colSelectionProb);
    randomDiagSelection.push(overlapRng() < diagSelectionProb);
  }
  // Checkerboard random mode type: 0 = OR (either row or col), 1 = XOR (one but not both)
  const checkerboardRandomMode = Math.floor(overlapRng() * 2);

  // For inverted mode: 10% chance to limit weight=0 cells to single char (barcode look)
  // 90% allow normal overlap on weight=0 cells (which are dark foreground in inverted)
  const invertedSingleCharOnEmpty = overlapRng() < 0.10;

  // Function to get overlap factor for a cell based on pattern
  const getOverlapFactor = (row, col) => {
    if (!hasOverlap) return 1.0;
    let idx = baseOverlapIndex === -1 ? 0 : baseOverlapIndex;

    switch (overlapPatternType) {
      case 1: // row-based bands
        if (overlapSubPattern === 1) {
          // Random: only selected rows get different overlap
          if (randomRowSelection[row % 20]) {
            idx = (idx + overlapVariation) % overlapIntervals.length;
          }
        } else if (overlapSubPattern === 2) {
          // Irregular: use row index directly for more chaos
          idx = (idx + (row % 3) * overlapVariation) % overlapIntervals.length;
        } else {
          // Regular: bands at variable intervals
          idx =
            (idx + Math.floor(row / overlapInterval) * overlapVariation) %
            overlapIntervals.length;
        }
        break;
      case 2: // col-based bands
        if (overlapSubPattern === 1) {
          // Random: only selected cols get different overlap
          if (randomColSelection[col % 20]) {
            idx = (idx + overlapVariation) % overlapIntervals.length;
          }
        } else if (overlapSubPattern === 2) {
          // Irregular: use col index directly for more chaos
          idx = (idx + (col % 3) * overlapVariation) % overlapIntervals.length;
        } else {
          // Regular: bands at variable intervals
          idx =
            (idx + Math.floor(col / overlapInterval) * overlapVariation) %
            overlapIntervals.length;
        }
        break;
      case 3: // checkerboard
        if (overlapSubPattern === 1) {
          // Random: OR or XOR based on checkerboardRandomMode
          const rowSel = randomRowSelection[row % 20];
          const colSel = randomColSelection[col % 20];
          const selected = checkerboardRandomMode === 0
            ? (rowSel || colSel)  // OR: either row or col selected
            : (rowSel !== colSel); // XOR: one but not both
          if (selected) {
            idx = (idx + overlapVariation) % overlapIntervals.length;
          }
        } else if (overlapSubPattern === 2) {
          // Irregular: use combined index with offset
          idx =
            (idx + ((row + col) % 3) * overlapVariation) %
            overlapIntervals.length;
        } else {
          // Regular checkerboard
          idx =
            (idx + ((row + col) % 2) * overlapVariation) %
            overlapIntervals.length;
        }
        break;
      case 4: // diagonal stripes
        if (overlapSubPattern === 1) {
          // Random: specific diagonals get different overlap (independent selection)
          const diagIdx = (row + col) % 20;
          if (randomDiagSelection[diagIdx]) {
            idx = (idx + overlapVariation) % overlapIntervals.length;
          }
        } else if (overlapSubPattern === 2) {
          // Irregular: variable diagonal widths
          idx =
            (idx + ((row + col) % 4) * overlapVariation) %
            overlapIntervals.length;
        } else {
          // Regular: diagonals at variable intervals
          idx =
            (idx +
              Math.floor((row + col) / overlapInterval) * overlapVariation) %
            overlapIntervals.length;
        }
        break;
      default: // uniform
        break;
    }
    return overlapIntervals[idx];
  };

  const getColorForLevel = (level, cellKey) => {
    // Use level colors if available (from gradient mode or multi-color mode)
    if (levelColors && levelColors.length > 0) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  // Shadow/offset effect - 25% chance
  const shadowRng = seededRandom(seed + 22222);
  const hasShadowEffect = shadowRng() < 0.25;
  const baseOffsetX = Math.round(2 + shadowRng() * 2) * scaleX; // 2-4px
  const baseOffsetY = Math.round(1 + shadowRng() * 2) * scaleY; // 1-3px
  const shadowAlpha = hasShadowEffect ? 0.4 + shadowRng() * 0.3 : 0; // 40-70% opacity
  // Direction varies per cell: 0 = horizontal only, 1 = vertical only, 2 = both
  const getShadowOffsets = (row, col) => {
    const cellRng = seededRandom(seed + 22222 + row * 1000 + col);
    const direction = Math.floor(cellRng() * 3);
    return {
      x: direction !== 1 ? baseOffsetX : 0,
      y: direction !== 0 ? baseOffsetY : 0,
    };
  };
  // Shadow color: use accent if distinct, otherwise pick contrasting CGA color
  const getShadowColor = () => {
    if (accentColor && accentColor !== textColor) {
      return accentColor;
    }
    // Pick a CGA color that contrasts with text
    const textVGA = findVGAColor(textColor);
    const candidates = CGA_PALETTE.filter(
      (c) =>
        c.hex !== textColor &&
        c.hex !== bgColor &&
        colorDistance(c, textVGA) > 100
    );
    // Pick deterministically based on seed
    const pickIdx = Math.floor(shadowRng() * candidates.length);
    const picked =
      candidates.length > 0 ? candidates[pickIdx] : CGA_PALETTE[0];
    return picked.hex;
  };
  const shadowColor = hasShadowEffect ? getShadowColor() : null;

  // Margin boundaries (accounting for measured glyph overflow)
  const marginStartX = (padding + DRAWING_MARGIN) * scaleX;
  const marginStartY = (padding + DRAWING_MARGIN) * scaleY;

  // Adjusted boundaries: inset by glyph overflow so chars stay within margins
  const drawAreaLeft = marginStartX + charLightLeftOffset; // ░ extends left
  const drawAreaTop = marginStartY + charTopOverflow; // all chars extend up
  const drawAreaRight = marginStartX + drawWidth;
  const drawAreaBottom = marginStartY + drawHeight - charBottomOverflowDark; // ▓ extends down

  // linesOnlyMode: skip character rendering, just draw lines and intersections
  // Used for secret Shift+L animation mode
  if (linesOnlyMode) {
    // Calculate contrast-aware line color
    const hexToLum = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return getLuminance(r, g, b);
    };
    const bgLum = hexToLum(bgColor);
    const textLum = hexToLum(textColor);
    const accentLum = hexToLum(accentColor);
    const lineColor =
      Math.abs(bgLum - textLum) > Math.abs(bgLum - accentLum)
        ? textColor
        : accentColor;

    // Draw crease lines
    const lineWidth = 2 * scaleX;
    if (activeCreases.length > 0) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      for (const crease of activeCreases) {
        ctx.beginPath();
        ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
        ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
        ctx.stroke();
      }
    }

    // Draw intersection points as stroked circles (same style as lines)
    if (activeIntersections && activeIntersections.length > 0) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;
      const radius = 4 * scaleX;
      for (const inter of activeIntersections) {
        ctx.beginPath();
        ctx.arc(offsetX + inter.x, offsetY + inter.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  } else if (analyticsMode) {
    // analyticsMode: show grid, crease lines, and hit counts all in accent color
    const lineWidth = 2 * scaleX;

    // Draw grid in accent color
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    // Vertical lines
    for (let col = 0; col <= cols; col++) {
      const x = offsetX + col * actualStrideX;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + drawHeight);
      ctx.stroke();
    }
    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = offsetY + row * actualStrideY;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + drawWidth, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw crease lines in accent color
    if (activeCreases.length > 0) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      for (const crease of activeCreases) {
        ctx.beginPath();
        ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
        ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
        ctx.stroke();
      }
    }

    // Draw intersection points in accent color
    if (activeIntersections && activeIntersections.length > 0) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;
      const radius = 4 * scaleX;
      for (const inter of activeIntersections) {
        ctx.beginPath();
        ctx.arc(offsetX + inter.x, offsetY + inter.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw hit counts in accent color
    const hitFontSize = Math.floor(
      Math.min(actualCellWidth * 0.45, actualCellHeight * 0.7)
    );
    ctx.font = `bold ${hitFontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accentColor;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = Math.round(
          offsetX + col * actualStrideX + actualCellWidth / 2
        );
        const y = Math.round(
          offsetY + row * actualStrideY + actualCellHeight / 2
        );
        const key = `${col},${row}`;
        const weight = intersectionWeight[key] || 0;

        ctx.fillText(Math.round(weight).toString(), x, y);
      }
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  } else if (showHitCounts) {
    // showHitCounts mode: draw numeric weight values instead of shade characters
    const hitFontSize = Math.floor(
      Math.min(actualCellWidth * 0.45, actualCellHeight * 0.7)
    );
    ctx.font = `bold ${hitFontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = Math.round(
          offsetX + col * actualStrideX + actualCellWidth / 2
        );
        const y = Math.round(
          offsetY + row * actualStrideY + actualCellHeight / 2
        );
        const key = `${col},${row}`;
        const weight = intersectionWeight[key] || 0;

        ctx.fillText(Math.round(weight).toString(), x, y);
      }
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  } else {
    // Normal rendering: shade characters
    // Adjust offsets to account for glyph overflow (so chars stay within margins)
    const adjustedOffsetX = Math.max(offsetX, drawAreaLeft);
    const adjustedOffsetY = Math.max(offsetY, drawAreaTop);

    for (let row = 0; row < rows; row++) {
      const y = Math.round(adjustedOffsetY + row * actualStrideY);

      // Skip row if it starts past the drawing area (allow slight glyph overflow)
      if (y > marginStartY + drawHeight) continue;

      for (let col = 0; col < cols; col++) {
        const x = Math.round(adjustedOffsetX + col * actualStrideX);

        const key = `${col},${row}`;
        const weight = intersectionWeight[key] || 0;

        let char = null;
        let color = textColor;
        let level = -1;
        let isEmptyCell = false;

        if (firstFoldTargetCell === key) {
          // First fold target: ONLY exception - always show with accent color
          level = weight > 0 ? countToLevelAdaptive(weight, thresholds) : 2;
          char = shadeChars[Math.min(Math.max(level, 2), maxShadeLevel)];
          color = accentColor;
        } else if (renderMode === "normal") {
          level = countToLevelAdaptive(weight, thresholds);
          if (level === 0) {
            // Skip empty cells - background texture provides visual interest
            char = null;
          } else {
            char = shadeChars[Math.min(level, maxShadeLevel)];
          }
          color = getColorForLevel(level, key);
          // Apply special styling within mode constraints
          if (weight >= 1.5) {
            const extremeAmount = weight - 1.5;
            const baseShift = 30 + Math.min(extremeAmount * 300, 150);
            const baseHsl = hexToHsl(textColor);
            color = hslToHex(
              (baseHsl.h + baseShift + 360) % 360,
              Math.min(100, baseHsl.s + 20),
              Math.min(85, baseHsl.l + 10)
            );
          } else if (accentCells.has(key) && weight > 0) {
            color = accentColor;
          } else if (lastFoldTargetCell === key) {
            color = textColor;
          }
        } else if (renderMode === "binary") {
          if (weight === 0) {
            if (showEmptyCells) {
              char = shadeChars[1];
              level = 0;
              isEmptyCell = true;
              color = textColor;
            }
            // else: no char, cell stays empty
          } else {
            level = maxShadeLevel;
            char = shadeChars[level];
            color = getColorForLevel(level, key);
            if (accentCells.has(key)) color = accentColor;
          }
        } else if (renderMode === "inverted") {
          level = Math.min(
            3 - countToLevelAdaptive(weight, thresholds),
            maxShadeLevel
          );
          char = shadeChars[level];
          color = getColorForLevel(level, key);
          if (weight >= 1.5) {
            const extremeAmount = weight - 1.5;
            const baseShift = 30 + Math.min(extremeAmount * 300, 150);
            const baseHsl = hexToHsl(textColor);
            color = hslToHex(
              (baseHsl.h + baseShift + 360) % 360,
              Math.min(100, baseHsl.s + 20),
              Math.min(85, baseHsl.l + 10)
            );
          } else if (accentCells.has(key) && weight > 0) {
            color = accentColor;
          }
        } else if (renderMode === "sparse") {
          level = countToLevelAdaptive(weight, thresholds);
          if (level === 1) {
            char = shadeChars[1];
            color = getColorForLevel(1, key);
            if (accentCells.has(key)) color = accentColor;
          } else {
            // Skip empty cells - background texture provides visual interest
            char = null;
          }
        } else if (renderMode === "dense") {
          level = countToLevelAdaptive(weight, thresholds);
          if (level >= 2) {
            char = shadeChars[Math.min(level, maxShadeLevel)];
            color = getColorForLevel(level, key);
            if (weight >= 1.5) {
              const extremeAmount = weight - 1.5;
              const baseShift = 30 + Math.min(extremeAmount * 300, 150);
              const baseHsl = hexToHsl(textColor);
              color = hslToHex(
                (baseHsl.h + baseShift + 360) % 360,
                Math.min(100, baseHsl.s + 20),
                Math.min(85, baseHsl.l + 10)
              );
            } else if (accentCells.has(key)) {
              color = accentColor;
            }
          } else {
            // Skip empty cells - background texture provides visual interest
            char = null;
          }
        }

        if (char) {
          // Use the color we determined earlier (accentColor for fold targets)
          // Don't override it with finalColor for fold target cells
          if (firstFoldTargetCell === key || lastFoldTargetCell === key) {
            ctx.fillStyle = color; // Already set to accentColor || textColor
          } else {
            const finalColor = getColorForLevel(
              countToLevelAdaptive(weight, thresholds),
              key
            );
            ctx.fillStyle =
              accentCells.has(key) && weight > 0 ? accentColor : finalColor;
          }

          // Empty cells: draw lightest character at reduced opacity using text color
          if (isEmptyCell) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = textColor;
          }

          const measuredCharWidth = ctx.measureText(char).width;
          const cellEndX = x + actualCellWidth;

          // Use cell boundary, capped at margin
          const effectiveCellEndX = Math.min(cellEndX, drawAreaRight);
          const effectiveCellWidth = effectiveCellEndX - x;

          // Skip cells that are too narrow to meaningfully show a character
          // (less than 50% of char width would just create visual noise)
          if (effectiveCellWidth < charWidth * 0.5) continue;

          // Get pattern-based overlap factor for this cell
          // Non-inverted weight=0: no overlap but allow multiple chars (fill cell evenly)
          // Inverted weight=0 (10%): single char only (barcode look)
          const noOverlap = isEmptyCell || (weight === 0 && renderMode !== "inverted");
          const singleCharOnly = renderMode === "inverted" && weight === 0 && invertedSingleCharOnEmpty;
          const cellOverlapFactor = (noOverlap || singleCharOnly)
            ? 1.0
            : getOverlapFactor(row, col);

          // Calculate step based on overlap factor (1.0 = no overlap, 0.5 = 50% overlap)
          const effectiveStep = charWidth * cellOverlapFactor;

          // Calculate how many chars fit with this step
          const charsWithStep = Math.max(
            1,
            Math.floor((effectiveCellWidth - charWidth) / effectiveStep) + 1
          );

          // Check if we need one more char to fill remaining gap
          const coveredWidth = (charsWithStep - 1) * effectiveStep + charWidth;
          const remainingGap = effectiveCellWidth - coveredWidth;
          const gapRatio = remainingGap / charWidth;

          // Add extra char if gap > 30% of char width
          const numCharsInCell =
            gapRatio > 0.3 ? charsWithStep + 1 : charsWithStep;

          // Calculate actual step to fill cell exactly
          const step =
            numCharsInCell <= 1
              ? charWidth
              : (effectiveCellWidth - charWidth) / (numCharsInCell - 1);

          // Calculate max overflow distance based on cellOverflowAmount
          // Skip overflow for empty cells and single-char mode
          const skipOverflow = isEmptyCell || singleCharOnly;
          const overflowDistance = skipOverflow ? 0 : cellOverflowAmount * actualCellWidth;

          // Calculate overflow chars based on direction
          // Base cell is always filled; overflow extends in the specified direction
          let overflowChars = 0;
          if (overflowDistance > 0) {
            overflowChars = Math.ceil(overflowDistance / step);
          }
          const maxChars = singleCharOnly ? 1 : numCharsInCell + overflowChars;

          // Determine effective direction for this cell based on mode
          let cellDirection; // "ltr", "rtl", or "center"
          if (drawDirectionMode === "ltr") {
            cellDirection = "ltr";
          } else if (drawDirectionMode === "rtl") {
            cellDirection = "rtl";
          } else if (drawDirectionMode === "center") {
            cellDirection = "center";
          } else if (drawDirectionMode === "alternate") {
            // Alternate per row, with random start direction
            const isOddRow = row % 2 === 1;
            cellDirection = isOddRow !== alternateStartsRtl ? "rtl" : "ltr";
          } else if (drawDirectionMode === "diagonal") {
            // Seam shifts per row; left of seam is one direction, right is other
            const seamCol =
              (diagonalStartCol +
                (diagonalShiftRight ? row : -row) +
                cols * 100) %
              cols;
            cellDirection = col < seamCol ? "ltr" : "rtl";
          } else if (drawDirectionMode === "randomMid") {
            // Random switch point per row (seeded by row)
            const rowRng = seededRandom(seed + 55555 + row);
            const switchCol = Math.floor(rowRng() * cols);
            cellDirection = col < switchCol ? "ltr" : "rtl";
          } else if (drawDirectionMode === "checkerboard") {
            // Alternate by both row and column
            cellDirection = (row + col) % 2 === 0 ? "ltr" : "rtl";
          } else {
            cellDirection = "ltr";
          }

          // Calculate cell center for center-out mode
          const cellCenterX = x + effectiveCellWidth / 2;

          for (let i = 0; i < maxChars && level >= 0; i++) {
            let nextChar = char;
            if (level >= 2 && i > 0 && i % 2 === 0) {
              nextChar = shadeChars[Math.max(0, level - 1)];
            }

            // Calculate draw position based on cell direction
            let drawX;
            if (cellDirection === "center") {
              // Center-out: alternate left and right from center
              if (i < numCharsInCell) {
                // Base cell: expand from center
                const offset = Math.floor((i + 1) / 2) * step;
                if (i % 2 === 0) {
                  // Even indices go right of center (or center itself for i=0)
                  drawX =
                    cellCenterX +
                    (i === 0 ? -charWidth / 2 : offset - charWidth / 2);
                } else {
                  // Odd indices go left of center
                  drawX = cellCenterX - offset - charWidth / 2;
                }
              } else {
                // Overflow: continue alternating outward
                const overflowIndex = i - numCharsInCell;
                const baseOffset = Math.floor(numCharsInCell / 2) * step;
                const extraOffset = Math.floor((overflowIndex + 1) / 2) * step;
                if (overflowIndex % 2 === 0) {
                  drawX = cellCenterX + baseOffset + extraOffset;
                  if (drawX + charWidth > drawAreaRight) break;
                } else {
                  drawX = cellCenterX - baseOffset - extraOffset - charWidth;
                  if (drawX < drawAreaLeft) break;
                }
              }
            } else if (i < numCharsInCell) {
              // Base cell: fill from left edge (same for ltr and rtl)
              drawX = x + i * step;
            } else if (cellDirection === "rtl") {
              // Overflow extends LEFT from cell start
              const overflowIndex = i - numCharsInCell;
              drawX = x - (overflowIndex + 1) * step;
              if (drawX < drawAreaLeft) break;
            } else {
              // Overflow extends RIGHT from cell end (ltr)
              const overflowIndex = i - numCharsInCell;
              drawX = effectiveCellEndX + overflowIndex * step;
              if (drawX + charWidth > drawAreaRight) break;
            }

            // Draw shadow first (behind main character)
            if (hasShadowEffect && !isEmptyCell) {
              const shadowOffsets = getShadowOffsets(row, col);
              const prevAlpha = ctx.globalAlpha;
              const prevFill = ctx.fillStyle;
              ctx.globalAlpha = shadowAlpha;
              ctx.fillStyle = shadowColor;
              ctx.fillText(
                nextChar,
                drawX + shadowOffsets.x,
                y + shadowOffsets.y
              );
              ctx.globalAlpha = prevAlpha;
              ctx.fillStyle = prevFill;
            }

            ctx.fillText(nextChar, drawX, y);
          }

          // Reset alpha after drawing empty cells
          if (isEmptyCell) {
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  } // end else (normal rendering)

  // Draw cell outlines if enabled
  if (showCellOutlines) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = Math.round(offsetX + col * actualStrideX);
        const y = Math.round(offsetY + row * actualStrideY);
        ctx.strokeRect(x, y, actualCellWidth, actualCellHeight);
      }
    }
  }

  // Rare variant: draw crease lines on bg using accent/text color
  if (showCreaseLines && activeCreases.length > 0) {
    const creaseRng = seededRandom(seed + 9292);
    const useAccent = creaseRng() < 0.6; // 60% accent, 40% text
    ctx.strokeStyle = useAccent ? accentColor : textColor;
    ctx.lineWidth = 1.5 * scaleX;
    ctx.globalAlpha = 0.85;
    ctx.lineCap = "round";
    for (const crease of activeCreases) {
      ctx.beginPath();
      ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
      ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (showCreases) {
    // Use same contrast-aware line color as linesOnlyMode
    const hexToLum = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return getLuminance(r, g, b);
    };
    const bgLum = hexToLum(bgColor);
    const textLum = hexToLum(textColor);
    const accentLum = hexToLum(accentColor);
    const lineColor =
      Math.abs(bgLum - textLum) > Math.abs(bgLum - accentLum)
        ? textColor
        : accentColor;

    const lineWidth = 2 * scaleX;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    for (const crease of activeCreases) {
      ctx.beginPath();
      ctx.moveTo(offsetX + crease.p1.x, offsetY + crease.p1.y);
      ctx.lineTo(offsetX + crease.p2.x, offsetY + crease.p2.y);
      ctx.stroke();
    }

    // Draw intersection points as stroked circles (same style as lines)
    if (activeIntersections && activeIntersections.length > 0) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;
      const radius = 4 * scaleX;
      for (const inter of activeIntersections) {
        ctx.beginPath();
        ctx.arc(offsetX + inter.x, offsetY + inter.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
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

  // Draw grid overlay
  if (showGrid) {
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    // Vertical lines
    for (let col = 0; col <= cols; col++) {
      const x = offsetX + col * actualStrideX;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + drawHeight);
      ctx.stroke();
    }
    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = offsetY + row * actualStrideY;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + drawWidth, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Draw fold target markers
  if (showFoldTargets) {
    const radius = 8 * scaleX;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;

    if (firstFoldTarget) {
      const targetX = offsetX + firstFoldTarget.x * scaleX;
      const targetY = offsetY + firstFoldTarget.y * scaleY;
      ctx.strokeStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (lastFoldTarget) {
      const targetX = offsetX + lastFoldTarget.x * scaleX;
      const targetY = offsetY + lastFoldTarget.y * scaleY;
      ctx.strokeStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Intersection point circles disabled for now
  // if (
  //   showIntersections &&
  //   !linesOnlyMode &&
  //   activeIntersections &&
  //   activeIntersections.length > 0
  // ) {
  //   ctx.strokeStyle = textColor;
  //   ctx.lineWidth = 1.5;
  //   ctx.globalAlpha = 0.5;
  //   const radius = 3;
  //   for (const intersection of activeIntersections) {
  //     ctx.beginPath();
  //     ctx.arc(
  //       offsetX + intersection.x,
  //       offsetY + intersection.y,
  //       radius,
  //       0,
  //       Math.PI * 2
  //     );
  //     ctx.stroke();
  //   }
  //   ctx.globalAlpha = 1;
  // }

  // Compile settings info for display
  const settings = {
    grid: {
      cols,
      rows,
      colGap: grid.colGap,
      rowGap: grid.rowGap,
    },
    drawDirection: drawDirectionMode,
    foldStrategy: foldStrategy?.type || "random",
    multiColor,
    showCreaseLines,
    creaseCount: creases.length,
  };

  return {
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    settings,
  };
}

// ============ PARAMETER GENERATION ============

export function generateAllParams(
  seed,
  width = REFERENCE_WIDTH,
  height = REFERENCE_HEIGHT,
  padding = 0,
  folds = null
) {
  // Generate fold-related parameters first (needed for crease count)
  const weightRange = generateWeightRange(seed);
  const foldStrategy = generateFoldStrategy(seed);
  const maxFolds = generateMaxFolds(seed);
  const paperProperties = generatePaperProperties(seed);

  let foldCount = folds;
  if (foldCount === null) {
    const foldRng = seededRandom(seed + 9999);
    foldCount = Math.floor(1 + foldRng() * 500);
  }

  // Run fold simulation to get actual crease count
  // This determines visual density which influences palette choice
  const drawWidth = width - DRAWING_MARGIN * 2;
  const drawHeight = height - DRAWING_MARGIN * 2;
  const { creases } = simulateFolds(
    drawWidth,
    drawHeight,
    foldCount,
    seed,
    weightRange,
    foldStrategy,
    paperProperties
  );
  const creaseCount = creases.length;

  // Gradient mode probability decreases with crease count
  // Sparse pieces are more atmospheric, dense pieces are more compressed
  const gradientProbability = getGradientProbability(creaseCount);
  const gradientMode = generateGradientMode(seed, creaseCount);

  // Generate CGA palette as normal (ground, text, accent using existing contrast logic)
  const cgaPalette = generatePalette(seed);

  // Build final palette
  let palette;
  let anchorType = null;
  if (gradientMode) {
    // Determine anchor type: background (50%), text (35%), accent (15%)
    anchorType = generateAnchorType(seed);
    // Build palette with anchor concept
    palette = buildGradientPalette(seed, cgaPalette, anchorType);
  } else {
    palette = cgaPalette;
  }

  // Multi-color: 25% of non-gradient pieces use CGA palette interpolation
  // Gradient mode and multi-color are mutually exclusive (gradient takes precedence)
  const multiColor = gradientMode ? false : generateMultiColorEnabled(seed);

  // Generate level colors based on mode:
  // - Gradient mode: web-safe interpolation between final bg and text
  // - Multi-color (no gradient): CGA palette interpolation
  // - Neither: single text color (null)
  let levelColors = null;
  if (gradientMode) {
    levelColors = generateWebSafeGradientPalette(palette.bg, palette.text);
  } else if (multiColor) {
    levelColors = generateMultiColorPalette(seed, palette.bg, palette.text);
  }

  const cells = generateCellDimensions(width, height, 0, seed);
  const renderMode = generateRenderMode(seed);
  const showEmptyCells = generateShowEmptyCells(seed);
  const showCreaseLines = generateRareCreaseLines(seed);
  const analyticsMode = generateRareAnalyticsMode(seed);
  const overlapInfo = generateOverlapInfo(seed);

  return {
    seed,
    palette,
    cells,
    renderMode,
    showEmptyCells,
    weightRange,
    foldStrategy,
    gradientMode,
    gradientProbability,
    creaseCount,
    multiColor,
    levelColors,
    maxFolds,
    paperProperties,
    showCreaseLines,
    analyticsMode,
    overlapInfo,
    folds: foldCount,
  };
}

// ============ METADATA GENERATION ============

export function generateMetadata(tokenId, seed, foldCount, imageBaseUrl = "") {
  const params = generateAllParams(
    seed,
    REFERENCE_WIDTH,
    REFERENCE_HEIGHT,
    0,
    foldCount
  );

  // Get paper description for traits
  const paperDesc = getPaperDescription(params.paperProperties);

  // Format palette strategy for display
  // gradient/anchor-type (probability% @ creases) or cga/strategy (probability% gradient @ creases)
  const probPct = Math.round(params.gradientProbability * 100);
  let paletteStrategyDisplay;
  if (params.gradientMode) {
    const anchorType = params.palette.anchorType || "background";
    paletteStrategyDisplay = `gradient/${anchorType} (${probPct}% @ ${params.creaseCount} creases)`;
  } else {
    paletteStrategyDisplay = `cga/${params.palette.strategy} (${probPct}% gradient @ ${params.creaseCount} creases)`;
  }

  return {
    name: `Fold #${tokenId}`,
    description: "On-chain generative paper folding art",
    image: imageBaseUrl ? `${imageBaseUrl}/${tokenId}` : "",
    attributes: [
      { trait_type: "Fold Strategy", value: params.foldStrategy.type },
      { trait_type: "Render Mode", value: params.renderMode },
      { trait_type: "Multi-Color", value: params.multiColor ? "Yes" : "No" },
      {
        trait_type: "Cell Size",
        value: `${params.cells.cellW}x${params.cells.cellH}`,
      },
      { trait_type: "Fold Count", value: foldCount },
      { trait_type: "Max Folds", value: params.maxFolds },
      { trait_type: "Crease Count", value: params.creaseCount },
      { trait_type: "Palette Strategy", value: paletteStrategyDisplay },
      { trait_type: "Paper Type", value: paperDesc },
      {
        trait_type: "Paper Grain",
        value:
          params.paperProperties.angleAffinity !== null ? "Grain" : "Uniform",
      },
      ...(params.showCreaseLines
        ? [{ trait_type: "Crease Lines", value: "Visible" }]
        : []),
    ],
  };
}

// ============ ON-CHAIN ENTRY POINT ============

// Load the embedded font - call this before rendering
let fontLoaded = false;
export async function loadFont() {
  if (fontLoaded) return true;
  const result = await loadOnChainFont(ONCHAIN_FONT_DATA_URI);
  fontLoaded = result;
  return result;
}

// Load font from data URI and wait for it to be ready
async function loadOnChainFont(fontDataUri) {
  if (!fontDataUri) return false;

  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: '${ONCHAIN_FONT_NAME}';
      src: url('${fontDataUri}');
    }
  `;
  document.head.appendChild(style);

  // Wait for font to load and be ready
  try {
    await document.fonts.load(`12px ${ONCHAIN_FONT_NAME}`);
    await document.fonts.ready;
    return true;
  } catch (err) {
    console.warn("Failed to load on-chain font:", err);
    return false;
  }
}

// Convert hex string seed to numeric seed
function hexSeedToNumber(hexSeed) {
  if (typeof hexSeed === "number") return hexSeed;
  if (typeof hexSeed !== "string") return 0;
  // Take first 8 bytes of hex (16 chars after 0x) and convert to number
  const hex = hexSeed.replace(/^0x/, "").slice(0, 16);
  // Use BigInt for large numbers, then convert to safe integer range
  const bigNum = BigInt("0x" + hex);
  return Number(bigNum % BigInt(2147483647));
}

// Calculate optimal canvas dimensions based on screen size while maintaining A4 aspect ratio
function getOptimalDimensions() {
  const dpr = window.devicePixelRatio || 1;
  // Use fallback dimensions if window size is 0 (e.g., iframe not yet laid out)
  const screenW = window.innerWidth || REFERENCE_WIDTH;
  const screenH = window.innerHeight || REFERENCE_HEIGHT;

  // Maintain A4 aspect ratio (1:√2, width:height)
  const aspectRatio = 1 / Math.sqrt(2);

  let width, height;
  if (screenW / screenH > aspectRatio) {
    // Screen is wider than A4, fit to height
    height = screenH;
    width = Math.floor(height * aspectRatio);
  } else {
    // Screen is taller than A4, fit to width
    width = screenW;
    height = Math.floor(width / aspectRatio);
  }

  // Ensure minimum dimensions to avoid 0-size canvas errors
  width = Math.max(width, 100);
  height = Math.max(height, 141);

  // Scale up by device pixel ratio for crisp rendering on high-DPI screens
  // This makes art look sharp on retina displays and future high-res screens
  const renderWidth = Math.floor(width * dpr);
  const renderHeight = Math.floor(height * dpr);

  return {
    width, // CSS pixels for display
    height,
    renderWidth, // Physical pixels for rendering
    renderHeight,
    dpr,
  };
}

// Store render state for resize re-rendering
let _onChainState = null;

// Format gap value for display
function formatGap(gap, cellSize) {
  if (gap === 0) return "none";
  const ratio = gap / cellSize;
  if (ratio < 0) return `${Math.round(ratio * 100)}% overlap`;
  return `${Math.round(ratio * 100)}% gap`;
}

// Secret mode state for keyboard-activated features
let _secretShowFoldLines = false;
let _secretAnimating = false;
let _secretAnimationFold = 0;
let _secretAnimationMode = null; // 'full' | 'lines-only'
let _secretAnimationTimer = null;
let _keyboardFeaturesCleanup = null;

/**
 * Set up keyboard features for any canvas/state combination
 * Shift+F: Toggle fold lines and intersection points
 * Shift+A: Animate from 0 to current fold count (full render)
 * Shift+L: Animate from 0 to current fold count (lines only)
 * Escape: Cancel animation
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Function} getState - Function that returns current state {seed, foldCount, params}
 * @param {Object} options - Optional settings
 * @param {Function} options.onRender - Called after each render (optional)
 * @param {Function} options.getDimensions - Function returning {width, height} for render (optional)
 * @returns {Function} Cleanup function to remove event listeners
 */
export function setupKeyboardFeatures(canvas, getState, options = {}) {
  const { onRender, getDimensions } = options;

  // Clean up any previous setup
  if (_keyboardFeaturesCleanup) {
    _keyboardFeaturesCleanup();
  }

  function render(foldOverride, linesOnly, isAnimating) {
    const state = getState();
    if (!state) return;

    const dims = getDimensions ? getDimensions() : {};
    renderWithState(canvas, state, {
      foldOverride,
      linesOnly,
      isAnimating,
      width: dims.width,
      height: dims.height,
    });

    if (onRender) onRender();
  }

  function runAnimation() {
    const state = getState();
    if (!_secretAnimating || !state || _secretAnimationFold > state.foldCount) {
      stopAnimation();
      return;
    }
    const isLinesOnly = _secretAnimationMode === "lines-only";
    render(_secretAnimationFold, isLinesOnly, true);
    _secretAnimationFold++;
    _secretAnimationTimer = setTimeout(runAnimation, 50);
  }

  function startAnimation(mode) {
    _secretAnimating = true;
    _secretAnimationFold = 0;
    _secretAnimationMode = mode;
    runAnimation();
  }

  function stopAnimation() {
    _secretAnimating = false;
    _secretAnimationMode = null;
    if (_secretAnimationTimer) {
      clearTimeout(_secretAnimationTimer);
      _secretAnimationTimer = null;
    }
  }

  function handleKeydown(e) {
    const state = getState();
    if (!state) return;

    // Shift+F: Toggle fold lines overlay
    if (e.shiftKey && e.key === "F") {
      e.preventDefault();
      _secretShowFoldLines = !_secretShowFoldLines;
      if (!_secretAnimating) {
        render();
      }
    }

    // Shift+A: Start full animation
    if (e.shiftKey && e.key === "A") {
      e.preventDefault();
      if (_secretAnimating) {
        stopAnimation();
      }
      startAnimation("full");
    }

    // Shift+L: Start lines-only animation
    if (e.shiftKey && e.key === "L") {
      e.preventDefault();
      if (_secretAnimating) {
        stopAnimation();
      }
      startAnimation("lines-only");
    }

    // Escape: Cancel animation
    if (e.key === "Escape" && _secretAnimating) {
      e.preventDefault();
      stopAnimation();
    }
  }

  document.addEventListener("keydown", handleKeydown);

  // Return cleanup function
  _keyboardFeaturesCleanup = () => {
    document.removeEventListener("keydown", handleKeydown);
    stopAnimation();
    _keyboardFeaturesCleanup = null;
  };

  return _keyboardFeaturesCleanup;
}

/**
 * Extract character data for DOM-based rendering
 * Returns an array of character objects with position, character, color, etc.
 * Used for interactive artwork where characters are rendered as DOM elements
 * @param {Object} state - Render state with seed, foldCount, params
 * @param {number} outputWidth - Target output width
 * @param {number} outputHeight - Target output height
 * @returns {Object} - { characters: Array, background: Object }
 */
export function extractCharacterData(state, outputWidth, outputHeight) {
  const { seed, foldCount, params } = state;
  const {
    palette,
    cells,
    renderMode,
    showEmptyCells,
    multiColor,
    levelColors,
    foldStrategy,
    paperProperties,
  } = params;

  const { cellW: cellWidth, cellH: cellHeight } = cells;
  const { bg: bgColor, text: textColor, accent: accentColor } = palette;

  const scaleX = outputWidth / REFERENCE_WIDTH;
  const scaleY = outputHeight / REFERENCE_HEIGHT;

  const refInnerWidth = REFERENCE_WIDTH - DRAWING_MARGIN * 2;
  const refInnerHeight = REFERENCE_HEIGHT - DRAWING_MARGIN * 2;

  // Calculate grid layout
  const grid = calculateGridWithGaps(
    seed,
    cellWidth,
    cellHeight,
    refInnerWidth,
    refInnerHeight
  );
  const { cols, rows, strideX, strideY, gridOffsetX, gridOffsetY } = grid;
  const refCellWidth = grid.cellWidth;
  const refCellHeight = grid.cellHeight;

  const offsetX = (DRAWING_MARGIN + gridOffsetX) * scaleX;
  const offsetY = (DRAWING_MARGIN + gridOffsetY) * scaleY;
  const actualCellWidth = refCellWidth * scaleX;
  const actualCellHeight = refCellHeight * scaleY;
  const actualStrideX = strideX * scaleX;
  const actualStrideY = strideY * scaleY;

  const weightRange = generateWeightRange(seed);
  const scaledPaperProps = scaleAbsorbencyForGrid(paperProperties, cols, rows);
  const actualGridWidth = grid.actualGridWidth;
  const actualGridHeight = grid.actualGridHeight;

  // Simulate folds
  const { creases, firstFoldTarget, lastFoldTarget } = simulateFolds(
    actualGridWidth,
    actualGridHeight,
    foldCount,
    seed,
    weightRange,
    foldStrategy,
    scaledPaperProps
  );

  const scaledCreases = creases.map((crease) => ({
    ...crease,
    p1: { x: crease.p1.x * scaleX, y: crease.p1.y * scaleY },
    p2: { x: crease.p2.x * scaleX, y: crease.p2.y * scaleY },
  }));

  let firstFoldTargetCell = null;
  if (firstFoldTarget) {
    const targetCol = Math.max(0, Math.min(cols - 1, Math.floor(firstFoldTarget.x / strideX)));
    const targetRow = Math.max(0, Math.min(rows - 1, Math.floor(firstFoldTarget.y / strideY)));
    firstFoldTargetCell = `${targetCol},${targetRow}`;
  }

  let lastFoldTargetCell = null;
  if (lastFoldTarget) {
    const targetCol = Math.max(0, Math.min(cols - 1, Math.floor(lastFoldTarget.x / strideX)));
    const targetRow = Math.max(0, Math.min(rows - 1, Math.floor(lastFoldTarget.y / strideY)));
    lastFoldTargetCell = `${targetCol},${targetRow}`;
  }

  const { cellWeights: intersectionWeight, cellMaxGap } = processCreases(
    scaledCreases,
    cols,
    rows,
    actualStrideX,
    actualStrideY,
    foldCount,
    paperProperties
  );

  // Accent cells
  const accentCells = new Set();
  if (Object.keys(cellMaxGap).length > 0) {
    const maxGap = Math.max(...Object.values(cellMaxGap));
    for (const [key, gap] of Object.entries(cellMaxGap)) {
      if (gap === maxGap) accentCells.add(key);
    }
  }

  // Font sizing
  const glyphHeightRatio = 1 + CHAR_TOP_OVERFLOW + CHAR_BOTTOM_OVERFLOW_DARK;
  const fontSize = actualCellHeight / glyphHeightRatio;
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const shadeChars = [" ", "░", "▒", "▓"];
  const maxShadeLevel = fontSize < 30 ? 2 : 3;

  const thresholds = calculateAdaptiveThresholds(intersectionWeight);

  // Color helper for multi-color/gradient modes
  const getColorForLevel = (level, cellKey) => {
    if (multiColor && levelColors && levelColors[level]) {
      return levelColors[level];
    }
    return textColor;
  };

  const characters = [];

  for (let row = 0; row < rows; row++) {
    const y = offsetY + row * actualStrideY;

    for (let col = 0; col < cols; col++) {
      const x = offsetX + col * actualStrideX;
      const key = `${col},${row}`;
      const weight = intersectionWeight[key] || 0;

      let char = null;
      let color = textColor;
      let level = -1;
      let isEmptyCell = false;

      // Determine character and color based on render mode
      if (firstFoldTargetCell === key) {
        level = weight > 0 ? countToLevelAdaptive(weight, thresholds) : 2;
        char = shadeChars[Math.min(Math.max(level, 2), maxShadeLevel)];
        color = accentColor;
      } else if (renderMode === "normal") {
        level = countToLevelAdaptive(weight, thresholds);
        if (level === 0) {
          // Skip empty cells - background texture provides visual interest
          char = null;
        } else {
          char = shadeChars[Math.min(level, maxShadeLevel)];
        }
        color = getColorForLevel(level, key);
        if (accentCells.has(key) && weight > 0) color = accentColor;
        else if (lastFoldTargetCell === key) color = textColor;
      } else if (renderMode === "binary") {
        if (weight === 0) {
          if (showEmptyCells) {
            char = shadeChars[1];
            isEmptyCell = true;
            color = textColor;
          }
        } else {
          level = maxShadeLevel;
          char = shadeChars[level];
          color = getColorForLevel(level, key);
          if (accentCells.has(key)) color = accentColor;
        }
      } else if (renderMode === "inverted") {
        level = Math.min(3 - countToLevelAdaptive(weight, thresholds), maxShadeLevel);
        char = shadeChars[level];
        color = getColorForLevel(level, key);
        if (accentCells.has(key) && weight > 0) color = accentColor;
      } else if (renderMode === "sparse") {
        level = countToLevelAdaptive(weight, thresholds);
        if (level === 1) {
          char = shadeChars[1];
          color = getColorForLevel(1, key);
          if (accentCells.has(key)) color = accentColor;
        } else {
          // Skip empty cells - background texture provides visual interest
          char = null;
        }
      } else if (renderMode === "dense") {
        level = countToLevelAdaptive(weight, thresholds);
        if (level >= 2) {
          char = shadeChars[Math.min(level, maxShadeLevel)];
          color = getColorForLevel(level, key);
          if (accentCells.has(key)) color = accentColor;
        } else {
          // Skip empty cells - background texture provides visual interest
          char = null;
        }
      }

      if (!char || char === " ") continue;

      // Skip empty cells for interactive layer (they stay on background)
      if (isEmptyCell) continue;

      characters.push({
        id: `char-${row}-${col}`,
        char,
        x,
        y,
        width: actualCellWidth,
        height: actualCellHeight,
        fontSize,
        color,
        row,
        col,
        level,
        isAccent: accentCells.has(key),
        isFoldTarget: firstFoldTargetCell === key || lastFoldTargetCell === key,
      });
    }
  }

  return {
    characters,
    background: {
      color: bgColor,
      textureColor: textColor,
      textureOpacity: 0.1,
    },
    grid: {
      cols,
      rows,
      cellWidth: actualCellWidth,
      cellHeight: actualCellHeight,
      offsetX,
      offsetY,
    },
  };
}

/**
 * Unified render function for both on-chain and preview contexts
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Object} state - Render state with seed, foldCount, params
 * @param {Object} options - Optional overrides
 * @param {number} options.foldOverride - Override fold count (for animation)
 * @param {boolean} options.linesOnly - Lines-only mode
 * @param {boolean} options.isAnimating - Whether currently animating
 * @param {number} options.width - Override output width (default: auto from getOptimalDimensions)
 * @param {number} options.height - Override output height (default: auto from getOptimalDimensions)
 * @param {boolean} options.showOverlays - Override overlay visibility
 */
export function renderWithState(canvas, state, options = {}) {
  const {
    foldOverride,
    linesOnly = false,
    isAnimating = false,
    width,
    height,
    showOverlays: showOverlaysOverride,
  } = options;

  // Use provided dimensions or calculate optimal ones
  // When dimensions are provided, maintain A4 aspect ratio (fit within bounds)
  let dims;
  if (width && height) {
    const targetRatio = REFERENCE_WIDTH / REFERENCE_HEIGHT;
    const givenRatio = width / height;
    let renderWidth, renderHeight;
    if (givenRatio > targetRatio) {
      // Given area is wider than A4 - constrain by height
      renderHeight = height;
      renderWidth = Math.round(height * targetRatio);
    } else {
      // Given area is taller than A4 - constrain by width
      renderWidth = width;
      renderHeight = Math.round(width / targetRatio);
    }
    dims = { renderWidth, renderHeight, width, height };
  } else {
    dims = getOptimalDimensions();
  }

  const actualFolds =
    foldOverride !== undefined ? foldOverride : state.foldCount;

  // During animation: linesOnly mode shows lines, full mode shows clean render
  // When not animating: respect _secretShowFoldLines toggle
  const showOverlays =
    showOverlaysOverride !== undefined
      ? showOverlaysOverride
      : isAnimating
      ? linesOnly
      : linesOnly || _secretShowFoldLines;

  const {
    canvas: srcCanvas,
    dataUrl,
    settings,
  } = renderToCanvas({
    folds: actualFolds,
    seed: state.seed,
    outputWidth: dims.renderWidth,
    outputHeight: dims.renderHeight,
    bgColor: state.params.palette.bg,
    textColor: state.params.palette.text,
    accentColor: state.params.palette.accent,
    cellWidth: state.params.cells.cellW,
    cellHeight: state.params.cells.cellH,
    renderMode: state.params.renderMode,
    showEmptyCells: state.params.showEmptyCells,
    multiColor: state.params.multiColor,
    levelColors: state.params.levelColors,
    foldStrategy: state.params.foldStrategy,
    paperProperties: state.params.paperProperties,
    showCreaseLines: state.params.showCreaseLines,
    analyticsMode: state.params.analyticsMode,
    showCreases: showOverlays,
    showIntersections: showOverlays,
    linesOnlyMode: linesOnly,
  });

  // Draw synchronously from the rendered canvas
  const ctx = canvas.getContext("2d");

  // Use a scale factor for crisp rendering (2x)
  const dpr = 2;

  // Set canvas to full requested size (internal resolution)
  canvas.width = dims.width * dpr;
  canvas.height = dims.height * dpr;
  // CSS size matches requested dimensions
  canvas.style.width = dims.width + "px";
  canvas.style.height = dims.height + "px";

  // Fill canvas with background color (for letterbox areas)
  ctx.fillStyle = state.params.palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Center the A4 content within the canvas
  const offsetX = ((dims.width - dims.renderWidth) / 2) * dpr;
  const offsetY = ((dims.height - dims.renderHeight) / 2) * dpr;

  // Draw the rendered content centered and scaled
  ctx.drawImage(
    srcCanvas,
    offsetX,
    offsetY,
    dims.renderWidth * dpr,
    dims.renderHeight * dpr
  );

  // Trigger scaling callback if defined
  if (
    typeof window !== "undefined" &&
    typeof window.scaleCanvas === "function"
  ) {
    window.scaleCanvas();
  }

  return { dataUrl, settings };
}

// Internal alias for backward compatibility within initOnChain
function renderOnChain(canvas, state, foldOverride, linesOnly, isAnimating) {
  return renderWithState(canvas, state, {
    foldOverride,
    linesOnly,
    isAnimating,
  });
}

// Debounce helper to avoid excessive re-renders during resize
function debounce(fn, ms) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ============ DOM-BASED INTERACTIVE RENDERING ============
// Renders characters as real DOM text elements for drag/edit interactivity

// Interactive state (module-level)
let _interactiveState = {
  charData: null,
  charElements: [],
  textBuffer: [],
  originalPositions: new Map(),
  cursorIndex: -1,
  isEditing: false,
  dragState: null,
  hiddenInput: null,
  container: null,
  bgCanvas: null,
  charLayer: null,
  loading: null,
};

// CSS for interactive mode
const INTERACTIVE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    overflow: hidden;
  }
  .fold-container {
    position: relative;
    width: min(100vw, calc(100vh * 1200 / 1697));
    height: min(100vh, calc(100vw * 1697 / 1200));
  }
  .fold-loading {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: #fff;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Courier New", monospace;
    font-size: 24px;
    color: #000;
  }
  .fold-bg {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
  }
  .fold-chars {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    overflow: hidden;
  }
  .fold-char {
    position: absolute;
    cursor: default;
    user-select: none;
    font-family: "${ONCHAIN_FONT_NAME}", "Courier New", monospace;
    line-height: 1;
    white-space: pre;
  }
  .fold-char:hover { filter: brightness(1.1); }
  .fold-char.dragging {
    cursor: grabbing;
    z-index: 1000;
    filter: brightness(1.2);
  }
  .fold-char.editing::after {
    content: '';
    position: absolute;
    left: 0;
    top: 10%;
    width: 2px;
    height: 80%;
    background: currentColor;
    animation: cursor-blink 1s step-end infinite;
  }
  @keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
`;

// Inject CSS into document
function injectInteractiveCSS() {
  if (document.getElementById("fold-interactive-css")) return;
  const style = document.createElement("style");
  style.id = "fold-interactive-css";
  style.textContent = INTERACTIVE_CSS;
  document.head.appendChild(style);
}

// Create DOM structure for interactive rendering
function createInteractiveDOM() {
  const container = document.createElement("div");
  container.className = "fold-container";
  container.id = "fold-container";
  container.style.cssText = "position:relative;width:min(100vw,calc(100vh*1200/1697));height:min(100vh,calc(100vw*1697/1200))";

  // Create loading screen with centered ▒ character (inline styles for immediate rendering)
  const loading = document.createElement("div");
  loading.className = "fold-loading";
  loading.id = "fold-loading";
  loading.textContent = "▒";
  loading.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:#fff;z-index:100;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;font-size:24px;color:#000";

  const bgCanvas = document.createElement("canvas");
  bgCanvas.className = "fold-bg";
  bgCanvas.id = "fold-bg";

  const charLayer = document.createElement("div");
  charLayer.className = "fold-chars";
  charLayer.id = "fold-chars";

  container.appendChild(loading);
  container.appendChild(bgCanvas);
  container.appendChild(charLayer);
  document.body.appendChild(container);

  _interactiveState.container = container;
  _interactiveState.bgCanvas = bgCanvas;
  _interactiveState.charLayer = charLayer;
  _interactiveState.loading = loading;

  return { container, bgCanvas, charLayer, loading };
}

// Render background texture to canvas
function renderInteractiveBackground(canvas, background, width, height) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 2;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = background.color;
  ctx.fillRect(0, 0, width, height);

  const scaleX = width / REFERENCE_WIDTH;
  const textureFontSize = 15 * scaleX;
  ctx.font = `${textureFontSize}px ${FONT_STACK}`;
  ctx.fillStyle = background.textureColor;
  ctx.globalAlpha = background.textureOpacity;

  const charWidth = textureFontSize * CHAR_WIDTH_RATIO;
  const charHeight = textureFontSize * 1.13;

  for (let y = 0; y < height + charHeight; y += charHeight) {
    for (let x = 0; x < width + charWidth; x += charWidth) {
      ctx.fillText("░", x, y + charHeight);
    }
  }
  ctx.globalAlpha = 1.0;
}

// Render characters as DOM elements
function renderInteractiveCharacters(charLayer, characters) {
  stopInteractiveEditing();
  charLayer.innerHTML = "";
  _interactiveState.charElements = [];
  _interactiveState.originalPositions.clear();
  _interactiveState.textBuffer = [];
  _interactiveState.hiddenInput = null;

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    const el = document.createElement("span");
    el.className = "fold-char";
    el.textContent = c.char;
    el.dataset.index = i;

    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    el.style.fontSize = c.fontSize + "px";
    el.style.color = c.color;
    el.style.width = c.width + "px";
    el.style.height = c.height + "px";

    _interactiveState.originalPositions.set(i, { x: c.x, y: c.y, char: c.char });
    _interactiveState.textBuffer.push({
      char: c.char,
      originalChar: c.char,
      el,
      color: c.color,
    });

    charLayer.appendChild(el);
    _interactiveState.charElements.push(el);
  }

  // Create hidden input for text capture
  const hiddenInput = document.createElement("input");
  hiddenInput.type = "text";
  hiddenInput.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;";
  hiddenInput.addEventListener("input", onInteractiveTextInput);
  hiddenInput.addEventListener("keydown", onInteractiveTextKeyDown);
  hiddenInput.addEventListener("blur", onInteractiveTextBlur);
  charLayer.appendChild(hiddenInput);
  _interactiveState.hiddenInput = hiddenInput;
}

// Sync text buffer to DOM
function syncInteractiveBufferToDOM() {
  for (let i = 0; i < _interactiveState.textBuffer.length; i++) {
    const entry = _interactiveState.textBuffer[i];
    entry.el.textContent = entry.char;
  }
}

// Text input handler
function onInteractiveTextInput(e) {
  const { isEditing, cursorIndex, textBuffer, hiddenInput } = _interactiveState;
  if (!isEditing || cursorIndex < 0) return;

  const typed = e.data;
  if (!typed) return;

  for (let i = 0; i < typed.length; i++) {
    const replaceAt = cursorIndex + i;
    if (replaceAt >= textBuffer.length) break;
    // Update buffer and show character
    textBuffer[replaceAt].char = typed[i];
    textBuffer[replaceAt].el.textContent = typed[i];
  }

  // Move cursor forward (this will clear the new position)
  const newIndex = Math.min(cursorIndex + typed.length, textBuffer.length - 1);
  if (newIndex !== cursorIndex) {
    _interactiveState.cursorIndex = newIndex;
    updateInteractiveCursor();
  }

  hiddenInput.value = "";
}

// Text key handler
function onInteractiveTextKeyDown(e) {
  const { isEditing, cursorIndex, textBuffer } = _interactiveState;
  if (!isEditing) return;

  if (e.key === "Escape") {
    stopInteractiveEditing();
    return;
  }

  // Helper to restore current cell before moving
  const restoreCurrentCell = () => {
    if (cursorIndex >= 0 && cursorIndex < textBuffer.length) {
      const entry = textBuffer[cursorIndex];
      entry.el.textContent = entry.char;
    }
  };

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (cursorIndex > 0) {
      restoreCurrentCell();
      _interactiveState.cursorIndex = cursorIndex - 1;
      updateInteractiveCursor();
    }
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (cursorIndex < textBuffer.length - 1) {
      restoreCurrentCell();
      _interactiveState.cursorIndex = cursorIndex + 1;
      updateInteractiveCursor();
    }
  } else if (e.key === "Backspace") {
    e.preventDefault();
    // Restore original char at current position and move back
    textBuffer[cursorIndex].char = textBuffer[cursorIndex].originalChar;
    textBuffer[cursorIndex].el.textContent = textBuffer[cursorIndex].originalChar;
    if (cursorIndex > 0) {
      _interactiveState.cursorIndex = cursorIndex - 1;
      updateInteractiveCursor();
    }
  } else if (e.key === "Delete") {
    e.preventDefault();
    // Restore original char at current position, stay in place
    textBuffer[cursorIndex].char = textBuffer[cursorIndex].originalChar;
    // Keep cell empty since we're still editing here
  }
}

// Text blur handler
function onInteractiveTextBlur() {
  setTimeout(() => {
    if (_interactiveState.hiddenInput && !_interactiveState.hiddenInput.matches(":focus")) {
      stopInteractiveEditing();
    }
  }, 100);
}

// Update cursor highlight
function updateInteractiveCursor() {
  const { charElements, cursorIndex, hiddenInput, textBuffer } = _interactiveState;
  charElements.forEach((el) => el.classList.remove("editing"));

  if (cursorIndex >= 0 && cursorIndex < charElements.length) {
    // Clear new cursor position and add editing class
    const entry = textBuffer[cursorIndex];
    if (entry) {
      entry.el.textContent = '';
    }
    charElements[cursorIndex].classList.add("editing");
    if (hiddenInput) {
      hiddenInput.style.left = charElements[cursorIndex].style.left;
      hiddenInput.style.top = charElements[cursorIndex].style.top;
    }
  }
}

// Start editing
function startInteractiveEditing(index) {
  _interactiveState.isEditing = true;
  _interactiveState.cursorIndex = index;

  // Clear the character to show empty cell with cursor
  const entry = _interactiveState.textBuffer[index];
  if (entry) {
    entry.el.textContent = '';
  }

  updateInteractiveCursor();
  if (_interactiveState.hiddenInput) {
    _interactiveState.hiddenInput.focus();
  }
}

// Stop editing
function stopInteractiveEditing() {
  // Restore character from buffer if cell is empty
  const { cursorIndex, textBuffer, charElements } = _interactiveState;
  if (cursorIndex >= 0 && cursorIndex < textBuffer.length) {
    const entry = textBuffer[cursorIndex];
    if (entry && entry.el.textContent === '') {
      entry.el.textContent = entry.char;
    }
  }

  _interactiveState.isEditing = false;
  _interactiveState.cursorIndex = -1;
  charElements.forEach((el) => el.classList.remove("editing", "cursor"));
  if (_interactiveState.hiddenInput) {
    _interactiveState.hiddenInput.blur();
  }
}

// Initialize drag handlers
function initInteractiveDragHandlers(charLayer) {
  charLayer.addEventListener("mousedown", onInteractiveMouseDown);
  charLayer.addEventListener("touchstart", onInteractiveTouchStart, { passive: false });
  document.addEventListener("mousemove", onInteractiveMouseMove);
  document.addEventListener("touchmove", onInteractiveTouchMove, { passive: false });
  document.addEventListener("mouseup", onInteractiveMouseUp);
  document.addEventListener("touchend", onInteractiveTouchEnd);
  charLayer.addEventListener("dblclick", onInteractiveDoubleClick);
}

function onInteractiveMouseDown(e) {
  const target = e.target.closest(".fold-char");
  if (!target) return;
  e.preventDefault();
  startInteractiveDrag(target, e.clientX, e.clientY);
}

function onInteractiveTouchStart(e) {
  const target = e.target.closest(".fold-char");
  if (!target) return;
  e.preventDefault();
  const touch = e.touches[0];
  startInteractiveDrag(target, touch.clientX, touch.clientY);
}

function startInteractiveDrag(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const containerRect = _interactiveState.container.getBoundingClientRect();

  _interactiveState.dragState = {
    el,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top,
    containerRect,
  };
  el.classList.add("dragging");
}

function onInteractiveMouseMove(e) {
  if (!_interactiveState.dragState) return;
  moveInteractiveDrag(e.clientX, e.clientY);
}

function onInteractiveTouchMove(e) {
  if (!_interactiveState.dragState) return;
  e.preventDefault();
  const touch = e.touches[0];
  moveInteractiveDrag(touch.clientX, touch.clientY);
}

function moveInteractiveDrag(clientX, clientY) {
  const { el, containerRect, offsetX, offsetY } = _interactiveState.dragState;
  const x = clientX - containerRect.left - offsetX;
  const y = clientY - containerRect.top - offsetY;
  el.style.left = x + "px";
  el.style.top = y + "px";
}

function onInteractiveMouseUp() {
  endInteractiveDrag();
}

function onInteractiveTouchEnd() {
  endInteractiveDrag();
}

function endInteractiveDrag() {
  if (_interactiveState.dragState) {
    _interactiveState.dragState.el.classList.remove("dragging");
    _interactiveState.dragState = null;
  }
}

function onInteractiveDoubleClick(e) {
  const target = e.target.closest(".fold-char");
  if (!target) return;
  e.preventDefault();
  const index = parseInt(target.dataset.index, 10);
  if (!isNaN(index)) {
    startInteractiveEditing(index);
  }
}

// Download PNG of current state
function downloadInteractivePNG(seed) {
  const { charData, charElements, container } = _interactiveState;
  if (!charData || !container) return;

  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const dpr = window.devicePixelRatio || 2;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width * dpr;
  exportCanvas.height = height * dpr;
  const ctx = exportCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = charData.background.color;
  ctx.fillRect(0, 0, width, height);

  // Texture
  const scaleX = width / REFERENCE_WIDTH;
  const textureFontSize = 15 * scaleX;
  ctx.font = `${textureFontSize}px ${FONT_STACK}`;
  ctx.fillStyle = charData.background.textureColor;
  ctx.globalAlpha = charData.background.textureOpacity;
  const texCharWidth = textureFontSize * CHAR_WIDTH_RATIO;
  const texCharHeight = textureFontSize * 1.13;
  for (let y = 0; y < height + texCharHeight; y += texCharHeight) {
    for (let x = 0; x < width + texCharWidth; x += texCharWidth) {
      ctx.fillText("░", x, y + texCharHeight);
    }
  }
  ctx.globalAlpha = 1.0;

  // Characters
  ctx.textBaseline = "top";
  for (const el of charElements) {
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    const fontSize = parseFloat(el.style.fontSize);
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = el.style.color;
    ctx.fillText(el.textContent, x, y);
  }

  exportCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fold-${seed || "edit"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// Reset positions and text
function resetInteractive() {
  stopInteractiveEditing();
  const { charElements, textBuffer, originalPositions } = _interactiveState;
  for (let i = 0; i < charElements.length; i++) {
    const el = charElements[i];
    const original = originalPositions.get(i);
    if (original) {
      el.style.left = original.x + "px";
      el.style.top = original.y + "px";
      if (textBuffer[i]) {
        textBuffer[i].char = original.char;
      }
      el.textContent = original.char;
    }
  }
}

// Initialize keyboard shortcuts for interactive mode
function initInteractiveKeyboardShortcuts(seed) {
  document.addEventListener("keydown", (e) => {
    // Cmd/Ctrl+S - Download PNG
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      downloadInteractivePNG(seed);
      return;
    }

    // Don't trigger while editing
    if (_interactiveState.isEditing) return;

    // Escape - Reset
    if (e.key === "Escape") {
      e.preventDefault();
      resetInteractive();
    }
  });
}

// Main interactive render function
function renderInteractive(state, width, height) {
  const { bgCanvas, charLayer } = _interactiveState;

  const charData = extractCharacterData(state, width, height);
  _interactiveState.charData = charData;

  renderInteractiveBackground(bgCanvas, charData.background, width, height);
  renderInteractiveCharacters(charLayer, charData.characters);
}

// Auto-render if global variables are set (for on-chain use)
export async function initOnChain() {
  // Support both old (SEED/FOLD_COUNT) and new (LESS_SEED/LESS_TOKEN_ID) variable names
  let seed = typeof window !== "undefined" && window.SEED;
  let foldCount = typeof window !== "undefined" && window.FOLD_COUNT;

  // New format from LessRenderer contract
  const lessSeed = typeof window !== "undefined" && window.LESS_SEED;

  // Convert LESS_SEED hex string to numeric seed if present
  if (lessSeed && !seed) {
    seed = hexSeedToNumber(lessSeed);
  }

  // Derive fold count from seed if not provided
  // Use same RNG as generateAllParams to get consistent fold count
  if (seed && foldCount === undefined) {
    const rng = seededRandom(seed + 9999);
    foldCount = Math.floor(1 + rng() * 500);
  }

  // Use embedded font data URI, or allow override via window.FONT_DATA_URI
  const fontDataUri =
    (typeof window !== "undefined" && window.FONT_DATA_URI) ||
    ONCHAIN_FONT_DATA_URI;

  if (seed && foldCount !== undefined) {
    // Load font (embedded or provided)
    await loadOnChainFont(fontDataUri);

    // Inject CSS and create DOM structure for interactive mode
    injectInteractiveCSS();
    createInteractiveDOM();

    // Generate params using reference dimensions (for consistent seed-based generation)
    const params = generateAllParams(
      seed,
      REFERENCE_WIDTH,
      REFERENCE_HEIGHT,
      0,
      foldCount
    );

    // Store state for resize re-rendering
    _onChainState = { seed, foldCount, params };

    // Get container dimensions
    const container = _interactiveState.container;
    const rect = container.getBoundingClientRect();

    // Initial render
    renderInteractive(_onChainState, rect.width, rect.height);

    // Hide loading screen after render completes
    if (_interactiveState.loading) {
      _interactiveState.loading.style.display = "none";
    }

    // Initialize drag handlers
    initInteractiveDragHandlers(_interactiveState.charLayer);

    // Initialize keyboard shortcuts (Cmd+S for PNG, Escape for reset)
    initInteractiveKeyboardShortcuts(seed);

    // Signal render complete (for image-api and other headless renderers)
    if (typeof window !== "undefined") {
      window.RENDER_COMPLETE = true;
    }

    // Re-render on window resize (debounced to avoid excessive renders)
    window.addEventListener(
      "resize",
      debounce(() => {
        if (_onChainState) {
          const rect = _interactiveState.container.getBoundingClientRect();
          renderInteractive(_onChainState, rect.width, rect.height);
        }
      }, 150)
    );
  }
}

/**
 * Render interactive artwork to a container element
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} state - State object with seed, foldCount, params
 * @param {Object} options - Optional settings
 * @returns {Function} Cleanup function to call on unmount
 */
export function renderInteractiveToContainer(container, state, options = {}) {
  const { width, height } = options;

  // Inject CSS if not already done
  injectInteractiveCSS();

  // Clear container
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.overflow = "hidden";

  // Create structure
  const bgCanvas = document.createElement("canvas");
  bgCanvas.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
  container.appendChild(bgCanvas);

  const charLayer = document.createElement("div");
  charLayer.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;";
  container.appendChild(charLayer);

  // Get dimensions
  const rect = container.getBoundingClientRect();
  const renderWidth = width || rect.width;
  const renderHeight = height || rect.height;

  bgCanvas.width = renderWidth;
  bgCanvas.height = renderHeight;

  // Create a local state object for this instance
  const localState = {
    container,
    bgCanvas,
    charLayer,
    charElements: [],
    textBuffer: [],
    originalPositions: new Map(),
    hiddenInput: null,
    isEditing: false,
    cursorIndex: -1,
    charData: null,
  };

  // Extract and render
  const charData = extractCharacterData(state, renderWidth, renderHeight);
  localState.charData = charData;

  // Render background
  renderInteractiveBackground(bgCanvas, charData.background, renderWidth, renderHeight);

  // Render characters
  charData.characters.forEach((char, index) => {
    const el = document.createElement("div");
    el.className = "fold-char";
    el.textContent = char.char;
    el.dataset.index = index;
    el.style.cssText = `
      position: absolute;
      left: ${char.x}px;
      top: ${char.y}px;
      width: ${char.width}px;
      height: ${char.height}px;
      font-size: ${char.fontSize}px;
      color: ${char.color};
      font-family: ${FONT_STACK};
      line-height: 1;
      white-space: pre;
      cursor: default;
      user-select: none;
    `;
    charLayer.appendChild(el);
    localState.charElements.push(el);
    localState.textBuffer.push({
      el,
      char: char.char,
      originalChar: char.char,
      row: char.row,
      col: char.col,
    });
    localState.originalPositions.set(el, {
      left: char.x,
      top: char.y,
      char: char.char,
    });
  });

  // Create hidden input for text editing
  const hiddenInput = document.createElement("input");
  hiddenInput.style.cssText = "position:absolute;left:-9999px;opacity:0;";
  document.body.appendChild(hiddenInput);
  localState.hiddenInput = hiddenInput;

  // Drag state
  const dragState = {
    isDragging: false,
    target: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  // Helper functions
  const restoreCurrentCell = () => {
    if (localState.cursorIndex >= 0 && localState.cursorIndex < localState.textBuffer.length) {
      const entry = localState.textBuffer[localState.cursorIndex];
      entry.el.textContent = entry.char;
      entry.el.classList.remove("editing");
    }
  };

  const updateCursorHighlight = () => {
    localState.charElements.forEach((el) => el.classList.remove("editing"));
    if (localState.cursorIndex >= 0 && localState.cursorIndex < localState.charElements.length) {
      const entry = localState.textBuffer[localState.cursorIndex];
      if (entry) entry.el.textContent = "";
      localState.charElements[localState.cursorIndex].classList.add("editing");
    }
  };

  const startEditing = (index) => {
    localState.isEditing = true;
    localState.cursorIndex = index;
    const entry = localState.textBuffer[index];
    if (entry) entry.el.textContent = "";
    updateCursorHighlight();
    hiddenInput.focus();
  };

  const stopEditing = () => {
    if (localState.cursorIndex >= 0 && localState.cursorIndex < localState.textBuffer.length) {
      const entry = localState.textBuffer[localState.cursorIndex];
      if (entry && entry.el.textContent === "") {
        entry.el.textContent = entry.char;
      }
      entry.el.classList.remove("editing");
    }
    localState.isEditing = false;
    localState.cursorIndex = -1;
    hiddenInput.blur();
  };

  // Event handlers
  const onMouseDown = (e) => {
    const target = e.target.closest(".fold-char");
    if (!target || localState.isEditing) return;
    dragState.isDragging = true;
    dragState.target = target;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.offsetX = target.offsetLeft;
    dragState.offsetY = target.offsetTop;
    target.style.zIndex = "1000";
    target.style.filter = "brightness(1.2)";
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragState.isDragging || !dragState.target) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.target.style.left = dragState.offsetX + dx + "px";
    dragState.target.style.top = dragState.offsetY + dy + "px";
  };

  const onMouseUp = () => {
    if (dragState.target) {
      dragState.target.style.zIndex = "";
      dragState.target.style.filter = "";
    }
    dragState.isDragging = false;
    dragState.target = null;
  };

  const onDblClick = (e) => {
    const target = e.target.closest(".fold-char");
    if (!target) return;
    const index = parseInt(target.dataset.index, 10);
    if (!isNaN(index)) startEditing(index);
  };

  const onTextInput = (e) => {
    if (!localState.isEditing || localState.cursorIndex < 0) return;
    const typed = e.data;
    if (!typed) return;
    for (let i = 0; i < typed.length; i++) {
      const replaceAt = localState.cursorIndex + i;
      if (replaceAt >= localState.textBuffer.length) break;
      localState.textBuffer[replaceAt].char = typed[i];
      localState.textBuffer[replaceAt].el.textContent = typed[i];
    }
    const newIndex = Math.min(
      localState.cursorIndex + typed.length,
      localState.textBuffer.length - 1
    );
    if (newIndex !== localState.cursorIndex) {
      localState.cursorIndex = newIndex;
      updateCursorHighlight();
    }
    hiddenInput.value = "";
  };

  const onKeyDown = (e) => {
    if (!localState.isEditing) return;
    if (e.key === "Escape") {
      stopEditing();
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && localState.cursorIndex > 0) {
      e.preventDefault();
      restoreCurrentCell();
      localState.cursorIndex--;
      updateCursorHighlight();
    } else if (e.key === "ArrowRight" && localState.cursorIndex < localState.textBuffer.length - 1) {
      e.preventDefault();
      restoreCurrentCell();
      localState.cursorIndex++;
      updateCursorHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const current = localState.textBuffer[localState.cursorIndex];
      if (current) {
        const above = localState.textBuffer.findIndex(
          (c) => c.row === current.row - 1 && c.col === current.col
        );
        if (above >= 0) {
          restoreCurrentCell();
          localState.cursorIndex = above;
          updateCursorHighlight();
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const current = localState.textBuffer[localState.cursorIndex];
      if (current) {
        const below = localState.textBuffer.findIndex(
          (c) => c.row === current.row + 1 && c.col === current.col
        );
        if (below >= 0) {
          restoreCurrentCell();
          localState.cursorIndex = below;
          updateCursorHighlight();
        }
      }
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const entry = localState.textBuffer[localState.cursorIndex];
      entry.char = entry.originalChar;
      entry.el.textContent = entry.originalChar;
      if (localState.cursorIndex > 0) {
        localState.cursorIndex--;
        updateCursorHighlight();
      }
    } else if (e.key === "Delete") {
      e.preventDefault();
      const entry = localState.textBuffer[localState.cursorIndex];
      entry.char = entry.originalChar;
    }
  };

  const onBlur = () => {
    setTimeout(() => {
      if (!hiddenInput.matches(":focus")) stopEditing();
    }, 100);
  };

  // Attach listeners
  charLayer.addEventListener("mousedown", onMouseDown);
  charLayer.addEventListener("dblclick", onDblClick);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  hiddenInput.addEventListener("input", onTextInput);
  hiddenInput.addEventListener("keydown", onKeyDown);
  hiddenInput.addEventListener("blur", onBlur);

  // Cleanup function
  return () => {
    charLayer.removeEventListener("mousedown", onMouseDown);
    charLayer.removeEventListener("dblclick", onDblClick);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    hiddenInput.removeEventListener("input", onTextInput);
    hiddenInput.removeEventListener("keydown", onKeyDown);
    hiddenInput.removeEventListener("blur", onBlur);
    hiddenInput.remove();
    container.innerHTML = "";
  };
}

// Auto-init when DOM is ready (for on-chain use)
if (
  typeof window !== "undefined" &&
  (window.SEED || window.FOLD_COUNT !== undefined || window.LESS_SEED)
) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initOnChain());
  } else {
    initOnChain();
  }
}
