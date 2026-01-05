'use client';

import { useState, useCallback } from 'react';
import { ArtworkCanvas } from '@/components/artwork/ArtworkCanvas';
import { ArtworkHTML } from '@/components/artwork/ArtworkHTML';

const RENDER_WIDTH = 600;
const RENDER_HEIGHT = 849; // A4 aspect ratio (1:√2)

export default function HTMLRenderTestPage() {
  const [seed, setSeed] = useState(12345);
  const [foldCount, setFoldCount] = useState(100);
  const [inputSeed, setInputSeed] = useState('12345');
  const [inputFolds, setInputFolds] = useState('100');

  const handleRender = useCallback(() => {
    const newSeed = parseInt(inputSeed, 10) || 12345;
    const newFolds = parseInt(inputFolds, 10) || 100;
    setSeed(newSeed);
    setFoldCount(newFolds);
  }, [inputSeed, inputFolds]);

  const handleRandom = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 1000000);
    setInputSeed(String(newSeed));
    setSeed(newSeed);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRender();
    }
  }, [handleRender]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <h1 className="text-2xl mb-2">Canvas vs HTML Render Comparison</h1>
        <p className="text-sm text-muted mb-8">
          Compare canvas rendering with HTML text rendering. The HTML version produces selectable text.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-8 items-center">
          <label className="flex items-center gap-2">
            <span className="text-sm text-muted">Seed:</span>
            <input
              type="text"
              value={inputSeed}
              onChange={(e) => setInputSeed(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-32 px-3 py-2 text-sm bg-muted/20 border border-border rounded focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm text-muted">Folds:</span>
            <input
              type="text"
              value={inputFolds}
              onChange={(e) => setInputFolds(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-24 px-3 py-2 text-sm bg-muted/20 border border-border rounded focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </label>

          <button
            onClick={handleRender}
            className="px-4 py-2 text-sm bg-foreground text-background rounded hover:opacity-90 transition-opacity"
          >
            Render
          </button>

          <button
            onClick={handleRandom}
            className="px-4 py-2 text-sm border border-border rounded hover:bg-muted/20 transition-colors"
          >
            Random Seed
          </button>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Canvas Output */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-muted">Canvas (Original)</h2>
              <span className="text-xs text-muted/60">Not selectable</span>
            </div>
            <div
              className="bg-black rounded overflow-hidden"
              style={{ width: RENDER_WIDTH, height: RENDER_HEIGHT }}
            >
              <ArtworkCanvas
                key={`canvas-${seed}-${foldCount}`}
                seed={seed}
                foldCount={foldCount}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* HTML Output */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-muted">HTML (Interactive)</h2>
              <span className="text-xs text-muted/60">Double-click to edit text!</span>
            </div>
            <div
              className="bg-black rounded overflow-hidden"
              style={{ width: RENDER_WIDTH, height: RENDER_HEIGHT }}
            >
              <ArtworkHTML
                key={`html-${seed}-${foldCount}`}
                seed={seed}
                foldCount={foldCount}
                width={RENDER_WIDTH}
                height={RENDER_HEIGHT}
                interactive
              />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 p-4 bg-muted/10 rounded border border-border">
          <h3 className="text-sm font-medium mb-2">Notes</h3>
          <ul className="text-sm text-muted space-y-1">
            <li>- The HTML output uses absolutely positioned spans for each character</li>
            <li>- Double-click any character to start editing, type to replace</li>
            <li>- Use arrow keys to navigate, Backspace to restore, ESC to exit</li>
            <li>- Minor visual differences may occur due to browser font rendering</li>
            <li>- Both outputs use the same seed-based generation algorithms</li>
          </ul>
        </div>

        {/* Current params */}
        <div className="mt-4 text-xs text-muted/60 font-mono">
          Current: seed={seed}, folds={foldCount}
        </div>
      </div>
    </div>
  );
}
