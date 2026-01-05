'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface CellData {
  row: number;
  col: number;
  editChar: string;
  originalChar: string;
  color: string;
  x: number;
  y: number;
  fontSize: number;
  charWidth: number;
  step: number;
  spanStartIndex: number;
  spanCount: number;
  // Runtime state for editing
  currentChar?: string;
}

interface GridInfo {
  fontSize: number;
  charWidth: number;
  fontFamily: string;
}

interface ArtworkHTMLProps {
  seed: number;
  foldCount?: number;
  className?: string;
  showLoading?: boolean;
  width?: number;
  height?: number;
  interactive?: boolean;
}

export function ArtworkHTML({
  seed,
  foldCount,
  className,
  showLoading = true,
  width = 600,
  height = 849,
  interactive = false,
}: ArtworkHTMLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive state
  const cellDataRef = useRef<CellData[]>([]);
  const gridInfoRef = useRef<GridInfo | null>(null);
  const dprRef = useRef(2);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [isEditing, setIsEditing] = useState(false);

  // Get the artwork container (inside the scale wrapper)
  const getArtworkContainer = useCallback(() => {
    const wrapper = containerRef.current?.querySelector('div');
    return wrapper?.querySelector('.fold-artwork') as HTMLElement | null;
  }, []);

  // Hide/show spans for a cell
  const setCellSpansVisible = useCallback((cellKey: string, visible: boolean) => {
    const artwork = getArtworkContainer();
    if (!artwork) return;

    const spans = artwork.querySelectorAll(`[data-cell="${cellKey}"]`);
    spans.forEach((span) => {
      (span as HTMLElement).style.visibility = visible ? 'visible' : 'hidden';
    });
  }, [getArtworkContainer]);

  // Create or update the replacement character span for a specific cell
  const updateReplacementSpan = useCallback((cell: CellData, char: string) => {
    const artwork = getArtworkContainer();
    if (!artwork || !gridInfoRef.current) return;

    const spanId = `replacement-${cell.col}-${cell.row}`;

    // Remove existing replacement span for this cell
    const existing = artwork.querySelector(`#${spanId}`);
    existing?.remove();

    if (!char || char === ' ') return;

    // Create replacement span
    const span = document.createElement('span');
    span.id = spanId;
    span.className = 'replacement-char';
    span.textContent = char;
    span.style.cssText = `
      position: absolute;
      left: ${cell.x}px;
      top: ${cell.y}px;
      color: ${cell.color};
      font-family: ${gridInfoRef.current.fontFamily};
      font-size: ${gridInfoRef.current.fontSize}px;
      line-height: 1;
      white-space: pre;
    `;
    artwork.appendChild(span);
  }, [getArtworkContainer]);

  // Start editing a cell
  const startEditing = useCallback((index: number) => {
    const cell = cellDataRef.current[index];
    if (!cell) return;

    setEditingIndex(index);
    setIsEditing(true);

    // Hide the cell's original spans
    setCellSpansVisible(`${cell.col},${cell.row}`, false);

    // Show current character (original or edited)
    const currentChar = cell.currentChar ?? cell.editChar;
    updateReplacementSpan(cell, currentChar);

    // Focus hidden input
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 0);
  }, [setCellSpansVisible, updateReplacementSpan]);

  // Stop editing
  const stopEditing = useCallback(() => {
    if (editingIndex >= 0) {
      const cell = cellDataRef.current[editingIndex];
      if (cell) {
        // Keep showing replacement if character was changed
        const currentChar = cell.currentChar ?? cell.editChar;
        if (currentChar !== cell.editChar) {
          // Character was edited - keep replacement visible, spans hidden
          updateReplacementSpan(cell, currentChar);
        } else {
          // No change - restore original spans, remove replacement
          setCellSpansVisible(`${cell.col},${cell.row}`, true);
          const artwork = getArtworkContainer();
          const spanId = `replacement-${cell.col}-${cell.row}`;
          artwork?.querySelector(`#${spanId}`)?.remove();
        }
      }
    }

    setEditingIndex(-1);
    setIsEditing(false);
    hiddenInputRef.current?.blur();
  }, [editingIndex, setCellSpansVisible, updateReplacementSpan, getArtworkContainer]);

  // Handle text input
  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const typed = input.value;
    input.value = '';

    if (!typed || editingIndex < 0) return;

    const cell = cellDataRef.current[editingIndex];
    if (!cell) return;

    // Update cell's current character
    cell.currentChar = typed[0];
    updateReplacementSpan(cell, cell.currentChar);

    // Move to next cell
    const nextIndex = Math.min(editingIndex + 1, cellDataRef.current.length - 1);
    if (nextIndex !== editingIndex) {
      // Finalize current cell
      const currentChar = cell.currentChar;
      if (currentChar !== cell.editChar) {
        // Keep replacement, hide original
        setCellSpansVisible(`${cell.col},${cell.row}`, false);
      } else {
        setCellSpansVisible(`${cell.col},${cell.row}`, true);
      }

      // Start editing next cell
      startEditing(nextIndex);
    }
  }, [editingIndex, updateReplacementSpan, setCellSpansVisible, startEditing]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isEditing || editingIndex < 0) return;

    const cell = cellDataRef.current[editingIndex];
    if (!cell) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      stopEditing();
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (editingIndex > 0) {
        stopEditing();
        startEditing(editingIndex - 1);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (editingIndex < cellDataRef.current.length - 1) {
        stopEditing();
        startEditing(editingIndex + 1);
      }
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const currentChar = cell.currentChar ?? cell.editChar;

      if (currentChar !== cell.originalChar && currentChar !== ' ') {
        // Restore original character
        cell.currentChar = cell.originalChar;
        updateReplacementSpan(cell, cell.originalChar);
      } else {
        // Clear to space
        cell.currentChar = ' ';
        updateReplacementSpan(cell, '');
      }

      // Move to previous cell on Backspace
      if (e.key === 'Backspace' && editingIndex > 0) {
        stopEditing();
        startEditing(editingIndex - 1);
      }
      return;
    }
  }, [isEditing, editingIndex, stopEditing, startEditing, updateReplacementSpan]);

  // Handle double-click to start editing
  const handleDoubleClick = useCallback((e: MouseEvent) => {
    if (!interactive) return;

    const target = e.target as HTMLElement;
    const cellAttr = target.getAttribute('data-cell');
    if (!cellAttr) return;

    const [col, row] = cellAttr.split(',').map(Number);
    const index = cellDataRef.current.findIndex(c => c.col === col && c.row === row);

    if (index >= 0) {
      startEditing(index);
    }
  }, [interactive, startEditing]);

  // Handle blur
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (hiddenInputRef.current && !hiddenInputRef.current.matches(':focus')) {
        stopEditing();
      }
    }, 100);
  }, [stopEditing]);

  // Set up event listeners
  useEffect(() => {
    if (!interactive) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('dblclick', handleDoubleClick);

    return () => {
      container.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [interactive, handleDoubleClick]);

  // Main render effect
  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);
      setEditingIndex(-1);
      setIsEditing(false);

      try {
        // Dynamically import both modules
        const [foldCore, renderModule] = await Promise.all([
          import('@/lib/fold-core.js'),
          import('@/lib/render-to-html.js'),
        ]);

        if (cancelled) return;

        // Generate params (pass null if no foldCount to let it generate one)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = (foldCore as any).generateAllParams(seed, 1200, 1697, 0, foldCount ?? null);

        // Render at 2x resolution to match canvas (which uses dpr=2 internally)
        // Then scale down with CSS transform for display
        const dpr = 2;
        dprRef.current = dpr;
        const renderWidth = width * dpr;
        const renderHeight = height * dpr;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (renderModule as any).renderToHTML({
          folds: params.folds,
          seed: params.seed,
          outputWidth: renderWidth,
          outputHeight: renderHeight,
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

        if (cancelled) return;

        // Store cell data and grid info for interactive editing
        cellDataRef.current = result.cellData || [];
        gridInfoRef.current = result.gridInfo || null;

        // Create wrapper that renders at 2x then scales down to display size
        // This matches canvas behavior (internal 2x buffer, displayed at 1x)
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          width: ${renderWidth}px;
          height: ${renderHeight}px;
          transform: scale(${1/dpr});
          transform-origin: top left;
        `;
        wrapper.innerHTML = result.html;

        // Add cursor style for interactive mode
        if (interactive) {
          const artwork = wrapper.querySelector('.fold-artwork');
          if (artwork) {
            (artwork as HTMLElement).style.cursor = 'text';
          }
        }

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(wrapper);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to render HTML artwork:', err);
        setError(err instanceof Error ? err.message : 'Failed to render');
        setIsLoading(false);
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [seed, foldCount, width, height, interactive]);

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ width, height }}
    >
      <div
        ref={containerRef}
        className={cn(
          'w-full h-full',
          isLoading && showLoading && 'opacity-0'
        )}
      />

      {/* Hidden input for capturing text */}
      {interactive && (
        <input
          ref={hiddenInputRef}
          type="text"
          className="absolute opacity-0 pointer-events-none w-px h-px"
          style={{ left: 0, top: 0 }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      )}

      {isLoading && showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="text-sm text-muted animate-pulse">loading...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}

      {/* Editing indicator */}
      {interactive && isEditing && (
        <div className="absolute top-2 right-2 text-xs text-muted bg-background/80 px-2 py-1 rounded">
          Editing • ESC to exit
        </div>
      )}
    </div>
  );
}
