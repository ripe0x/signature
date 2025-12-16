// ============ FOLD CORE ============
// Pure rendering logic for on-chain generative art
// This module has no React dependencies and can be used standalone

// ============ GLOBAL CONSTANTS ============

export const CELL_MIN = 20;
export const CELL_MAX = 600;
export const CELL_ASPECT_MAX = 3;
export const DRAWING_MARGIN = 50;
export const REFERENCE_WIDTH = 1200;
export const REFERENCE_HEIGHT = 1500;

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

// The 13 CGA colors - brown and grays removed
export const CGA_PALETTE = [
  // Darks (valid grounds) - luminance < 30
  { hex: "#000000", name: "black", luminance: 0, temperature: "neutral", r: 0, g: 0, b: 0 },
  { hex: "#0000AA", name: "blue", luminance: 10, temperature: "cool", r: 0, g: 0, b: 170 },
  { hex: "#AA0000", name: "red", luminance: 20, temperature: "warm", r: 170, g: 0, b: 0 },
  { hex: "#AA00AA", name: "magenta", luminance: 25, temperature: "warm", r: 170, g: 0, b: 170 },

  // Lights (valid grounds) - luminance > 70
  { hex: "#FFFFFF", name: "white", luminance: 100, temperature: "neutral", r: 255, g: 255, b: 255 },
  { hex: "#FFFF55", name: "yellow", luminance: 93, temperature: "warm", r: 255, g: 255, b: 85 },
  { hex: "#55FFFF", name: "lightCyan", luminance: 85, temperature: "cool", r: 85, g: 255, b: 255 },
  { hex: "#55FF55", name: "lightGreen", luminance: 77, temperature: "cool", r: 85, g: 255, b: 85 },

  // Mids (marks only, never grounds) - luminance 30-70
  { hex: "#00AA00", name: "green", luminance: 30, temperature: "cool", r: 0, g: 170, b: 0 },
  { hex: "#00AAAA", name: "cyan", luminance: 40, temperature: "cool", r: 0, g: 170, b: 170 },
  { hex: "#5555FF", name: "lightBlue", luminance: 45, temperature: "cool", r: 85, g: 85, b: 255 },
  { hex: "#FF5555", name: "lightRed", luminance: 45, temperature: "warm", r: 255, g: 85, b: 85 },
  { hex: "#FF55FF", name: "lightMagenta", luminance: 60, temperature: "warm", r: 255, g: 85, b: 255 },
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
  black: 0.20,      // strongest ground, increase
  white: 0.15,      // rare but powerful, increase
  blue: 0.15,       // classic CGA
  red: 0.15,        // classic CGA
  magenta: 0.10,    // decrease - was overrepresented
  yellow: 0.10,     // complement anchor
  lightCyan: 0.08,  // light grounds are rarer
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
const CHROMATIC_POOL = CGA_PALETTE.filter(
  (c) => c.temperature !== "neutral"
);

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

export function pickBiased(rng, arr, bias) {
  const idx = Math.floor(rng() * arr.length);
  if (bias === "start") {
    return arr[Math.floor(idx * rng())];
  } else if (bias === "end") {
    return arr[arr.length - 1 - Math.floor((arr.length - 1 - idx) * rng())];
  }
  return arr[idx];
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
    groundColor = rng() < 0.75
      ? CGA_PALETTE.find((c) => c.name === "black")
      : CGA_PALETTE.find((c) => c.name === "white");
  } else {
    // Mid color → either works
    groundColor = rng() < 0.6
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
  if (contrastRoll < 0.40) {
    contrastType = "value";
  } else if (contrastRoll < 0.68) {
    contrastType = "temperature";
  } else if (contrastRoll < 0.90) {
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

  if (Math.abs(ground.luminance - mark.luminance) < 25) {
    // Contrast failure - force black/white fallback
    return {
      bg: ground.luminance < 50 ? "#000000" : "#FFFFFF",
      text: ground.luminance < 50 ? "#FFFFFF" : "#000000",
      accent: "#FFFF55",
      strategy: "fallback",
      colorCount: 3,
    };
  }

  return {
    bg: ground.hex,
    text: mark.hex,
    accent: accent.hex,
    strategy: contrastType,
    colorCount: accent.hex === mark.hex ? 2 : 3,
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

  // normal 35%, binary 5%, inverted 25%, sparse 17.5%, dense 17.5%
  if (roll < 0.35) return "normal";
  if (roll < 0.4) return "binary";
  if (roll < 0.65) return "inverted";
  if (roll < 0.825) return "sparse";
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

// ============ PAPER PROPERTIES ============
// These properties control how folds register on the paper,
// breaking the 1:1 relationship between fold count and visual density.

export function generatePaperProperties(seed) {
  const rng = seededRandom(seed + 5555);

  // Absorbency: probability a crease "takes" and leaves a visible mark
  // Low = resistant paper (few marks), High = soft paper (most folds show)
  // Range: 0.1 to 0.9
  const absorbency = 0.1 + rng() * 0.8;

  // Intersection threshold: minimum combined weight for an intersection to register
  // Low = everything shows, High = only strong crossings appear
  // Range: 0.0 to 0.5
  // DISABLED for now - always 0
  const intersectionThreshold = 0; // rng() * 0.5;

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

// Scale absorbency based on grid density
// Small cells = many cells = sparse intersections per cell, so increase absorbency
// Large cells = few cells = dense intersections per cell, so keep absorbency as-is or lower
const REFERENCE_CELL_COUNT = 2500; // Tuned for typical large-cell outputs

export function scaleAbsorbencyForGrid(paperProps, cols, rows) {
  // Scaling disabled for now - return unmodified props
  return paperProps;

  // Original scaling logic (disabled):
  // if (!paperProps) return paperProps;
  // const cellCount = cols * rows;
  // const cellScaleFactor = Math.sqrt(cellCount / REFERENCE_CELL_COUNT);
  // const scaledAbsorbency = Math.min(0.95, paperProps.absorbency * cellScaleFactor);
  // return { ...paperProps, absorbency: scaledAbsorbency };
}

// ============ GAP CALCULATION ============

const ALLOWED_GAP_RATIOS = [
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
  const useGaps = gapRng() < 0.4;

  let useColGaps = false;
  let useRowGaps = false;

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
  }

  const getWeightedGapRatios = () => {
    const ratios = ALLOWED_GAP_RATIOS.slice(0, 7); // Always include up to 1x
    if (gapRng() < 0.25) {
      ratios.push(ALLOWED_GAP_RATIOS[7]); // 2x - rare
    }
    return ratios;
  };

  let refCellWidth = cellWidth;
  let refCellHeight = cellHeight;

  // Calculate best column configuration
  let bestCols = 1;
  let bestColGap = 0;
  let bestColFit = Infinity;

  const colGapRatios = useColGaps ? getWeightedGapRatios() : [0];

  for (const gapRatio of colGapRatios) {
    const gap = refCellWidth * gapRatio;
    const stride = refCellWidth + gap;
    const cols = Math.max(1, Math.floor((innerWidth + gap) / stride));

    if (cols === 1) {
      const cellW = Math.min(refCellWidth, innerWidth);
      const fit = Math.abs(innerWidth - cellW);
      if (fit < bestColFit) {
        bestColFit = fit;
        bestCols = 1;
        bestColGap = 0;
        refCellWidth = cellW;
      }
    } else {
      const actualWidth = cols * refCellWidth + (cols - 1) * gap;
      if (actualWidth <= innerWidth) {
        const fit = Math.abs(innerWidth - actualWidth);
        if (fit < bestColFit) {
          bestColFit = fit;
          bestCols = cols;
          bestColGap = gap;
        }
      }
    }
  }

  if (bestCols === 1 && refCellWidth < innerWidth) {
    refCellWidth = innerWidth;
    bestColGap = 0;
  }

  // Calculate best row configuration
  let bestRows = 1;
  let bestRowGap = 0;
  let bestRowFit = Infinity;

  const rowGapRatios = useRowGaps ? getWeightedGapRatios() : [0];

  for (const gapRatio of rowGapRatios) {
    const gap = refCellHeight * gapRatio;
    const stride = refCellHeight + gap;
    const rows = Math.max(1, Math.floor((innerHeight + gap) / stride));

    if (rows === 1) {
      const cellH = Math.min(refCellHeight, innerHeight);
      const fit = Math.abs(innerHeight - cellH);
      if (fit < bestRowFit) {
        bestRowFit = fit;
        bestRows = 1;
        bestRowGap = 0;
        refCellHeight = cellH;
      }
    } else {
      const actualHeight = rows * refCellHeight + (rows - 1) * gap;
      if (actualHeight <= innerHeight) {
        const fit = Math.abs(innerHeight - actualHeight);
        if (fit < bestRowFit) {
          bestRowFit = fit;
          bestRows = rows;
          bestRowGap = gap;
        }
      }
    }
  }

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

export function normalizePolygon(
  polygon,
  targetWidth,
  targetHeight,
  padding = 0
) {
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

// Check if two edges are opposite
function areOppositeEdges(e1, e2) {
  return Math.abs(e1 - e2) === 2;
}

// Check if two edges are adjacent
function areAdjacentEdges(e1, e2) {
  return Math.abs(e1 - e2) === 1 || Math.abs(e1 - e2) === 3;
}

// Pick anchor point for a crease
function pickAnchor(foldIndex, existingCreases, intersections, w, h, rng) {
  // Early folds: strongly prefer canvas edges
  // Later folds: increasingly prefer existing creases/intersections
  const edgeProbability = Math.max(0.2, 1.0 - foldIndex * 0.015);

  const useEdge =
    rng() < edgeProbability ||
    (existingCreases.length === 0 && intersections.length === 0);

  if (useEdge) {
    // Pick from canvas boundary (edges or corners)
    const useCorner = rng() < 0.15; // 15% chance of corner

    if (useCorner) {
      const corner = Math.floor(rng() * 4);
      return {
        point: getCornerPoint(corner, w, h),
        type: "corner",
        corner,
      };
    } else {
      const edge = Math.floor(rng() * 4);
      // Avoid extreme edges (keep t between 0.05 and 0.95)
      const t = 0.05 + rng() * 0.9;
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
      const edge = Math.floor(rng() * 4);
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
  relationshipBias
) {
  const minCreaseLength = Math.min(w, h) * 0.15; // Minimum crease length

  // Determine valid terminus options based on anchor type
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
      mainRng
    );
    const terminus = pickTerminus(
      anchor,
      f,
      creases,
      knownIntersections,
      width,
      height,
      mainRng,
      relationshipBias
    );

    // Create the crease line
    const p1 = anchor.point;
    const p2 = terminus.point;

    // Skip if too short
    if (V.dist(p1, p2) < Math.min(width, height) * 0.1) {
      continue;
    }

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
}) {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "fold-core.js:2378",
      message: "renderToCanvas entry",
      data: {
        outputWidth,
        outputHeight,
        padding,
        DRAWING_MARGIN,
        REFERENCE_WIDTH,
        REFERENCE_HEIGHT,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "A,B,C",
    }),
  }).catch(() => {});
  // #endregion
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
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "fold-core.js:2420",
      message: "inner dimensions calculated",
      data: { refInnerWidth, refInnerHeight, scaleX, scaleY },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "A,B",
    }),
  }).catch(() => {});
  // #endregion

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
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "fold-core.js:2434",
      message: "drawing dimensions calculated",
      data: {
        drawWidth,
        drawHeight,
        offsetX,
        offsetY,
        cols,
        rows,
        gridOffsetX,
        gridOffsetY,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "C,D,E",
    }),
  }).catch(() => {});
  // #endregion

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
  const sizeCategory =
    fontSize > 350 ? "large" : fontSize > 100 ? "medium" : "small";
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";

  const shadeChars = [" ", "░", "▒", "▓"];

  // Use measured glyph metrics instead of unreliable measureText
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const charTopOverflow = fontSize * CHAR_TOP_OVERFLOW;
  const charBottomOverflowDark = fontSize * CHAR_BOTTOM_OVERFLOW_DARK;
  const charBottomOverflowOther = fontSize * CHAR_BOTTOM_OVERFLOW_OTHER;
  const charLightLeftOffset = fontSize * CHAR_LIGHT_LEFT_OFFSET;

  // For compatibility with existing code that uses charMetrics
  const charMetrics = {
    " ": { width: charWidth },
    "░": {
      width: charWidth,
      leftOffset: charLightLeftOffset,
      bottomOverflow: charBottomOverflowOther,
    },
    "▒": { width: charWidth, bottomOverflow: charBottomOverflowOther },
    "▓": { width: charWidth, bottomOverflow: charBottomOverflowDark },
  };

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

  // Determine draw direction (left-to-right or right-to-left)
  const drawDirectionRng = seededRandom(seed + 33333);
  const drawRightToLeft = drawDirectionRng() < 0.3; // 30% chance of right-to-left

  // Determine overlap pattern based on seed
  // 50% no overlap, then for overlaps: 75%/95% are 20% total, rest split remaining 30%
  const overlapRng = seededRandom(seed + 11111);
  const hasOverlap = overlapRng() >= 0.5; // 50% chance of any overlap

  // Overlap factors and their weights when overlap is enabled
  // [factor, cumulative probability]: 1.0=none, 0.95=5%, 0.75=25%, 0.5=50%, 0.25=75%, 0.05=95%
  const getBaseOverlapFactor = () => {
    if (!hasOverlap) return 1.0;
    const roll = overlapRng();
    // 10% each for 5%, 25%, 50% overlap (30% total) -> 60% of the 50% overlap chance
    // 10% each for 75%, 95% overlap (20% total) -> 40% of the 50% overlap chance
    if (roll < 0.2) return 0.95; // 5% overlap
    if (roll < 0.4) return 0.75; // 25% overlap
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

  // Function to get overlap factor for a cell based on pattern
  const getOverlapFactor = (row, col) => {
    if (!hasOverlap) return 1.0;
    let idx = baseOverlapIndex === -1 ? 0 : baseOverlapIndex;
    switch (overlapPatternType) {
      case 1: // row-based bands
        idx =
          (idx + Math.floor(row / 2) * overlapVariation) %
          overlapIntervals.length;
        break;
      case 2: // col-based bands
        idx =
          (idx + Math.floor(col / 2) * overlapVariation) %
          overlapIntervals.length;
        break;
      case 3: // checkerboard
        idx =
          (idx + ((row + col) % 2) * overlapVariation) %
          overlapIntervals.length;
        break;
      case 4: // diagonal stripes
        idx =
          (idx + Math.floor((row + col) / 2) * overlapVariation) %
          overlapIntervals.length;
        break;
      default: // uniform
        break;
    }
    return overlapIntervals[idx];
  };

  const getColorForLevel = (level, cellKey) => {
    if (multiColor && levelColors) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  // Shadow/offset effect - rare (10% chance)
  const shadowRng = seededRandom(seed + 22222);
  const hasShadowEffect = shadowRng() < 0.1;
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
  // Derive shadow color: use accent if available, otherwise shift hue from text color
  // Ensure shadow is always brighter than text
  const getShadowColor = () => {
    const textHsl = hexToHsl(textColor);
    let shadowHsl;

    if (accentColor && accentColor !== textColor) {
      shadowHsl = hexToHsl(accentColor);
    } else {
      // Generate accent from text color by shifting hue
      shadowHsl = {
        h: (textHsl.h + 180) % 360,
        s: Math.min(100, textHsl.s + 20),
        l: textHsl.l,
      };
    }

    // Ensure shadow is brighter than text
    if (shadowHsl.l <= textHsl.l) {
      shadowHsl.l = Math.min(95, textHsl.l + 25);
    }

    return hslToHex(shadowHsl.h, shadowHsl.s, shadowHsl.l);
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

  // showHitCounts mode: draw numeric weight values instead of shade characters
  if (showHitCounts) {
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

        if (weight > 0) {
          ctx.fillText(Math.round(weight).toString(), x, y);
        }
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
          char = shadeChars[Math.max(level, 2)];
          color = accentColor;
        } else if (renderMode === "normal") {
          level = countToLevelAdaptive(weight, thresholds);
          char = shadeChars[level];
          if (level === 0) {
            char = shadeChars[1];
            isEmptyCell = true;
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
            char = shadeChars[0];
            level = 0;
            color = getColorForLevel(0, key);
          } else {
            char = shadeChars[3];
            level = 3;
            color = getColorForLevel(3, key);
            if (accentCells.has(key)) color = accentColor;
          }
        } else if (renderMode === "inverted") {
          level = 3 - countToLevelAdaptive(weight, thresholds);
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
          }
        } else if (renderMode === "dense") {
          level = countToLevelAdaptive(weight, thresholds);
          if (level >= 2) {
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
            } else if (accentCells.has(key)) {
              color = accentColor;
            }
          } else if (weight === 0) {
            char = shadeChars[0];
            level = 0;
            color = getColorForLevel(0, key);
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
          // #region agent log
          if (col === cols - 1) {
            fetch(
              "http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  location: "fold-core.js:2923",
                  message: "last column cell boundary",
                  data: {
                    col,
                    row,
                    x,
                    actualCellWidth,
                    cellEndX,
                    drawAreaRight,
                    outputWidth,
                    offsetX,
                    actualStrideX,
                  },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "run2",
                  hypothesisId: "F",
                }),
              }
            ).catch(() => {});
          }
          // #endregion

          // Use cell boundary, capped at margin
          const effectiveCellEndX = Math.min(cellEndX, drawAreaRight);
          const effectiveCellWidth = effectiveCellEndX - x;

          // Skip cells that are too narrow to meaningfully show a character
          // (less than 50% of char width would just create visual noise)
          if (effectiveCellWidth < charWidth * 0.5) continue;

          // Get pattern-based overlap factor for this cell
          const cellOverlapFactor = getOverlapFactor(row, col);

          // Calculate step based on overlap factor (1.0 = no overlap, 0.5 = 50% overlap)
          const effectiveStep = charWidth * cellOverlapFactor;

          // Calculate how many chars fit with this step
          const charsWithStep = Math.max(1, Math.floor((effectiveCellWidth - charWidth) / effectiveStep) + 1);

          // Check if we need one more char to fill remaining gap
          const coveredWidth = (charsWithStep - 1) * effectiveStep + charWidth;
          const remainingGap = effectiveCellWidth - coveredWidth;
          const gapRatio = remainingGap / charWidth;

          // Add extra char if gap > 30% of char width
          const numCharsInCell = (gapRatio > 0.3)
            ? charsWithStep + 1
            : charsWithStep;

          // Calculate actual step to fill cell exactly
          const step = numCharsInCell <= 1
            ? charWidth
            : (effectiveCellWidth - charWidth) / (numCharsInCell - 1);

          // Calculate max overflow distance based on cellOverflowAmount
          const overflowDistance = cellOverflowAmount * actualCellWidth;

          // Calculate overflow chars based on direction
          // Base cell is always filled; overflow extends in the specified direction
          let overflowChars = 0;
          if (overflowDistance > 0) {
            overflowChars = Math.ceil(overflowDistance / step);
          }
          const maxChars = numCharsInCell + overflowChars;

          for (let i = 0; i < maxChars && level >= 0; i++) {
            let nextChar = char;
            if (level >= 2 && i > 0 && i % 2 === 0) {
              nextChar = shadeChars[Math.max(0, level - 1)];
            }

            // Calculate draw position
            // Base chars (i < numCharsInCell) fill the cell left-to-right
            // Overflow chars extend in the specified direction
            let drawX;
            if (i < numCharsInCell) {
              // Base cell: always fill from left edge
              drawX = x + i * step;
            } else if (drawRightToLeft) {
              // Overflow extends LEFT from cell start
              const overflowIndex = i - numCharsInCell;
              drawX = x - (overflowIndex + 1) * step;
              if (drawX < drawAreaLeft) break;
            } else {
              // Overflow extends RIGHT from cell end
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

  // Draw intersection points
  if (
    showIntersections &&
    activeIntersections &&
    activeIntersections.length > 0
  ) {
    ctx.strokeStyle = "#ff0000";
    ctx.fillStyle = "rgba(255, 0, 0, 0)";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 1;
    const radius = 3;
    for (const intersection of activeIntersections) {
      ctx.beginPath();
      ctx.arc(
        offsetX + intersection.x,
        offsetY + intersection.y,
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
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
  const paperProperties = generatePaperProperties(seed);
  const showCreaseLines = generateRareCreaseLines(seed);
  const overlapInfo = generateOverlapInfo(seed);

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
    paperProperties,
    showCreaseLines,
    overlapInfo,
    folds: foldCount,
  };
}

// ============ METADATA GENERATION ============

export function generateMetadata(tokenId, seed, foldCount, imageBaseUrl = "") {
  const params = generateAllParams(seed, 1200, 1500, 0, foldCount);

  // Calculate crease count by running simulation (with paper properties)
  const weightRange = generateWeightRange(seed);
  const refDrawWidth = REFERENCE_WIDTH - DRAWING_MARGIN * 2;
  const refDrawHeight = REFERENCE_HEIGHT - DRAWING_MARGIN * 2;
  const { creases } = simulateFolds(
    refDrawWidth,
    refDrawHeight,
    foldCount,
    seed,
    weightRange,
    params.foldStrategy,
    params.paperProperties
  );

  // Get paper description for traits
  const paperDesc = getPaperDescription(params.paperProperties);

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
      { trait_type: "Crease Count", value: creases.length },
      { trait_type: "Palette Strategy", value: params.palette.strategy },
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

  // Wait for font to load
  try {
    await document.fonts.load(`12px ${ONCHAIN_FONT_NAME}`);
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

// Calculate optimal canvas dimensions based on screen size while maintaining 4:5 aspect ratio
function getOptimalDimensions() {
  const dpr = window.devicePixelRatio || 1;
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Maintain 4:5 aspect ratio (width:height)
  const aspectRatio = 4 / 5;

  let width, height;
  if (screenW / screenH > aspectRatio) {
    // Screen is wider than 4:5, fit to height
    height = screenH;
    width = Math.floor(height * aspectRatio);
  } else {
    // Screen is taller than 4:5, fit to width
    width = screenW;
    height = Math.floor(width / aspectRatio);
  }

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

// Render function that can be called on init and resize
function renderOnChain(canvas, state) {
  const dims = getOptimalDimensions();

  const dataUrl = renderToCanvas({
    folds: state.foldCount,
    seed: state.seed,
    outputWidth: dims.renderWidth,
    outputHeight: dims.renderHeight,
    bgColor: state.params.palette.bg,
    textColor: state.params.palette.text,
    accentColor: state.params.palette.accent,
    cellWidth: state.params.cells.cellW,
    cellHeight: state.params.cells.cellH,
    renderMode: state.params.renderMode,
    multiColor: state.params.multiColor,
    levelColors: state.params.levelColors,
    foldStrategy: state.params.foldStrategy,
    paperProperties: state.params.paperProperties,
    showCreaseLines: state.params.showCreaseLines,
  });

  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    // Set canvas internal resolution (includes internal 2x from renderToCanvas)
    canvas.width = dims.renderWidth * 2;
    canvas.height = dims.renderHeight * 2;
    // Set CSS size to fit screen
    canvas.style.width = dims.width + "px";
    canvas.style.height = dims.height + "px";
    // Draw at full resolution
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Trigger scaling callback if defined
    if (typeof window.scaleCanvas === "function") {
      window.scaleCanvas();
    }
  };
  img.src = dataUrl;
}

// Debounce helper to avoid excessive re-renders during resize
function debounce(fn, ms) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
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
    // Find or create canvas element
    let canvas =
      document.getElementById("c") || document.querySelector("canvas");

    if (!canvas) {
      // Create canvas if it doesn't exist
      canvas = document.createElement("canvas");
      canvas.id = "c";
      document.body.appendChild(canvas);
      // Style body for full-screen canvas
      document.body.style.cssText =
        "margin:0;padding:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;";
    }

    // Load font (embedded or provided)
    await loadOnChainFont(fontDataUri);

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

    // Initial render
    renderOnChain(canvas, _onChainState);

    // Re-render on window resize (debounced to avoid excessive renders)
    window.addEventListener(
      "resize",
      debounce(() => {
        if (_onChainState) {
          renderOnChain(canvas, _onChainState);
        }
      }, 150)
    );
  }
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
