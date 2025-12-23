"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || "https://fold-image-api.fly.dev";
const BASE_URL = "https://less.ripe.wtf";

interface WindowSummary {
  windowId: number;
  tokenIds: number[];
  mintCount: number;
}

// Calculate optimal grid dimensions
function calculateGridDimensions(count: number) {
  if (count === 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  if (count <= 16) return { cols: 4, rows: 4 };
  if (count <= 20) return { cols: 5, rows: 4 };
  if (count <= 25) return { cols: 5, rows: 5 };
  if (count <= 30) return { cols: 6, rows: 5 };
  if (count <= 36) return { cols: 6, rows: 6 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

// Format window end summary tweet
function formatWindowEndTweet(windowId: number, mintCount: number, tokenIds: number[]) {
  const tokenRange =
    tokenIds.length > 0
      ? tokenIds.length === 1
        ? `token #${tokenIds[0]}`
        : `tokens #${tokenIds[0]}-#${tokenIds[tokenIds.length - 1]}`
      : "no tokens";

  return `window ${windowId} closed

${mintCount} mint${mintCount !== 1 ? "s" : ""} during this window
${tokenRange}

${BASE_URL}/collection`;
}

export default function TestWindowSummary() {
  const [summary, setSummary] = useState<WindowSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridImageUrl, setGridImageUrl] = useState<string | null>(null);
  const [creatingGrid, setCreatingGrid] = useState(false);

  const fetchWindowSummary = async (windowId?: number) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setGridImageUrl(null);

    try {
      const url = windowId
        ? `/api/window-summary?windowId=${windowId}`
        : "/api/window-summary";
      const response = await fetch(url);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch window summary");
      }

      const data: WindowSummary = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const createGridImage = async () => {
    if (!summary || summary.tokenIds.length === 0) {
      return;
    }

    setCreatingGrid(true);
    setGridImageUrl(null);

    try {
      // Use image-api grid endpoint for fast server-side generation
      const tokenIdsParam = summary.tokenIds.join(',');
      const gridUrl = `${IMAGE_API_URL}/api/grid?tokenIds=${tokenIdsParam}&cellWidth=300&cellHeight=424`;
      
      const response = await fetch(gridUrl);
      if (!response.ok) {
        throw new Error(`Failed to generate grid: ${response.statusText}`);
      }

      const blob = await response.blob();
      const dataUrl = URL.createObjectURL(blob);
      setGridImageUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create grid image");
    } finally {
      setCreatingGrid(false);
    }
  };

  useEffect(() => {
    if (summary && summary.tokenIds.length > 0) {
      createGridImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const tweetText = summary
    ? formatWindowEndTweet(summary.windowId, summary.mintCount, summary.tokenIds)
    : "";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Window Summary Test</h1>
          <Link
            href="/"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Back
          </Link>
        </div>

        <div className="space-y-4">
          <div className="flex gap-4">
            <button
              onClick={() => fetchWindowSummary()}
              disabled={loading}
              className="px-4 py-2 bg-foreground text-background hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Random Window (2-10)"}
            </button>
            <input
              type="number"
              placeholder="Window ID"
              min="1"
              className="px-4 py-2 border border-border bg-background"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const windowId = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(windowId) && windowId > 0) {
                    fetchWindowSummary(windowId);
                  }
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector("input[type='number']") as HTMLInputElement;
                const windowId = parseInt(input?.value || "0", 10);
                if (!isNaN(windowId) && windowId > 0) {
                  fetchWindowSummary(windowId);
                }
              }}
              disabled={loading}
              className="px-4 py-2 border border-border hover:bg-border disabled:opacity-50"
            >
              Load Window
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800">
              {error}
            </div>
          )}

          {summary && (
            <div className="space-y-6">
              <div className="p-6 border border-border space-y-4">
                <h2 className="text-xl font-semibold">
                  Window {summary.windowId}
                </h2>
                <div className="text-sm text-muted">
                  <p>Mint Count: {summary.mintCount}</p>
                  <p>
                    Token IDs:{" "}
                    {summary.tokenIds.length > 0
                      ? summary.tokenIds.length === 1
                        ? `#${summary.tokenIds[0]}`
                        : `#${summary.tokenIds[0]} - #${summary.tokenIds[summary.tokenIds.length - 1]}`
                      : "None"}
                  </p>
                </div>
              </div>

              <div className="p-6 border border-border space-y-4">
                <h2 className="text-xl font-semibold">Tweet Text</h2>
                <div className="p-4 bg-muted font-mono text-sm whitespace-pre-wrap">
                  {tweetText}
                </div>
                <div className="text-xs text-muted">
                  Character count: {tweetText.length}/280
                </div>
              </div>

              {creatingGrid && (
                <div className="p-4 bg-muted text-center">
                  Creating grid image...
                </div>
              )}

              {gridImageUrl && (
                <div className="p-6 border border-border space-y-4">
                  <h2 className="text-xl font-semibold">Grid Image</h2>
                  <div className="flex justify-center">
                    <img
                      src={gridImageUrl}
                      alt={`Window ${summary.windowId} grid`}
                      className="max-w-full h-auto border border-border"
                    />
                  </div>
                  <div className="text-xs text-muted text-center">
                    <a
                      href={gridImageUrl}
                      download={`window-${summary.windowId}-grid.png`}
                      className="text-foreground hover:underline"
                    >
                      Download Image
                    </a>
                  </div>
                </div>
              )}

              {summary.tokenIds.length > 0 && (
                <div className="p-6 border border-border space-y-4">
                  <h2 className="text-xl font-semibold">Individual Tokens</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {summary.tokenIds.map((tokenId) => (
                      <a
                        key={tokenId}
                        href={`/token/${tokenId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border border-border hover:border-foreground transition-colors"
                      >
                        <img
                          src={`/api/image-proxy?tokenId=${tokenId}&width=400&height=565`}
                          alt={`Token ${tokenId}`}
                          className="w-full aspect-[4/5] object-cover"
                          loading="lazy"
                        />
                        <div className="p-2 text-xs text-center text-muted">
                          #{tokenId}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

