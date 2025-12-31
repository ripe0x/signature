/**
 * renderToHTML - Generates HTML output matching canvas rendering
 *
 * This is a direct port of renderToCanvas that outputs HTML instead.
 */

import {
  FONT_STACK,
  ONCHAIN_FONT_NAME,
  ONCHAIN_FONT_DATA_URI,
  calculateGridWithGaps,
  calculateAdaptiveThresholds,
  countToLevelAdaptive,
  generateWeightRange,
  generateOverlapParams,
  simulateFolds,
  processCreases,
  scaleAbsorbencyForGrid,
  seededRandom,
  hexToHsl,
  hslToHex,
} from './fold-core.js';

// Constants matching fold-core.js exactly
const CHAR_WIDTH_RATIO = 0.6;
const CHAR_TOP_OVERFLOW = 0.08;
const CHAR_BOTTOM_OVERFLOW_DARK = 0.06;
const CHAR_LIGHT_LEFT_OFFSET = 0.05;

// Shade characters
const SHADE_CHARS = [' ', '░', '▒', '▓'];

/**
 * Render fold artwork to HTML with selectable text
 */
export function renderToHTML({
  folds,
  seed,
  outputWidth,
  outputHeight,
  bgColor,
  textColor,
  accentColor,
  cellWidth: inputCellWidth,
  cellHeight: inputCellHeight,
  renderMode,
  showEmptyCells = false,
  multiColor,
  levelColors,
  foldStrategy = null,
  paperProperties = null,
  padding = 0,
  showCreaseLines = false,
  fontFamily = FONT_STACK,
}) {
  // Scale factors (same as canvas)
  const scaleX = outputWidth / 1200;
  const scaleY = outputHeight / 1697;

  // Grid area dimensions (same as canvas: 1200 - 2*padding - 290)
  const gridAreaWidth = 1200 - 2 * padding - 290;
  const gridAreaHeight = 1697 - 2 * padding - 290;

  // Calculate grid with gaps (same as canvas)
  const gridInfo = calculateGridWithGaps(seed, inputCellWidth, inputCellHeight, gridAreaWidth, gridAreaHeight);
  const { cols, rows, strideX, strideY, gridOffsetX, gridOffsetY } = gridInfo;
  const cellW = gridInfo.cellWidth;
  const cellH = gridInfo.cellHeight;

  // Scaled dimensions
  const scaledGridAreaWidth = gridAreaWidth * scaleX;
  const scaledGridAreaHeight = gridAreaHeight * scaleY;
  const scaledCellW = cellW * scaleX;
  const scaledCellH = cellH * scaleY;
  const scaledStrideX = strideX * scaleX;
  const scaledStrideY = strideY * scaleY;

  // Grid start position (same as canvas: padding + 145 + gridOffset)
  const gridStartX = (padding + 145 + gridOffsetX) * scaleX;
  const gridStartY = (padding + 145 + gridOffsetY) * scaleY;

  // Font size calculation (same as canvas: cellHeight / (1.08 + 0.06))
  const fontSize = scaledCellH / (1 + CHAR_TOP_OVERFLOW + CHAR_BOTTOM_OVERFLOW_DARK);
  const charWidth = CHAR_WIDTH_RATIO * fontSize;
  const topOverflow = CHAR_TOP_OVERFLOW * fontSize;
  const lightLeftOffset = CHAR_LIGHT_LEFT_OFFSET * fontSize;
  const maxLevel = fontSize < 30 ? 2 : 3;

  // Fold simulation (same as canvas)
  const weightRange = generateWeightRange(seed);
  const scaledPaperProps = scaleAbsorbencyForGrid(paperProperties, cols, rows);
  const actualGridWidth = gridInfo.actualGridWidth;
  const actualGridHeight = gridInfo.actualGridHeight;

  const { creases, firstFoldTarget, lastFoldTarget } = simulateFolds(
    actualGridWidth,
    actualGridHeight,
    folds,
    seed,
    weightRange,
    foldStrategy,
    scaledPaperProps
  );

  // Scale creases for visual rendering
  const scaledCreases = creases.map(c => ({
    ...c,
    p1: { x: c.p1.x * scaleX, y: c.p1.y * scaleY },
    p2: { x: c.p2.x * scaleX, y: c.p2.y * scaleY },
  }));

  // Get first/last fold target cell keys
  let firstFoldCellKey = null;
  if (firstFoldTarget) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor(firstFoldTarget.x / strideX)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(firstFoldTarget.y / strideY)));
    firstFoldCellKey = `${col},${row}`;
  }
  let lastFoldCellKey = null;
  if (lastFoldTarget) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor(lastFoldTarget.x / strideX)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(lastFoldTarget.y / strideY)));
    lastFoldCellKey = `${col},${row}`;
  }

  // Process creases to get cell weights (same as canvas)
  const { cellWeights, cellMaxGap } = processCreases(
    scaledCreases,
    cols,
    rows,
    scaledStrideX,
    scaledStrideY,
    folds,
    paperProperties
  );

  // Find cells with extreme gaps (for accent coloring)
  const extremeGapCells = new Set();
  const gapValues = Object.values(cellMaxGap);
  if (gapValues.length > 0) {
    const maxGapValue = Math.max(...gapValues);
    for (const [key, gap] of Object.entries(cellMaxGap)) {
      if (gap === maxGapValue) extremeGapCells.add(key);
    }
  }

  // Calculate adaptive thresholds for level determination
  const thresholds = calculateAdaptiveThresholds(cellWeights);

  // Get overlap/direction parameters (same as canvas)
  const overlapParams = generateOverlapParams(seed, cols, renderMode);
  const { cellOverflowAmount, invertedSingleCharOnEmpty, getOverlapFactor, getCellDirection } = overlapParams;

  // Color helper for multi-color/gradient modes (matching canvas exactly)
  const getColorForLevel = (level) => {
    // Use level colors if available (from gradient mode or multi-color mode)
    if (levelColors && levelColors.length > 0) {
      return levelColors[Math.min(level, 3)];
    }
    return textColor;
  };

  // Margin boundaries (same as canvas)
  const marginLeft = (padding + 145) * scaleX;
  const marginLeftWithOffset = marginLeft + lightLeftOffset;
  const marginRight = marginLeft + scaledGridAreaWidth;

  // Adjust grid start to ensure it doesn't start before draw area (matching canvas)
  // Canvas: adjustedOffsetX = Math.max(offsetX, drawAreaLeft)
  const drawAreaLeft = marginLeftWithOffset;
  const drawAreaTop = (padding + 145) * scaleY + topOverflow;
  const adjustedGridStartX = Math.max(gridStartX, drawAreaLeft);
  const adjustedGridStartY = Math.max(gridStartY, drawAreaTop);

  // Build character spans
  const spans = [];

  for (let row = 0; row < rows; row++) {
    const cellY = Math.round(adjustedGridStartY + row * scaledStrideY);

    for (let col = 0; col < cols; col++) {
      const cellX = Math.round(adjustedGridStartX + col * scaledStrideX);
      const cellKey = `${col},${row}`;
      const weight = cellWeights[cellKey] || 0;

      // Determine character and color based on render mode (matching canvas exactly)
      let char = null;
      let color = textColor;
      let level = -1;
      let isEmptyCell = false;

      if (firstFoldCellKey === cellKey) {
        // First fold target cell - always show
        level = weight > 0 ? countToLevelAdaptive(weight, thresholds) : 2;
        char = SHADE_CHARS[Math.min(Math.max(level, 2), maxLevel)];
        color = accentColor;
      } else if (renderMode === 'normal') {
        level = countToLevelAdaptive(weight, thresholds);
        if (level === 0) {
          char = null;
        } else {
          char = SHADE_CHARS[Math.min(level, maxLevel)];
          color = getColorForLevel(level);

          // Color adjustments for high weight
          if (weight >= 1.5) {
            const excess = weight - 1.5;
            const hueShift = 30 + Math.min(excess * 300, 150);
            const hsl = hexToHsl(textColor);
            color = hslToHex(
              (hsl.h + hueShift + 360) % 360,
              Math.min(100, hsl.s + 20),
              Math.min(85, hsl.l + 10)
            );
          } else if (extremeGapCells.has(cellKey) && weight > 0) {
            color = accentColor;
          } else if (lastFoldCellKey === cellKey) {
            color = textColor;
          }
        }
      } else if (renderMode === 'binary') {
        if (weight === 0) {
          if (showEmptyCells) {
            char = SHADE_CHARS[1];
            level = 0;
            isEmptyCell = true;
            color = textColor;
          }
        } else {
          level = maxLevel;
          char = SHADE_CHARS[level];
          color = getColorForLevel(level);
          if (extremeGapCells.has(cellKey)) {
            color = accentColor;
          }
        }
      } else if (renderMode === 'inverted') {
        level = Math.min(3 - countToLevelAdaptive(weight, thresholds), maxLevel);
        char = SHADE_CHARS[level];
        color = getColorForLevel(level);

        if (weight >= 1.5) {
          const excess = weight - 1.5;
          const hueShift = 30 + Math.min(excess * 300, 150);
          const hsl = hexToHsl(textColor);
          color = hslToHex(
            (hsl.h + hueShift + 360) % 360,
            Math.min(100, hsl.s + 20),
            Math.min(85, hsl.l + 10)
          );
        } else if (extremeGapCells.has(cellKey) && weight > 0) {
          color = accentColor;
        }
      } else if (renderMode === 'sparse') {
        level = countToLevelAdaptive(weight, thresholds);
        if (level === 1) {
          char = SHADE_CHARS[1];
          color = getColorForLevel(1);
          if (extremeGapCells.has(cellKey)) {
            color = accentColor;
          }
        }
      } else if (renderMode === 'dense') {
        level = countToLevelAdaptive(weight, thresholds);
        if (level >= 2) {
          char = SHADE_CHARS[Math.min(level, maxLevel)];
          color = getColorForLevel(level);

          if (weight >= 1.5) {
            const excess = weight - 1.5;
            const hueShift = 30 + Math.min(excess * 300, 150);
            const hsl = hexToHsl(textColor);
            color = hslToHex(
              (hsl.h + hueShift + 360) % 360,
              Math.min(100, hsl.s + 20),
              Math.min(85, hsl.l + 10)
            );
          } else if (extremeGapCells.has(cellKey)) {
            color = accentColor;
          }
        }
      }

      if (!char) continue;

      // Cell boundaries
      const cellRight = cellX + scaledCellW;
      const clampedRight = Math.min(cellRight, marginRight);
      const availableWidth = clampedRight - cellX;

      if (availableWidth < 0.5 * charWidth) continue;

      // Matching canvas logic for overlap and single char modes:
      // noOverlap: uses overlap factor 1.0 (characters spaced by full charWidth)
      // singleCharOnly: renders only 1 character total
      const noOverlap = isEmptyCell || (weight === 0 && renderMode !== 'inverted');
      const singleCharOnly = renderMode === 'inverted' && weight === 0 && invertedSingleCharOnEmpty;

      // Effective step based on overlap factor (matching canvas cellOverlapFactor)
      const cellOverlapFactor = (noOverlap || singleCharOnly) ? 1.0 : getOverlapFactor(row, col);
      const effectiveStep = charWidth * cellOverlapFactor;

      // Calculate number of characters (matching canvas exactly)
      const charsWithStep = Math.max(1, Math.floor((availableWidth - charWidth) / effectiveStep) + 1);
      const coveredWidth = (charsWithStep - 1) * effectiveStep + charWidth;
      const remainingGap = availableWidth - coveredWidth;
      const gapRatio = remainingGap / charWidth;
      const numChars = gapRatio > 0.3 ? charsWithStep + 1 : charsWithStep;

      // Step between characters (recalculated to fill cell exactly)
      const step = numChars <= 1 ? charWidth : (availableWidth - charWidth) / (numChars - 1);

      // Overflow characters (skip for empty cells and single-char mode)
      const skipOverflow = isEmptyCell || singleCharOnly;
      const overflowAmount = skipOverflow ? 0 : cellOverflowAmount * scaledCellW;
      let overflowChars = 0;
      if (overflowAmount > 0) {
        overflowChars = Math.ceil(overflowAmount / step);
      }

      const totalChars = singleCharOnly ? 1 : numChars + overflowChars;
      const direction = getCellDirection(row, col);
      const centerX = cellX + availableWidth / 2;

      // Render each character
      for (let i = 0; i < totalChars && level >= 0; i++) {
        let charToRender = char;

        // Alternate shade for higher levels (matching canvas)
        if (level >= 2 && i > 0 && i % 2 === 0) {
          charToRender = SHADE_CHARS[Math.max(0, level - 1)];
        }

        // Calculate x position based on direction
        let x;
        if (direction === 'center') {
          if (i < numChars) {
            const halfIndex = Math.floor((i + 1) / 2) * step;
            if (i === 0) {
              x = centerX - charWidth / 2;
            } else if (i % 2 === 0) {
              x = centerX + halfIndex - charWidth / 2;
            } else {
              x = centerX - halfIndex - charWidth / 2;
            }
          } else {
            // Overflow
            const overflowIdx = i - numChars;
            const baseOffset = Math.floor(numChars / 2) * step;
            const overflowOffset = Math.floor((overflowIdx + 1) / 2) * step;
            if (overflowIdx % 2 === 0) {
              x = centerX + baseOffset + overflowOffset;
              if (x + charWidth > marginRight) break;
            } else {
              x = centerX - baseOffset - overflowOffset - charWidth;
              if (x < marginLeftWithOffset) break;
            }
          }
        } else if (i < numChars) {
          // Normal left-to-right within cell
          x = cellX + i * step;
        } else {
          // Overflow characters
          if (direction === 'rtl') {
            x = cellX - (i - numChars + 1) * step;
            if (x < marginLeftWithOffset) break;
          } else {
            x = clampedRight + (i - numChars) * step;
            if (x + charWidth > marginRight) break;
          }
        }

        spans.push({
          char: charToRender,
          x: x,
          y: cellY,
          color,
          opacity: isEmptyCell ? 0.1 : 1,
        });
      }
    }
  }

  // Generate crease lines SVG
  let creaseLinesHtml = '';
  if (showCreaseLines && scaledCreases.length > 0) {
    const creaseRng = seededRandom(seed + 9292);
    const useAccent = creaseRng() < 0.6;
    const lineColor = useAccent ? accentColor : textColor;
    const lineWidth = 1.5 * scaleX;

    const lines = scaledCreases.map(c =>
      `<line x1="${gridStartX + c.p1.x}" y1="${gridStartY + c.p1.y}" x2="${gridStartX + c.p2.x}" y2="${gridStartY + c.p2.y}" />`
    ).join('');

    creaseLinesHtml = `
      <svg class="fold-creases" style="position:absolute;inset:0;pointer-events:none;">
        <g stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="round" opacity="0.85">
          ${lines}
        </g>
      </svg>`;
  }

  // Build spans HTML
  const spansHtml = spans.map(s =>
    `<span style="left:${s.x.toFixed(1)}px;top:${s.y.toFixed(1)}px;color:${s.color};${s.opacity < 1 ? `opacity:${s.opacity};` : ''}">${s.char}</span>`
  ).join('');

  // Build final HTML
  const html = `
<div class="fold-artwork" style="position:relative;width:${outputWidth}px;height:${outputHeight}px;background:${bgColor};overflow:hidden;">
  <style>
    @font-face {
      font-family: '${ONCHAIN_FONT_NAME}';
      src: url('${ONCHAIN_FONT_DATA_URI}') format('woff2');
      font-display: block;
    }
    .fold-artwork span {
      position: absolute;
      font-family: ${fontFamily};
      font-size: ${fontSize.toFixed(1)}px;
      line-height: 1;
      white-space: pre;
    }
  </style>
  ${spansHtml}
  ${creaseLinesHtml}
</div>`.trim();

  return {
    html,
    width: outputWidth,
    height: outputHeight,
    cells: spans.length,
    creaseCount: creases.length,
  };
}

/**
 * Convenience function to render using generateAllParams output
 */
export function renderParamsToHTML(params, width = 1200, height = 1697) {
  return renderToHTML({
    folds: params.folds,
    seed: params.seed,
    outputWidth: width,
    outputHeight: height,
    bgColor: params.palette.bg,
    textColor: params.palette.text,
    accentColor: params.palette.accent,
    cellWidth: params.cells.cellW,
    cellHeight: params.cells.cellH,
    renderMode: params.renderMode,
    showEmptyCells: params.showEmptyCells,
    multiColor: params.multiColor,
    levelColors: params.levelColors,
    foldStrategy: params.foldStrategy,
    paperProperties: params.paperProperties,
    showCreaseLines: params.showCreaseLines,
  });
}

export default renderToHTML;
