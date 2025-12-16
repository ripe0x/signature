'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ArtworkCanvas } from '@/components/artwork/ArtworkCanvas';
import { useMintWindow } from '@/hooks/useMintWindow';
import { useTokenStats } from '@/hooks/useTokenStats';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const { isActive, foldId } = useMintWindow();
  const { nftsMinted, foldCount } = useTokenStats();

  // Generate a seed for the hero artwork
  // Use current fold if active, otherwise use a featured seed
  const [heroSeed, setHeroSeed] = useState(12345);

  useEffect(() => {
    // If there's an active window, generate seed from fold info
    if (isActive && foldId > 0) {
      setHeroSeed(foldId * 1000000 + Date.now() % 1000);
    } else {
      // Use a deterministic featured seed
      setHeroSeed(42069);
    }
  }, [isActive, foldId]);

  return (
    <div className="min-h-screen pt-20">
      {/* Hero Section */}
      <section className="px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Artwork */}
            <div className="order-1 lg:order-1">
              <div className="relative aspect-[4/5] max-w-lg mx-auto lg:max-w-none">
                <ArtworkCanvas
                  seed={heroSeed}
                  width={800}
                  height={1000}
                  className="w-full"
                />
                {isActive && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 bg-foreground text-background text-xs">
                    live / fold #{foldId}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="order-2 lg:order-2 space-y-8">
              <div className="space-y-6">
                <p className="text-lg md:text-xl leading-relaxed text-muted">
                  less is an onchain artwork about what remains when a system keeps taking things away
                </p>

                <p className="text-sm leading-relaxed">
                  a generative collection built on a recursive strategy token.
                  supply goes down. art comes out.
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-12 text-sm">
                <div>
                  <div className="text-muted mb-1">minted</div>
                  <div className="text-2xl">{nftsMinted}</div>
                </div>
                <div>
                  <div className="text-muted mb-1">folds</div>
                  <div className="text-2xl">{foldCount}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-4">
                {isActive ? (
                  <Link href="/mint">
                    <Button size="lg">
                      mint now
                    </Button>
                  </Link>
                ) : (
                  <Link href="/mint">
                    <Button variant="outline" size="lg">
                      view mint
                    </Button>
                  </Link>
                )}
                <Link href="/collection">
                  <Button variant="outline" size="lg">
                    view collection
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Concept Preview */}
      <section className="px-6 md:px-8 py-12 md:py-20 border-t border-border">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-lg">how it works</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div className="space-y-2">
              <div className="text-muted">01</div>
              <div>the recursive token burns itself over time</div>
            </div>
            <div className="space-y-2">
              <div className="text-muted">02</div>
              <div>each burn opens a 30-minute mint window</div>
            </div>
            <div className="space-y-2">
              <div className="text-muted">03</div>
              <div>one mint per address per window</div>
            </div>
          </div>

          <div className="pt-4">
            <Link href="/about" className="text-sm text-muted hover:text-foreground transition-colors">
              learn more →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
