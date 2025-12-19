'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToken } from '@/hooks/useToken';
import { truncateAddress } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

export default function TokenPage() {
  const params = useParams();
  const tokenId = parseInt(params.id as string, 10);

  const {
    id,
    windowId,
    seed,
    owner,
    metadata,
    isLoading,
    error,
  } = useToken(tokenId);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <Skeleton className="aspect-[4/5]" />
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
            <Link href="/collection" className="text-sm mt-4 inline-block hover:underline">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            {/* Artwork - use iframe for full interactivity (Shift+L, Shift+F, etc.) */}
            <div>
              {metadata?.animation_url ? (
                <iframe
                  src={metadata.animation_url}
                  className="w-full aspect-[1/1.414] block bg-background"
                  style={{ border: 'none' }}
                  sandbox="allow-scripts"
                  title="On-chain artwork"
                />
              ) : (
                <div className="w-full aspect-[1/1.414] bg-muted/10 flex items-center justify-center text-xs text-muted">
                  loading...
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl mb-2">LESS #{id}</h1>
                <p className="text-muted">window {windowId}</p>
              </div>

              {/* Concept */}
              <div className="text-sm leading-relaxed text-muted border-l border-border pl-4">
                this piece was generated from the compression points of a specific
                burn event in the LESS recursive token. the folds that led here are
                invisible. you only see where they collided.
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
                    <span className="font-mono text-xs">{seed.slice(0, 18)}...</span>
                  </div>

                </div>
              </div>

              {/* External Links */}
              <div className="flex gap-4 pt-4">
                <a
                  href={`https://etherscan.io/token/CONTRACT_ADDRESS?a=${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  etherscan →
                </a>
                <a
                  href={`https://opensea.io/assets/ethereum/CONTRACT_ADDRESS/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  opensea →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
