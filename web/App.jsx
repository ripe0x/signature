import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// Import all core rendering logic from fold-core
import {
  // Constants
  CELL_MIN,
  CELL_MAX,
  CELL_ASPECT_MAX,
  DRAWING_MARGIN,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
  // Palette
  VGA_PALETTE,
  PALETTE_BY_LUMINANCE,
  PALETTE_BY_TEMPERATURE,
  PALETTE_BY_SATURATION,
  // Color utilities
  findVGAColor,
  hexToHsl,
  hslToHex,
  // Generation functions
  generatePalette,
  generateCellDimensions,
  generateRenderMode,
  generateWeightRange,
  generateMaxFolds,
  generateFoldStrategy,
  generateMultiColorPalette,
  generateMultiColorEnabled,
  generateAllParams,
  // Simulation
  simulateFolds,
  findIntersections,
  processCreases,
  // Thresholds
  calculateAdaptiveThresholds,
  countToLevelAdaptive,
  // Rendering
  renderToCanvas,
  // RNG
  seededRandom,
  // Font loading
  loadFont,
} from "./fold-core.js";

// ============ BATCH STATS ============

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
    bgColors: {},
    textColors: {},
    accentColors: {},
    bgLuminance: { dark: 0, midDark: 0, mid: 0, midLight: 0, light: 0 },
    textLuminance: { dark: 0, midDark: 0, mid: 0, midLight: 0, light: 0 },
    bgSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
    textSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
    accentSaturation: { gray: 0, muted: 0, chromatic: 0, vivid: 0 },
  };

  for (const item of batchItems) {
    stats.renderModes[item.params.renderMode] =
      (stats.renderModes[item.params.renderMode] || 0) + 1;

    const stratType = item.params.foldStrategy.type;
    stats.foldStrategies[stratType] =
      (stats.foldStrategies[stratType] || 0) + 1;

    if (item.params.multiColor) stats.multiColorCount++;

    const paletteStrategy = item.params.palette.strategy;
    const [structure, archetype] = paletteStrategy.split("/");
    stats.paletteArchetypes[archetype || "unknown"] =
      (stats.paletteArchetypes[archetype || "unknown"] || 0) + 1;
    stats.paletteStructures[structure || "unknown"] =
      (stats.paletteStructures[structure || "unknown"] || 0) + 1;

    const bgColor = findVGAColor(item.params.palette.bg);
    const textColor = findVGAColor(item.params.palette.text);
    const accentColor = findVGAColor(item.params.palette.accent);

    stats.bgTemperatures[bgColor.temperature] =
      (stats.bgTemperatures[bgColor.temperature] || 0) + 1;
    stats.textTemperatures[textColor.temperature] =
      (stats.textTemperatures[textColor.temperature] || 0) + 1;

    stats.bgColors[item.params.palette.bg] =
      (stats.bgColors[item.params.palette.bg] || 0) + 1;
    stats.textColors[item.params.palette.text] =
      (stats.textColors[item.params.palette.text] || 0) + 1;
    stats.accentColors[item.params.palette.accent] =
      (stats.accentColors[item.params.palette.accent] || 0) + 1;

    const getLumBucket = (lum) => {
      if (lum < 25) return "dark";
      if (lum < 45) return "midDark";
      if (lum < 65) return "mid";
      if (lum < 80) return "midLight";
      return "light";
    };
    stats.bgLuminance[getLumBucket(bgColor.luminance)]++;
    stats.textLuminance[getLumBucket(textColor.luminance)]++;

    stats.bgSaturation[bgColor.saturation]++;
    stats.textSaturation[textColor.saturation]++;
    stats.accentSaturation[accentColor.saturation]++;

    const cellArea = item.params.cells.cellW * item.params.cells.cellH;
    if (cellArea < 100) stats.cellSizeRanges.small++;
    else if (cellArea < 400) stats.cellSizeRanges.medium++;
    else stats.cellSizeRanges.large++;
  }

  return stats;
}

// ============ BATCH MODE COMPONENTS ============

function MiniCanvas({ params, folds, width, height, onClick, isSelected }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const thumbWidth = 120;
    const thumbHeight = 150;
    const scale = thumbWidth / width;

    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    ctx.fillStyle = params.palette.bg;
    ctx.fillRect(0, 0, thumbWidth, thumbHeight);

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

function ColorFrequencyGrid({ label, colorData, totalItems }) {
  const entries = Object.entries(colorData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (entries.length === 0) return null;

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

    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
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
        <div
          style={{
            flex: "0 0 auto",
            maxHeight: "85vh",
            maxWidth: "calc(95vw - 330px)",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "85vh",
              width: "auto",
              height: "auto",
              borderRadius: 4,
            }}
          />
        </div>

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

function BatchMode({ folds, width, height, onSelectSeed, onClose }) {
  const [batchSize, setBatchSize] = useState(24);
  const [batchItems, setBatchItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [randomFolds, setRandomFolds] = useState(false);
  const [batchFolds, setBatchFolds] = useState(folds);

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

      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
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

// ============ ASCII CANVAS COMPONENT ============

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
  showCellOutlines = false,
  onStatsUpdate = null,
}) {
  const canvasRef = useRef(null);

  const scaleX = width / REFERENCE_WIDTH;
  const scaleY = height / REFERENCE_HEIGHT;

  const refInnerWidth = REFERENCE_WIDTH - padding * 2 - DRAWING_MARGIN * 2;
  const refInnerHeight = REFERENCE_HEIGHT - padding * 2 - DRAWING_MARGIN * 2;

  // Calculate optimal cell sizes and gaps to fill the drawing space
  // Gaps must be one of the allowed ratios (powers of 2 from -1x to 2x)
  // Smaller gaps are more common, gaps > 1/4 are rare
  // Negative gaps allow overlapping cells, increasing cell count
  const ALLOWED_GAP_RATIOS = [
    // Negative gaps (overlapping cells) - from -1x to -1/64
    -1.0, // -1x (cells overlap by their full size)
    -1 / 2, // -0.5x
    -1 / 4, // -0.25x
    -1 / 8, // -0.125
    -1 / 16, // -0.0625
    -1 / 32, // -0.03125
    -1 / 64, // -0.015625
    // Positive gaps (spacing between cells) - from 1/64 to 2x
    1 / 64, // 0.015625
    1 / 32, // 0.03125
    1 / 16, // 0.0625
    1 / 8, // 0.125
    1 / 4, // 0.25
    1 / 2, // 0.5
    1.0, // 1x
    2.0, // 2x
  ];

  // Use seed to deterministically determine gap usage
  const gapRng = seededRandom(seed + 12345);

  // 40% chance of having any gaps at all
  const useGaps = gapRng() < 0.4;

  // If using gaps, determine which dimensions get gaps
  // 33% cols only, 33% rows only, 34% both
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

  // Weight gap ratios: smaller gaps are more likely, gaps > 1/4 are rare
  // Negative gaps (overlapping) are less common than positive gaps
  // Create weighted list where gaps <= 1/4 get higher weight
  const getWeightedGapRatios = () => {
    const ratios = [];

    // Small negative gaps (overlapping): -1/64 to -1/8, 50% chance of including
    if (gapRng() < 0.5) {
      ratios.push(ALLOWED_GAP_RATIOS[6]); // -1/64
      ratios.push(ALLOWED_GAP_RATIOS[5]); // -1/32
      ratios.push(ALLOWED_GAP_RATIOS[4]); // -1/16
      ratios.push(ALLOWED_GAP_RATIOS[3]); // -1/8
    }

    // Medium negative gaps: -1/4, -1/2, -1x, 30% chance
    if (gapRng() < 0.3) {
      ratios.push(ALLOWED_GAP_RATIOS[2]); // -1/4
      ratios.push(ALLOWED_GAP_RATIOS[1]); // -1/2
      // -1x is very rare (10% chance when negative gaps are used)
      if (gapRng() < 0.1) {
        ratios.push(ALLOWED_GAP_RATIOS[0]); // -1x
      }
    }

    // Small positive gaps (<= 1/4): always included
    ratios.push(ALLOWED_GAP_RATIOS[7]); // 1/64
    ratios.push(ALLOWED_GAP_RATIOS[8]); // 1/32
    ratios.push(ALLOWED_GAP_RATIOS[9]); // 1/16
    ratios.push(ALLOWED_GAP_RATIOS[10]); // 1/8
    ratios.push(ALLOWED_GAP_RATIOS[11]); // 1/4

    // Medium positive gaps (1/2, 1x): always included
    ratios.push(ALLOWED_GAP_RATIOS[12]); // 1/2
    ratios.push(ALLOWED_GAP_RATIOS[13]); // 1x

    // Large positive gaps (2x): only 25% chance (very rare)
    if (gapRng() < 0.25) {
      ratios.push(ALLOWED_GAP_RATIOS[14]); // 2x
    }

    return ratios;
  };

  let refCellWidth = cellWidth;
  let refCellHeight = cellHeight;

  // For columns: try each gap ratio and find the one that best fills the space
  // Important: use Math.floor to ensure we never exceed the available space
  let bestCols = 1;
  let bestColGap = 0;
  let bestColFit = Infinity;

  const colGapRatios = useColGaps ? getWeightedGapRatios() : [0];

  for (const gapRatio of colGapRatios) {
    const gap = refCellWidth * gapRatio;

    // Ensure gap doesn't cause cells to overlap more than 90% of their size
    // (gap can't be more negative than -0.9 * cellWidth)
    if (gap < -0.9 * refCellWidth) {
      continue;
    }

    // Solve: cols * cellWidth + (cols - 1) * gap = refInnerWidth
    // cols = (refInnerWidth + gap) / (cellWidth + gap)
    // For negative gaps, the stride (cellWidth + gap) is smaller, allowing more cells
    // Use Math.floor to ensure we never exceed the space
    const stride = refCellWidth + gap;
    // Ensure stride is positive (gap can't be more negative than -cellWidth)
    if (stride <= 0) {
      continue;
    }

    const cols = Math.max(1, Math.floor((refInnerWidth + gap) / stride));

    if (cols === 1) {
      // Single column - no gap needed, but don't exceed width
      const cellW = Math.min(refCellWidth, refInnerWidth);
      const fit = Math.abs(refInnerWidth - cellW);
      if (fit < bestColFit) {
        bestColFit = fit;
        bestCols = 1;
        bestColGap = 0;
        refCellWidth = cellW;
      }
    } else {
      const actualWidth = cols * refCellWidth + (cols - 1) * gap;
      // Only consider this configuration if it doesn't exceed the space
      if (actualWidth <= refInnerWidth) {
        const fit = Math.abs(refInnerWidth - actualWidth);
        if (fit < bestColFit) {
          bestColFit = fit;
          bestCols = cols;
          bestColGap = gap;
        }
      }
    }
  }

  // Handle single column case - expand cell to fill space (if not already set)
  if (bestCols === 1 && refCellWidth < refInnerWidth) {
    refCellWidth = refInnerWidth;
    bestColGap = 0;
  }

  const cols = bestCols;
  const actualColGap = bestColGap;

  // For rows: try each gap ratio and find the one that best fills the space
  // Important: use Math.floor to ensure we never exceed the available space
  let bestRows = 1;
  let bestRowGap = 0;
  let bestRowFit = Infinity;

  const rowGapRatios = useRowGaps ? getWeightedGapRatios() : [0];

  for (const gapRatio of rowGapRatios) {
    const gap = refCellHeight * gapRatio;

    // Ensure gap doesn't cause cells to overlap more than 90% of their size
    // (gap can't be more negative than -0.9 * cellHeight)
    if (gap < -0.9 * refCellHeight) {
      continue;
    }

    // Solve: rows * cellHeight + (rows - 1) * gap = refInnerHeight
    // rows = (refInnerHeight + gap) / (cellHeight + gap)
    // For negative gaps, the stride (cellHeight + gap) is smaller, allowing more cells
    // Use Math.floor to ensure we never exceed the space
    const stride = refCellHeight + gap;
    // Ensure stride is positive (gap can't be more negative than -cellHeight)
    if (stride <= 0) {
      continue;
    }

    const rows = Math.max(1, Math.floor((refInnerHeight + gap) / stride));

    if (rows === 1) {
      // Single row - no gap needed, but don't exceed height
      const cellH = Math.min(refCellHeight, refInnerHeight);
      const fit = Math.abs(refInnerHeight - cellH);
      if (fit < bestRowFit) {
        bestRowFit = fit;
        bestRows = 1;
        bestRowGap = 0;
        refCellHeight = cellH;
      }
    } else {
      const actualHeight = rows * refCellHeight + (rows - 1) * gap;
      // Only consider this configuration if it doesn't exceed the space
      if (actualHeight <= refInnerHeight) {
        const fit = Math.abs(refInnerHeight - actualHeight);
        if (fit < bestRowFit) {
          bestRowFit = fit;
          bestRows = rows;
          bestRowGap = gap;
        }
      }
    }
  }

  // Handle single row case - expand cell to fill space (if not already set)
  if (bestRows === 1 && refCellHeight < refInnerHeight) {
    refCellHeight = refInnerHeight;
    bestRowGap = 0;
  }

  const rows = bestRows;
  const actualRowGap = bestRowGap;

  // Calculate actual grid dimensions with the determined cell sizes and gaps
  const actualGridWidth =
    cols * refCellWidth + (cols > 1 ? (cols - 1) * actualColGap : 0);
  const actualGridHeight =
    rows * refCellHeight + (rows > 1 ? (rows - 1) * actualRowGap : 0);

  // Check variation from target
  const widthDiff = refInnerWidth - actualGridWidth;
  const heightDiff = refInnerHeight - actualGridHeight;
  const widthVariation = Math.abs(widthDiff) / refInnerWidth;
  const heightVariation = Math.abs(heightDiff) / refInnerHeight;

  // Calculate stride (distance between cell centers)
  const refCellStrideX = refCellWidth + actualColGap;
  const refCellStrideY = refCellHeight + actualRowGap;

  // Calculate grid offset (for centering) - used for fold target mapping
  const gridOffsetX = widthDiff > 0 ? widthDiff / 2 : 0;
  const gridOffsetY = heightDiff > 0 ? heightDiff / 2 : 0;

  // Use the calculated cell dimensions
  const charWidth = refCellWidth;
  const charHeight = refCellHeight;

  const innerWidth = refInnerWidth * scaleX;
  const innerHeight = refInnerHeight * scaleY;
  const offsetX = (padding + DRAWING_MARGIN + gridOffsetX) * scaleX;
  const offsetY = (padding + DRAWING_MARGIN + gridOffsetY) * scaleY;

  useEffect(() => {
    const renderStartTime = performance.now();
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1393",
        message: "Render start",
        data: { cols, rows, totalCells: cols * rows },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion
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

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const weightRange = generateWeightRange(seed);

    const actualCharWidth = refCellWidth * scaleX;
    const actualCharHeight = refCellHeight * scaleY;
    const actualStrideX = refCellStrideX * scaleX;
    const actualStrideY = refCellStrideY * scaleY;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1430",
        message: "Before simulateFolds",
        data: {
          seed,
          folds,
          refInnerWidth,
          refInnerHeight,
          foldStrategyType: foldStrategy?.type,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion
    const { creases, finalShape, maxFolds, firstFoldTarget, lastFoldTarget } =
      simulateFolds(
        actualGridWidth,
        actualGridHeight,
        folds,
        seed,
        weightRange,
        foldStrategy
      );
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1437",
        message: "After simulateFolds",
        data: {
          creaseCount: creases.length,
          maxFolds,
          hasLastFoldTarget: !!lastFoldTarget,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion

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
      // Fold target is now in grid space (0 to actualGridWidth/Height)
      // Convert directly to cell coordinates
      const targetCol = Math.max(
        0,
        Math.min(cols - 1, Math.floor(firstFoldTarget.x / refCellStrideX))
      );
      const targetRow = Math.max(
        0,
        Math.min(rows - 1, Math.floor(firstFoldTarget.y / refCellStrideY))
      );
      firstFoldTargetCell = `${targetCol},${targetRow}`;
    }

    let lastFoldTargetCell = null;
    if (lastFoldTarget) {
      // Fold target is now in grid space (0 to actualGridWidth/Height)
      // Convert directly to cell coordinates
      const targetCol = Math.max(
        0,
        Math.min(cols - 1, Math.floor(lastFoldTarget.x / refCellStrideX))
      );
      const targetRow = Math.max(
        0,
        Math.min(rows - 1, Math.floor(lastFoldTarget.y / refCellStrideY))
      );
      lastFoldTargetCell = `${targetCol},${targetRow}`;
    }

    const scaledFinalShape = finalShape.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    }));

    // #region agent log
    const processCreasesStart = performance.now();
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1476",
        message: "Before processCreases",
        data: {
          seed,
          cols,
          rows,
          totalCells: cols * rows,
          creaseCount: scaledCreases.length,
          actualStrideX,
          actualStrideY,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion
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
      maxFolds
    );
    // #region agent log
    const processCreasesTime = performance.now() - processCreasesStart;
    const cellWeightKeys = Object.keys(intersectionWeight);
    const cellsWithWeight = cellWeightKeys.filter(
      (k) => intersectionWeight[k] > 0
    );
    const maxWeight = Math.max(
      ...cellWeightKeys.map((k) => intersectionWeight[k]),
      0
    );
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1492",
        message: "After processCreases",
        data: {
          seed,
          processCreasesTimeMs: processCreasesTime,
          intersections: activeIntersections.length,
          totalCells: cellWeightKeys.length,
          cellsWithWeight: cellsWithWeight.length,
          maxWeight,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion

    const creasesForRender = activeCreases;

    if (onStatsUpdate) {
      onStatsUpdate({
        intersections: activeIntersections.length,
        creases: activeCreases.length,
        destroyed: 0,
        maxFolds: maxFolds,
      });
    }

    ctx.font = `${
      actualCharHeight - 2 * scaleY
    }px "Courier New", Courier, monospace`;
    ctx.textBaseline = "top";

    const shadeChars = [" ", "░", "▒", "▓"];

    const thresholds = calculateAdaptiveThresholds(intersectionWeight);

    const accentCells = new Set();
    if (Object.keys(cellMaxGap).length > 0) {
      const maxGap = Math.max(...Object.values(cellMaxGap));
      for (const [key, gap] of Object.entries(cellMaxGap)) {
        if (gap === maxGap) {
          accentCells.add(key);
        }
      }
    }

    if (showHitCounts) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

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

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    } else {
      // #region agent log
      const renderLoopStart = performance.now();
      let cellsRendered = 0;
      let cellsWithChar = 0;
      fetch(
        "http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "App.jsx:1551",
            message: "Before render loop",
            data: { seed, cols, rows, totalCells: cols * rows },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "E",
          }),
        }
      ).catch(() => {});
      // #endregion
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          cellsRendered++;
          const x = Math.round(offsetX + col * actualStrideX);
          const y = Math.round(offsetY + row * actualStrideY);
          const key = `${col},${row}`;
          const weight = intersectionWeight[key] || 0;

          let char = null;
          let color = textColor;
          let level = -1;

          const getColorForLevel = (lvl) => {
            if (multiColor && levelColors) {
              return levelColors[Math.min(lvl, 3)];
            }
            return textColor;
          };

          if (firstFoldTargetCell === key) {
            // First fold target: always show a visible character with accent color
            level = weight > 0 ? countToLevelAdaptive(weight, thresholds) : 2;
            char = shadeChars[Math.max(level, 2)]; // At least ▒ for visibility
            color = accentColor;
          } else if (lastFoldTargetCell === key) {
            // Last fold target: always show a visible character
            level = weight > 0 ? countToLevelAdaptive(weight, thresholds) : 2;
            char = shadeChars[Math.max(level, 2)]; // At least ▒ for visibility
            color = textColor;
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
            color = getColorForLevel(level);
          } else if (renderMode === "binary") {
            if (weight === 0) {
              char = shadeChars[0];
              level = 0;
              color = getColorForLevel(0);
            } else {
              char = shadeChars[3];
              level = 3;
              color = getColorForLevel(3);
            }
          } else if (renderMode === "inverted") {
            level = 3 - countToLevelAdaptive(weight, thresholds);
            char = shadeChars[level];
            color = getColorForLevel(level);
          } else if (renderMode === "sparse") {
            level = countToLevelAdaptive(weight, thresholds);
            if (level === 1) {
              char = shadeChars[1];
              color = getColorForLevel(1);
            }
          } else if (renderMode === "dense") {
            level = countToLevelAdaptive(weight, thresholds);
            if (level >= 2) {
              char = shadeChars[level];
              color = getColorForLevel(level);
            } else if (weight === 0) {
              char = shadeChars[0];
              level = 0;
              color = getColorForLevel(0);
            }
          }

          if (char) {
            cellsWithChar++;
            // Use the color we determined earlier (accentColor for fold targets)
            // Don't override it with finalColor for fold target cells
            if (firstFoldTargetCell === key || lastFoldTargetCell === key) {
              ctx.fillStyle = color; // Already set to accentColor || textColor
            } else {
              const finalColor = getColorForLevel(
                countToLevelAdaptive(weight, thresholds)
              );
              ctx.fillStyle =
                accentCells.has(key) && weight > 0 ? accentColor : finalColor;
            }

            const cellEndX = x + actualCharWidth;

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
      // #region agent log
      const renderLoopTime = performance.now() - renderLoopStart;
      fetch(
        "http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "App.jsx:1680",
            message: "After render loop",
            data: {
              seed,
              renderLoopTimeMs: renderLoopTime,
              cols,
              rows,
              totalCells: cols * rows,
              cellsRendered,
              cellsWithChar,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "E",
          }),
        }
      ).catch(() => {});
      // #endregion
    }

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

      if (firstFoldTarget) {
        const targetX = offsetX + firstFoldTarget.x * scaleX;
        const targetY = offsetY + firstFoldTarget.y * scaleY;
        const radius = 8;
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
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

      // Draw intersection points as red circles with transparent fill
      if (activeIntersections && activeIntersections.length > 0) {
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

      ctx.globalAlpha = 1;
    }

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

        ctx.fillStyle = "#00ffff";
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    if (showCellOutlines) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 1;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = Math.round(offsetX + col * actualStrideX);
          const y = Math.round(offsetY + row * actualStrideY);
          ctx.strokeRect(x, y, actualCharWidth, actualCharHeight);
        }
      }
    }
    // #region agent log
    const totalRenderTime = performance.now() - renderStartTime;
    fetch("http://127.0.0.1:7242/ingest/74d4f25e-0fce-432d-aa79-8bfa524124c4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "App.jsx:1729",
        message: "Render complete",
        data: {
          totalRenderTimeMs: totalRenderTime,
          cols,
          rows,
          totalCells: cols * rows,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion
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
    showCellOutlines,
    onStatsUpdate,
  ]);

  return <canvas ref={canvasRef} />;
}

// ============ MAIN COMPONENT ============

export default function FoldedPaper() {
  const [folds, setFolds] = useState(15);
  const [seed, setSeed] = useState(42);
  const [showUI, setShowUI] = useState(true);
  const [padding, setPadding] = useState(0);
  const [colorScheme, setColorScheme] = useState("generative");
  const [randomizeFolds, setRandomizeFolds] = useState(false);

  const height = 1500;
  const width = 1200;

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
  const [colGap, setColGap] = useState(0);
  const [rowGap, setRowGap] = useState(0);
  const [renderMode, setRenderMode] = useState(initialRenderMode);
  const [multiColor, setMultiColor] = useState(initialMultiColor);
  const [levelColors, setLevelColors] = useState(
    initialMultiColor
      ? generateMultiColorPalette(42, initialPalette.bg, initialPalette.text)
      : null
  );
  const [foldStrategy, setFoldStrategy] = useState(initialFoldStrategy);
  const [strategyOverride, setStrategyOverride] = useState("auto");
  const [showCreases, setShowCreases] = useState(false);
  const [showPaperShape, setShowPaperShape] = useState(false);
  const [showHitCounts, setShowHitCounts] = useState(false);
  const [showCellOutlines, setShowCellOutlines] = useState(false);
  const [intersectionCount, setIntersectionCount] = useState(0);
  const [creaseCount, setCreaseCount] = useState(0);
  const [maxFoldsValue, setMaxFoldsValue] = useState(0);
  const [showBatchMode, setShowBatchMode] = useState(false);
  const [generatingGif, setGeneratingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [gifStartFolds, setGifStartFolds] = useState(0);
  const [gifEndFolds, setGifEndFolds] = useState(500);
  const [fontReady, setFontReady] = useState(false);

  // Load the embedded font on mount
  useEffect(() => {
    loadFont().then((loaded) => {
      setFontReady(loaded);
      if (loaded) console.log("FoldMono font loaded");
    });
  }, []);

  const presetPalettes = [
    ["cream", "#FFFFCC", "#333333", "#AA0000"],
    ["paper", "#FFFFFF", "#0000AA", "#FF0000"],
    ["ink", "#000000", "#00CCFF", "#FF5555"],
    ["amber", "#FFCC99", "#663300", "#0066CC"],
    ["blue/gold", "#0033FF", "#FFFF00", "#FFFFFF"],
    ["red/gold", "#FF0000", "#FFFF55", "#FFFFFF"],
    ["forest", "#003300", "#99FF99", "#FFCC00"],
    ["lavender", "#CCCCFF", "#330066", "#FF0066"],
  ];

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
      showCreases,
      showPaperShape,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `fold-${folds.toString().padStart(4, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const generateAnimatedGif = async () => {
    setGeneratingGif(true);
    setGifProgress(0);

    try {
      if (!window.GIF) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const GIF = window.GIF;

      const maxHeight = 1000;
      const scale = Math.min(1, maxHeight / height);
      const gifWidth = Math.round(width * scale);
      const gifHeight = Math.round(height * scale);

      let gifOptions = {
        workers: 2,
        quality: 30,
        width: gifWidth,
        height: gifHeight,
        repeat: 0,
      };

      try {
        if (!window._gifWorkerBlobUrl) {
          const workerResponse = await fetch(
            "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js"
          );
          const workerText = await workerResponse.text();
          const blob = new Blob([workerText], {
            type: "application/javascript",
          });
          window._gifWorkerBlobUrl = URL.createObjectURL(blob);
        }
        gifOptions.workerScript = window._gifWorkerBlobUrl;
      } catch (workerError) {
        gifOptions.workers = 0;
      }

      const gif = new GIF(gifOptions);

      const startFolds = Math.max(0, Math.min(gifStartFolds, gifEndFolds));
      const endFolds = Math.max(startFolds, gifEndFolds);

      const frameFolds = [];
      for (let f = startFolds; f <= endFolds; f += 2) {
        frameFolds.push(f);
      }

      const totalFrames = frameFolds.length;

      for (let i = 0; i < frameFolds.length; i++) {
        const foldCount = frameFolds[i];

        const dataUrl = renderToCanvas({
          folds: foldCount,
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
          showCreases,
          showPaperShape,
        });

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => {
            const frameCanvas = document.createElement("canvas");
            frameCanvas.width = gifWidth;
            frameCanvas.height = gifHeight;
            const frameCtx = frameCanvas.getContext("2d");

            frameCtx.imageSmoothingEnabled = true;
            frameCtx.imageSmoothingQuality = "high";

            frameCtx.drawImage(
              img,
              0,
              0,
              width,
              height,
              0,
              0,
              gifWidth,
              gifHeight
            );

            gif.addFrame(frameCanvas, { delay: 100 });

            setGifProgress(Math.round(((i + 1) / totalFrames) * 100));
            resolve();
          };
          img.onerror = reject;
          img.src = dataUrl;
        });

        await new Promise((r) => setTimeout(r, 10));
      }

      gif.on("finished", (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fold-animation-seed-${seed}-folds-${startFolds}-to-${endFolds}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setGeneratingGif(false);
        setGifProgress(0);
      });

      gif.render();
    } catch (err) {
      alert("GIF generation failed: " + err.message);
      setGeneratingGif(false);
      setGifProgress(0);
    }
  };

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

      if (strategyOverride === "auto") {
        setFoldStrategy(generateFoldStrategy(seed));
      }
    }
  }, [seed, colorScheme, width, height, padding, strategyOverride]);

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const effectiveColGap = colGap * 0.5 * cellWidth;
  const effectiveRowGap = rowGap * 0.5 * cellHeight;

  // Calculate columns/rows to fill canvas, handling negative gaps
  const strideX = cellWidth + effectiveColGap;
  const strideY = cellHeight + effectiveRowGap;
  const safeStrideX = Math.max(0.1, strideX);
  const safeStrideY = Math.max(0.1, strideY);

  const cols = Math.max(
    1,
    Math.floor((innerWidth + effectiveColGap) / safeStrideX)
  );
  const rows = Math.max(
    1,
    Math.floor((innerHeight + effectiveRowGap) / safeStrideY)
  );
  const weightRange = generateWeightRange(seed);
  const { creases, maxFolds } = simulateFolds(
    innerWidth,
    innerHeight,
    folds,
    seed,
    weightRange,
    foldStrategy
  );
  const intersections = findIntersections(creases);

  const currentStrategy =
    colorScheme === "generative" ? generatePalette(seed).strategy : null;

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
              key={`${folds}-${seed}-${cellWidth}-${cellHeight}-${colGap}-${rowGap}-${padding}-${bgColor}-${textColor}-${accentColor}-${renderMode}-${multiColor}-${foldStrategy?.type}-${showCreases}-${showPaperShape}-${showHitCounts}-${showCellOutlines}`}
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
              showCellOutlines={showCellOutlines}
              onStatsUpdate={(stats) => {
                setIntersectionCount(stats.intersections);
                setCreaseCount(stats.creases);
                setMaxFoldsValue(stats.maxFolds || 0);
              }}
            />
          </div>
        </div>
      </div>

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
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  color: "#777",
                }}
              >
                GIF Range
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 8,
                      color: "#666",
                      marginBottom: 4,
                    }}
                  >
                    Start
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={gifStartFolds}
                    onChange={(e) =>
                      setGifStartFolds(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    disabled={generatingGif}
                    style={{
                      width: "100%",
                      background: generatingGif ? "#1a1a1a" : "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: generatingGif ? "#444" : "#ccc",
                      fontFamily: "inherit",
                      fontSize: 9,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 8,
                      color: "#666",
                      marginBottom: 4,
                    }}
                  >
                    End
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={gifEndFolds}
                    onChange={(e) =>
                      setGifEndFolds(
                        Math.max(0, parseInt(e.target.value) || 500)
                      )
                    }
                    disabled={generatingGif}
                    style={{
                      width: "100%",
                      background: generatingGif ? "#1a1a1a" : "#222",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      color: generatingGif ? "#444" : "#ccc",
                      fontFamily: "inherit",
                      fontSize: 9,
                    }}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={generateAnimatedGif}
              disabled={generatingGif}
              style={{
                marginTop: 8,
                background: generatingGif ? "#333" : "#222",
                border: "1px solid #444",
                padding: "8px 16px",
                color: generatingGif ? "#666" : "#aaa",
                fontFamily: "inherit",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: generatingGif ? "wait" : "pointer",
                width: "100%",
                opacity: generatingGif ? 0.6 : 1,
              }}
            >
              {generatingGif
                ? `Generating GIF... ${gifProgress}%`
                : `Generate Animated GIF (${gifStartFolds}-${gifEndFolds} folds)`}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                    setColGap(Math.floor(Math.random() * 10) - 2); // Allow -2 to 7
                    setRowGap(Math.floor(Math.random() * 10) - 2); // Allow -2 to 7
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
            </div>

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
                  Show crease lines
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
                    checked={showCellOutlines}
                    onChange={(e) => setShowCellOutlines(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#666" }}
                  />
                  Show cell outlines
                </label>
              </div>
            </div>

            <button
              onClick={() => setShowBatchMode(true)}
              style={{
                marginTop: 8,
                background: "#222",
                border: "1px solid #444",
                padding: "10px 16px",
                color: "#aaa",
                fontFamily: "inherit",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Batch Explorer
            </button>
          </div>
        </div>
      </div>

      {showBatchMode && (
        <BatchMode
          folds={folds}
          width={width}
          height={height}
          onSelectSeed={setSeed}
          onClose={() => setShowBatchMode(false)}
        />
      )}
    </div>
  );
}
