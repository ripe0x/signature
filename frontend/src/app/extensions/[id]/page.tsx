'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useExtensionToken } from '@/hooks/useExtensionToken';
import { ExtensionAuctionPanel } from '@/components/extensions/ExtensionAuctionPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { normalizeTokenUri } from '@/lib/utils';

export default function ExtensionDetailPage() {
  const params = useParams();
  const tokenId = parseInt(params.id as string, 10);

  const { metadata, isLoading, configured } = useExtensionToken(tokenId);

  if (!tokenId || Number.isNaN(tokenId)) {
    return (
      <div className="min-h-screen pt-20 lg:pt-28">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-4xl mx-auto text-center py-20">
            <p className="text-muted">extension not found</p>
            <Link href="/extensions" className="text-sm mt-4 inline-block hover:underline">
              ← back to extensions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/extensions"
            className="text-sm text-muted hover:text-foreground transition-colors inline-block mb-8"
          >
            ← extensions
          </Link>

          {!configured && (
            <div className="border border-border p-4 text-sm text-muted mb-8">
              extensions contract not configured yet
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <Skeleton className="aspect-square" />
              <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-80" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-4">
                <div className="border border-border bg-background aspect-square overflow-hidden">
                  {metadata?.image ? (
                    <img
                      src={normalizeTokenUri(metadata.image)}
                      alt={metadata.name || `Extension #${tokenId}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted">
                      metadata pending
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl mb-2">{metadata?.name || `Extension #${tokenId}`}</h1>
                  <p className="text-sm text-muted">token #{tokenId}</p>
                </div>

                {metadata?.description && (
                  <p className="text-sm text-muted leading-relaxed">{metadata.description}</p>
                )}

                <ExtensionAuctionPanel tokenId={tokenId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
