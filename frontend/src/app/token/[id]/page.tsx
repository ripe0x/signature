"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState, useMemo } from "react";
import { useEnsName } from "wagmi";
import { useToken } from "@/hooks/useToken";
import { truncateAddress } from "@/lib/utils";
import { CONTRACTS } from "@/lib/contracts";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";
import { renderToCanvas, REFERENCE_WIDTH, REFERENCE_HEIGHT } from "@/lib/fold-core-wrapper";

// Font for download rendering (must match on-chain font)
const FOLD_FONT_NAME = "FoldMono";
const FOLD_FONT_DATA_URI = "data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAAOIAA4AAAAADAQAAAM2AAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhYbEBwmBmAAPBEQCo9sjiABNgIkAwwLDAAEIAWCfAcgGzkKIK4GbGOy2GicLj5u8RpRKYyZuIy26Oe9GkG0llXPQhAUoVLRQOiIjYYnUuLluRfqlUh8nv35d3DbeacPRpI7wLzuWl2XGTr+R4rdqk48ecPEg8A0wvynUz9VJ0gGYLd1C/5xl7xv3SZnBWzBGr8QtP8P9KU3gF/4v///XtV/LeBjv+MBmzYJYqG96Ce0h6/5XmbHBNnLAlygYMFqXKAK1bYRcgkLxgZhXaf627YE6gFJIBcCteo1AuwbDBChbA4tEHHa8CDi2utCBABSXokNorp4phkhurc/Cdkmqp0bWqrKalIqUp4jaAbAzD4U5MOrPfX1JpR/yDVAQLZF3YE+VCRkaEcRaEc1Bkq5kJLE/gHUNnm3+zdMKK9aMhR+h189BajFT9I/lJ0BIAcwLMQ2l3Yj73wvYnyWbjmo3XbjJ0eY8W5h/BrjMzLJ2VlnUo3PYuKqtuQN3OLm3X+/upK1DTdwjZsDyUyqec6GEF09syI3F92yUZdMJ62DE7XK6uCueMYse9occDNSOJk2TzuvAA1ohsS27Vw8Tqt1nSmHabjbFnGndFO5K3PzpJ4CUz1JBorMmHHLdmQwBHRTnMkKhQ2QvVOwlGW8DcP5FqbrJJvdjsuaDB97D7UPuQfMWVxWiURGZPMptIkVhKEJKCNQDIyTFKlyZLbV+p53gX4egWr7bX73rYYTy+fRt6NAzImHc31/acg9fC0EFH1/obMyd7VtOx4JfU3acYK4OL1wfhzUFbtqf+2dJ+YG3K/voIAkorej7to5G4ZgZG5J17dlDgasZyO9xT2bOM2geuh5N335H/05CBAo+D8a3teHrs9kVYNvlTICfznXj/qG+mEqQY0AQfnnlyCvvGfUD0jWq5FXOCj0rhgQshT513IJVZZQRF6DIzii0KmJkkZPKLNkNZ7LUKHHe3ulrkb3x2Kgo2PDk1VXwRPT09UzttAnIRgd6m8KBWMNkbgGj19b25mmG2vqxkaEs7LdVDE0VVGmSeKcTHfjguaJm3smpWsmdnzBsDSJIzDqMKW8o1bEecw0dHS0TGzyS4Z6n9NTNSaXDzlPw2BeyPLakJQRk0Wx9HurZUEAAA==";

// Toggle to show 3-column comparison layout (local, on-chain, image-api)
const TEST_MODE = false;

export default function TokenPage() {
  const params = useParams();
  const tokenId = parseInt(params.id as string, 10);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { id, windowId, seedNumber, owner, metadata, isLoading, error } =
    useToken(tokenId);

  const { data: ensName } = useEnsName({
    address: owner as `0x${string}` | undefined,
  });

  // Use local viewer for same-origin access to _interactiveState
  const localViewerUrl = useMemo(() => {
    if (!seedNumber || windowId === undefined) return undefined;
    return `/interactive-viewer.html?seed=${seedNumber}&foldCount=${windowId}`;
  }, [seedNumber, windowId]);

  const handleDownloadPNG = async () => {
    if (!seedNumber || !windowId || isDownloading) return;

    setIsDownloading(true);
    try {
      // Create offscreen canvas at high resolution (2x reference size)
      const DOWNLOAD_SCALE = 2;
      const width = REFERENCE_WIDTH * DOWNLOAD_SCALE; // 2400px
      const height = REFERENCE_HEIGHT * DOWNLOAD_SCALE; // 3394px

      // Create final canvas at exact download size
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Render base artwork at exact target dimensions
      const tempCanvas = document.createElement("canvas");
      await renderToCanvas(tempCanvas, seedNumber, width, height, windowId);
      ctx.drawImage(tempCanvas, 0, 0, width, height);

      // Overlay edited characters from iframe state
      try {
        const iframe = iframeRef.current;
        const iframeWindow = iframe?.contentWindow as any;
        const state = iframeWindow?._interactiveState;

        // Find edited characters (where char differs from originalChar)
        const editedChars = state?.textBuffer?.filter((entry: any) =>
          entry.char !== entry.originalChar
        ) || [];

        if (editedChars.length > 0 && state?.renderWidth && state?.renderHeight) {
          // Load the FoldMono font
          const font = new FontFace(FOLD_FONT_NAME, `url(${FOLD_FONT_DATA_URI})`);
          await font.load();
          document.fonts.add(font);

          // Scale from iframe's artwork dimensions to download dimensions
          const scaleX = width / state.renderWidth;
          const scaleY = height / state.renderHeight;

          // Draw only edited characters on top of base artwork
          for (const entry of editedChars) {
            // First, clear the area with background color
            const bgColor = state.state?.params?.palette?.bg || '#ffffff';
            ctx.fillStyle = bgColor;
            ctx.fillRect(
              entry.x * scaleX,
              entry.y * scaleY,
              entry.width * scaleX,
              entry.height * scaleY
            );

            // Then draw the new character
            const text = entry.char;
            if (!text || !text.trim()) continue;

            const fontSize = entry.fontSize * scaleX;
            const x = (entry.x + entry.width / 2) * scaleX;
            const y = (entry.y + entry.height / 2) * scaleY;

            ctx.font = `${fontSize}px "${FOLD_FONT_NAME}", "Courier New", monospace`;
            ctx.fillStyle = entry.color;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x, y);
          }
        }
      } catch (e) {
        console.log("Could not access iframe state for character overlay:", e);
      }

      // Download the canvas
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `LESS-${id}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (error) {
      console.error("Error downloading PNG:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 lg:pt-28">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <Skeleton className="aspect-[1/1.414]" />
              <div className="space-y-6">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !id) {
    return (
      <div className="min-h-screen pt-20 lg:pt-28">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto text-center py-20">
            <p className="text-muted">token not found</p>
            <Link
              href="/collection"
              className="text-sm mt-4 inline-block hover:underline"
            >
              ← back to collection
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Back link */}
          <Link
            href="/collection"
            className="text-sm text-muted hover:text-foreground transition-colors inline-block mb-8"
          >
            ← collection
          </Link>

          {/* Artwork display */}
          {TEST_MODE ? (
            /* Test mode: side by side comparison (full width) */
            <div className="grid grid-cols-3 gap-6 mb-12">
              {/* Local render */}
              <div>
                <div className="text-xs text-muted mb-2">local</div>
                <div className="aspect-[1/1.414]">
                  {seedNumber > 0 ? (
                    <ArtworkCanvas
                      seed={seedNumber}
                      foldCount={windowId}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted/10 flex items-center justify-center text-xs text-muted">
                      loading...
                    </div>
                  )}
                </div>
              </div>

              {/* On-chain render */}
              <div>
                <div className="text-xs text-muted mb-2 flex justify-between items-center">
                  <span>on-chain</span>
                  {metadata?.animation_url && (
                    <a
                      href={metadata.animation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground transition-colors"
                      title="Open fullscreen"
                    >
                      fullscreen →
                    </a>
                  )}
                </div>
                <div className="aspect-[1/1.414]">
                  {metadata?.animation_url ? (
                    <iframe
                      src={metadata.animation_url}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      title="On-chain artwork"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted/10 flex items-center justify-center text-xs text-muted">
                      loading...
                    </div>
                  )}
                </div>
              </div>

              {/* Image API render */}
              <div>
                <div className="text-xs text-muted mb-2">image-api</div>
                <div className="aspect-[1/1.414] bg-muted/10">
                  <img
                    src={`https://fold-image-api.fly.dev/images/${id}`}
                    alt={`LESS #${id}`}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Production mode: on-chain animation with details side by side */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
              {/* Artwork - left column */}
              <div>
                <div className="aspect-[1/1.414]">
                  {localViewerUrl ? (
                    <iframe
                      ref={iframeRef}
                      src={localViewerUrl}
                      className="w-full h-full border-0"
                      title="Artwork"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted/10 flex items-center justify-center text-xs text-muted">
                      loading...
                    </div>
                  )}
                </div>
              </div>

              {/* Details - right column */}
              <div className="space-y-8">
                <div>
                  <h1 className="text-3xl mb-2">LESS {id}</h1>
                </div>

                {/* Concept */}
                <div className="text-sm leading-relaxed text-muted border-l border-border pl-4">
                  this piece was generated from the compression points the
                  collective creases created during the burn events in the LESS
                  recursive token. the folds that led here are invisible. you
                  only see where they collided.
                </div>

                {/* Metadata */}
                <div className="space-y-4">
                  <h2 className="text-sm text-muted">details</h2>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted">token id</span>
                      <span>{id}</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted">window</span>
                      <Link href={`/window/${windowId}`} className="hover:underline">
                        {windowId}
                      </Link>
                    </div>

                    {owner && (
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted">owner</span>
                        <Link
                          href={`/collector/${owner}`}
                          className="hover:underline"
                        >
                          {ensName || truncateAddress(owner)}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Token Attributes */}
                {metadata?.attributes && metadata.attributes.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-sm text-muted">traits</h2>

                    <div className="grid grid-cols-2 gap-3">
                      {metadata.attributes.map((attr) => (
                        <div
                          key={attr.trait_type}
                          className="border border-border p-3 space-y-1"
                        >
                          <div className="text-xs text-muted">
                            {attr.trait_type}
                          </div>
                          <div className="text-sm">{attr.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* External Links */}
                <div className="flex gap-4 pt-4">
                  <a
                    href={`https://etherscan.io/token/${CONTRACTS.LESS_NFT}?a=${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-foreground transition-colors"
                  >
                    etherscan →
                  </a>
                  <a
                    href={`https://opensea.io/assets/ethereum/${CONTRACTS.LESS_NFT}/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted hover:text-foreground transition-colors"
                  >
                    opensea →
                  </a>
                  <button
                    onClick={handleDownloadPNG}
                    disabled={isDownloading || !seedNumber}
                    className="text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? "downloading..." : "download png"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
