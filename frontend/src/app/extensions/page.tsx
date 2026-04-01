'use client';

import Link from 'next/link';
import { ExtensionsGrid } from '@/components/extensions/ExtensionsGrid';
import { useExtensions } from '@/hooks/useExtensions';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ExtensionsPage() {
  const { tokens, isLoading, configured } = useExtensions();

  return (
    <div className="min-h-screen pt-20 lg:pt-28">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 space-y-2">
            <h1 className="text-2xl">extensions</h1>
            <p className="text-sm text-muted">
              a series of 1/1 works auctioned in $LESS
            </p>
          </div>

          {!configured && (
            <div className="border border-border p-4 text-sm text-muted mb-8">
              extensions contract not configured yet
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : (
            <ExtensionsGrid items={tokens} />
          )}

          <div className="mt-12 text-sm text-muted">
            <Link href="/" className="hover:underline">
              ← back to LESS
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
