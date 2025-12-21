"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useToken } from "@/hooks/useToken";
import { truncateAddress } from "@/lib/utils";
import { CONTRACTS } from "@/lib/contracts";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";

// Toggle to show 3-column comparison layout (local, on-chain, image-api)
const TEST_MODE = false;

export default function TokenPage() {
  const params = useParams();
  const tokenId = parseInt(params.id as string, 10);

  const { id, windowId, seed, seedNumber, owner, metadata, isLoading, error } =
    useToken(tokenId);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20">
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
      <div className="min-h-screen pt-20">
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
    <div className="min-h-screen pt-20">
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

              {/* Details - right column */}
              <div className="space-y-8">
                <div>
                  <h1 className="text-3xl mb-2">LESS {id}</h1>
                </div>

                {/* Concept */}
                <div className="text-sm leading-relaxed text-muted border-l border-border pl-4">
                  this piece was generated from the compression points the
                  collective creases created during the burn events in the LESS
                  recursive token. the folds that led here are invisible. you only
                  see where they collided.
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
                      <span>{windowId}</span>
                    </div>

                    {owner && (
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted">owner</span>
                        <a
                          href={`https://etherscan.io/address/${owner}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {truncateAddress(owner)}
                        </a>
                      </div>
                    )}

                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted">seed</span>
                      <span className="font-mono text-xs">
                        {seed.slice(0, 18)}...
                      </span>
                    </div>
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
