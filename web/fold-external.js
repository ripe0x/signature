// External-only functions for fold-core.js
// These are NOT needed for on-chain rendering, only for React/external app integration
// Keeping them separate reduces on-chain bundle size

import {
  renderToCanvas,
  extractCharacterData,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
  FONT_STACK,
  ONCHAIN_FONT_NAME,
  ONCHAIN_FONT_DATA_URI,
} from './fold-core.js';

// Re-export everything from fold-core for convenience
export * from './fold-core.js';

// Font loading state
let fontLoaded = false;

/**
 * Load font for external use (React apps, etc.)
 * On-chain rendering uses loadOnChainFont internally
 */
export async function loadFont() {
  if (fontLoaded) return true;

  if (!ONCHAIN_FONT_DATA_URI) return false;

  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: '${ONCHAIN_FONT_NAME}';
      src: url('${ONCHAIN_FONT_DATA_URI}');
    }
  `;
  document.head.appendChild(style);

  try {
    await document.fonts.load(`12px ${ONCHAIN_FONT_NAME}`);
    await document.fonts.ready;
    fontLoaded = true;
    return true;
  } catch (err) {
    console.warn("Failed to load font:", err);
    return false;
  }
}

// Secret mode state for keyboard-activated features
let _secretShowFoldLines = false;
let _secretAnimating = false;
let _secretAnimationFold = 0;
let _secretAnimationMode = null;
let _secretAnimationTimer = null;
let _keyboardFeaturesCleanup = null;

/**
 * Set up keyboard features for any canvas/state combination
 * Shift+F: Toggle fold lines and intersection points
 * Shift+A: Animate from 0 to current fold count (full render)
 * Shift+L: Animate from 0 to current fold count (lines only)
 * Escape: Cancel animation
 */
export function setupKeyboardFeatures(canvas, getState, options = {}) {
  const { onRender, getDimensions } = options;

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

    if (e.shiftKey && e.key === "F") {
      e.preventDefault();
      _secretShowFoldLines = !_secretShowFoldLines;
      if (!_secretAnimating) {
        render();
      }
    }

    if (e.shiftKey && e.key === "A") {
      e.preventDefault();
      if (_secretAnimating) {
        stopAnimation();
      }
      startAnimation("full");
    }

    if (e.shiftKey && e.key === "L") {
      e.preventDefault();
      if (_secretAnimating) {
        stopAnimation();
      }
      startAnimation("lines-only");
    }

    if (e.key === "Escape" && _secretAnimating) {
      e.preventDefault();
      stopAnimation();
    }
  }

  document.addEventListener("keydown", handleKeydown);

  _keyboardFeaturesCleanup = () => {
    document.removeEventListener("keydown", handleKeydown);
    stopAnimation();
    _keyboardFeaturesCleanup = null;
  };

  return _keyboardFeaturesCleanup;
}

// Calculate optimal canvas dimensions based on screen size
function getOptimalDimensions() {
  const dpr = window.devicePixelRatio || 1;
  const screenW = window.innerWidth || REFERENCE_WIDTH;
  const screenH = window.innerHeight || REFERENCE_HEIGHT;

  const aspectRatio = 1 / Math.sqrt(2);

  let width, height;
  if (screenW / screenH > aspectRatio) {
    height = screenH;
    width = Math.floor(height * aspectRatio);
  } else {
    width = screenW;
    height = Math.floor(width / aspectRatio);
  }

  width = Math.max(width, 100);
  height = Math.max(height, 141);

  const renderWidth = Math.floor(width * dpr);
  const renderHeight = Math.floor(height * dpr);

  return { width, height, renderWidth, renderHeight, dpr };
}

/**
 * Render artwork with state to a canvas element
 * Used by external apps and test tools
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

  let dims;
  if (width && height) {
    const targetRatio = REFERENCE_WIDTH / REFERENCE_HEIGHT;
    const givenRatio = width / height;
    let renderWidth, renderHeight;
    if (givenRatio > targetRatio) {
      renderHeight = height;
      renderWidth = Math.round(height * targetRatio);
    } else {
      renderWidth = width;
      renderHeight = Math.round(width / targetRatio);
    }
    dims = { renderWidth, renderHeight, width, height };
  } else {
    dims = getOptimalDimensions();
  }

  const actualFolds =
    foldOverride !== undefined ? foldOverride : state.foldCount;

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

  const ctx = canvas.getContext("2d");
  const dpr = 2;

  canvas.width = dims.width * dpr;
  canvas.height = dims.height * dpr;
  canvas.style.width = dims.width + "px";
  canvas.style.height = dims.height + "px";

  ctx.fillStyle = state.params.palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = ((dims.width - dims.renderWidth) / 2) * dpr;
  const offsetY = ((dims.height - dims.renderHeight) / 2) * dpr;

  ctx.drawImage(
    srcCanvas,
    offsetX,
    offsetY,
    dims.renderWidth * dpr,
    dims.renderHeight * dpr
  );

  if (
    typeof window !== "undefined" &&
    typeof window.scaleCanvas === "function"
  ) {
    window.scaleCanvas();
  }

  return { dataUrl, settings };
}

// Interactive CSS (shared with fold-core.js)
const INTERACTIVE_CSS = `
  .fold-char {
    cursor: grab;
    transition: filter 0.1s ease;
  }
  .fold-char:hover {
    filter: brightness(1.1);
  }
  .fold-char.dragging {
    cursor: grabbing;
    z-index: 1000;
    filter: brightness(1.2);
  }
  .fold-char.editing::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
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

function injectInteractiveCSS() {
  if (document.getElementById("fold-interactive-css")) return;
  const style = document.createElement("style");
  style.id = "fold-interactive-css";
  style.textContent = INTERACTIVE_CSS;
  document.head.appendChild(style);
}

/**
 * Render interactive artwork to a container element
 * Used by React apps and external integrations
 */
export function renderInteractiveToContainer(container, state, options = {}) {
  const { width, height } = options;

  injectInteractiveCSS();

  container.innerHTML = "";
  container.style.position = "relative";
  container.style.overflow = "hidden";

  const rect = container.getBoundingClientRect();
  const renderWidth = width || rect.width;
  const renderHeight = height || rect.height;

  const visualCanvas = document.createElement("canvas");
  visualCanvas.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
  container.appendChild(visualCanvas);

  const params = state.params;
  const result = renderToCanvas({
    folds: params.folds,
    seed: state.seed,
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
    analyticsMode: params.analyticsMode,
  });

  visualCanvas.width = result.canvas.width;
  visualCanvas.height = result.canvas.height;
  const ctx = visualCanvas.getContext("2d");
  ctx.drawImage(result.canvas, 0, 0);

  const charLayer = document.createElement("div");
  charLayer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${renderWidth}px;
    height: ${renderHeight}px;
    overflow: hidden;
    transform-origin: top left;
    transform: scale(${rect.width / renderWidth}, ${rect.height / renderHeight});
  `;
  container.appendChild(charLayer);

  const charData = extractCharacterData(state, renderWidth, renderHeight);

  const localState = {
    container,
    visualCanvas,
    charLayer,
    charElements: [],
    textBuffer: [],
    originalPositions: new Map(),
    hiddenInput: null,
    isEditing: false,
    cursorIndex: -1,
    charData,
    state,
    renderWidth,
    renderHeight,
  };

  charData.characters.forEach((char, index) => {
    const el = document.createElement("div");
    el.className = "fold-char";
    el.dataset.index = index;
    el.style.cssText = `
      position: absolute;
      left: ${char.x}px;
      top: ${char.y}px;
      width: ${char.width}px;
      height: ${char.height}px;
      user-select: none;
      background: transparent;
    `;
    charLayer.appendChild(el);
    localState.charElements.push(el);

    const editChar = char.editChar || char.char.charAt(0);
    const numChars = char.numChars || char.char.length;

    localState.textBuffer.push({
      el,
      char: editChar,
      originalChar: editChar,
      displayChar: char.char,
      numChars,
      row: char.row,
      col: char.col,
      color: char.color,
      fontSize: char.fontSize,
      x: char.x,
      y: char.y,
      width: char.width,
      height: char.height,
      step: char.step,
      charWidth: char.charWidth,
    });
    localState.originalPositions.set(el, {
      left: char.x,
      top: char.y,
      char: char.char,
      editChar,
      numChars,
    });
  });

  const hiddenInput = document.createElement("input");
  hiddenInput.style.cssText = "position:absolute;left:-9999px;opacity:0;";
  document.body.appendChild(hiddenInput);
  localState.hiddenInput = hiddenInput;

  const dragState = {
    isDragging: false,
    target: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  const canvasCtx = visualCanvas.getContext("2d");
  const canvasScale = visualCanvas.width / renderWidth;
  const bgColor = charData.background.color;

  const redrawCanvas = (skipEditingCell = false) => {
    const skipCells = new Set();
    for (let i = 0; i < localState.textBuffer.length; i++) {
      const entry = localState.textBuffer[i];
      const isEditingThisCell = skipEditingCell && i === localState.cursorIndex;
      if (isEditingThisCell || entry.char !== entry.originalChar) {
        skipCells.add(`${entry.col},${entry.row}`);
      }
    }

    const freshResult = renderToCanvas({
      folds: params.folds,
      seed: state.seed,
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
      analyticsMode: params.analyticsMode,
      skipCells: skipCells.size > 0 ? skipCells : null,
    });
    canvasCtx.drawImage(freshResult.canvas, 0, 0);

    for (let i = 0; i < localState.textBuffer.length; i++) {
      const entry = localState.textBuffer[i];
      const isEditingThisCell = skipEditingCell && i === localState.cursorIndex;

      if (
        !isEditingThisCell &&
        entry.char !== entry.originalChar &&
        entry.char.trim() !== ""
      ) {
        const scaledFontSize = entry.fontSize * canvasScale;
        canvasCtx.font = `${scaledFontSize}px ${FONT_STACK}`;
        canvasCtx.fillStyle = entry.color;
        canvasCtx.textAlign = "center";
        canvasCtx.textBaseline = "middle";
        const centerX = (entry.x + entry.width / 2) * canvasScale;
        const centerY = (entry.y + entry.height / 2) * canvasScale;
        canvasCtx.fillText(entry.char, centerX, centerY);
        canvasCtx.textAlign = "left";
        canvasCtx.textBaseline = "top";
      }
    }
  };

  const showCharInElement = (entry, char) => {
    entry.el.textContent = char;
    entry.el.style.color = entry.color;
    entry.el.style.fontSize = entry.fontSize + "px";
    entry.el.style.fontFamily = FONT_STACK;
    entry.el.style.lineHeight = "1";
    entry.el.style.whiteSpace = "pre";
  };

  const hideElement = (entry) => {
    entry.el.textContent = "";
    entry.el.style.color = "";
    entry.el.style.fontSize = "";
  };

  const restoreCurrentCell = () => {
    if (
      localState.cursorIndex >= 0 &&
      localState.cursorIndex < localState.textBuffer.length
    ) {
      const entry = localState.textBuffer[localState.cursorIndex];
      hideElement(entry);
      entry.el.classList.remove("editing");
      redrawCanvas();
    }
  };

  const updateCursorHighlight = () => {
    localState.charElements.forEach((el) => {
      el.classList.remove("editing");
      el.style.color = "";
    });
    if (
      localState.cursorIndex >= 0 &&
      localState.cursorIndex < localState.charElements.length
    ) {
      const entry = localState.textBuffer[localState.cursorIndex];
      if (entry) {
        entry.el.textContent = "";
        entry.el.style.color = entry.color;
      }
      localState.charElements[localState.cursorIndex].classList.add("editing");
      redrawCanvas(true);
    }
  };

  const startEditing = (index) => {
    localState.isEditing = true;
    localState.cursorIndex = index;
    const entry = localState.textBuffer[index];
    if (entry) {
      entry.el.textContent = "";
    }
    redrawCanvas(true);
    updateCursorHighlight();
    hiddenInput.focus();
  };

  const stopEditing = () => {
    if (
      localState.cursorIndex >= 0 &&
      localState.cursorIndex < localState.textBuffer.length
    ) {
      const entry = localState.textBuffer[localState.cursorIndex];
      hideElement(entry);
      entry.el.classList.remove("editing");
    }
    localState.isEditing = false;
    localState.cursorIndex = -1;
    hiddenInput.blur();
    redrawCanvas();
  };

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
      const entry = localState.textBuffer[replaceAt];
      entry.char = typed[i];
      showCharInElement(entry, typed[i]);
    }
    const newIndex = Math.min(
      localState.cursorIndex + typed.length,
      localState.textBuffer.length - 1
    );
    if (newIndex !== localState.cursorIndex) {
      const prevEntry = localState.textBuffer[localState.cursorIndex];
      hideElement(prevEntry);
      redrawCanvas();
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
    } else if (
      e.key === "ArrowRight" &&
      localState.cursorIndex < localState.textBuffer.length - 1
    ) {
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
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const entry = localState.textBuffer[localState.cursorIndex];
      if (entry.char !== entry.originalChar && entry.char.trim() !== "") {
        entry.char = entry.originalChar;
      } else {
        entry.char = " ";
      }
      hideElement(entry);
      redrawCanvas(true);
      if (e.key === "Backspace" && localState.cursorIndex > 0) {
        localState.cursorIndex--;
        updateCursorHighlight();
      }
    }
  };

  const onBlur = () => {
    setTimeout(() => {
      if (!hiddenInput.matches(":focus")) stopEditing();
    }, 100);
  };

  charLayer.addEventListener("mousedown", onMouseDown);
  charLayer.addEventListener("dblclick", onDblClick);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  hiddenInput.addEventListener("input", onTextInput);
  hiddenInput.addEventListener("keydown", onKeyDown);
  hiddenInput.addEventListener("blur", onBlur);

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
