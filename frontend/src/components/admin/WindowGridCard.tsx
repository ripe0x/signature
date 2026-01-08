'use client';

import { useState } from 'react';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

interface WindowGridCardProps {
  windowCount: number;
}

export function WindowGridCard({ windowCount }: WindowGridCardProps) {
  const [windowId, setWindowId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridUrl, setGridUrl] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);

  const handleGenerate = async () => {
    const id = parseInt(windowId, 10);
    if (isNaN(id) || id < 0) {
      setError('Please enter a valid window ID');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGridUrl(null);
    setTokenCount(null);

    try {
      // Fetch leaderboard to get token IDs for this window (cache-bust to get fresh data)
      const leaderboardRes = await fetch(`${IMAGE_API_URL}/api/leaderboard?t=${Date.now()}`);
      if (!leaderboardRes.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }
      const leaderboard = await leaderboardRes.json();

      // Extract all token IDs for the specified window
      const tokenIds: number[] = [];
      for (const collector of leaderboard.collectors) {
        for (const token of collector.tokens) {
          if (token.windowId === id) {
            tokenIds.push(token.tokenId);
          }
        }
      }

      if (tokenIds.length === 0) {
        throw new Error(`No tokens found for window ${id}`);
      }

      // Sort token IDs
      tokenIds.sort((a, b) => a - b);
      setTokenCount(tokenIds.length);

      // Build the grid URL (with cache-bust)
      const gridUrlStr = `${IMAGE_API_URL}/api/grid?tokenIds=${tokenIds.join(',')}&cellWidth=300&cellHeight=424&t=${Date.now()}`;
      setGridUrl(gridUrlStr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate grid');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!gridUrl) return;

    try {
      const response = await fetch(gridUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `window-${windowId}-grid.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download image');
    }
  };

  return (
    <div className="border border-border p-6 space-y-6">
      <div>
        <h2 className="text-lg font-medium">window grid generator</h2>
        <p className="text-sm text-muted mt-1">generate a grid image of all tokens from a window</p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            type="number"
            placeholder="Window ID"
            value={windowId}
            onChange={(e) => {
              setWindowId(e.target.value);
              setGridUrl(null);
              setError(null);
            }}
            min={0}
            max={windowCount}
            className="flex-1 border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-foreground"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !windowId}
            className="border border-border px-4 py-2 text-sm hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'generating...' : 'generate'}
          </button>
        </div>

        {windowCount > 0 && (
          <p className="text-xs text-muted">
            current window count: {windowCount} (window IDs: 0-{windowCount})
          </p>
        )}

        <p className="text-xs text-muted/70">
          note: uses cached leaderboard data. run the indexer above if tokens are missing.
        </p>

        {error && (
          <div className="text-sm p-3 border border-red-500/50 bg-red-500/10 text-red-500">
            {error}
          </div>
        )}

        {gridUrl && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              {tokenCount} tokens found in window {windowId}
            </div>

            {/* Preview */}
            <div className="border border-border p-2 bg-foreground/5">
              <img
                src={gridUrl}
                alt={`Window ${windowId} grid`}
                className="w-full h-auto"
                loading="lazy"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                download png
              </button>
              <a
                href={gridUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 border border-border px-4 py-2 text-sm text-center hover:bg-foreground hover:text-background transition-colors"
              >
                open in new tab
              </a>
            </div>

            {/* Copy URL */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(gridUrl);
              }}
              className="w-full border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:border-foreground transition-colors"
            >
              copy image url
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
