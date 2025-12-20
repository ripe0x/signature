"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";
import { useMintWindow } from "@/hooks/useMintWindow";
import { useTokenStats } from "@/hooks/useTokenStats";
import { useEffect, useState, useCallback } from "react";
import { IS_PRE_LAUNCH, IS_TOKEN_LIVE, CONTRACTS } from "@/lib/contracts";

// Generate random seed and fold count
function generateRandom() {
  return {
    seed: Math.floor(Math.random() * 1000000),
    foldCount: Math.floor(Math.random() * 500) + 1,
  };
}

// CGA palette colors
const CGA_PALETTE = [
  "#000000",
  "#0000AA",
  "#00AA00",
  "#00AAAA",
  "#AA0000",
  "#AA00AA",
  "#AA5500",
  "#AAAAAA",
  "#555555",
  "#5555FF",
  "#55FF55",
  "#55FFFF",
  "#FF5555",
  "#FF55FF",
  "#FFFF55",
  "#FFFFFF",
];

// Token-live landing page (token deployed, NFT not yet)
function TokenLiveLanding() {
  const [sample, setSample] = useState({ seed: 42069, foldCount: 100 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSample(generateRandom());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setSample(generateRandom());
    }, 700);
    return () => clearInterval(interval);
  }, [mounted]);

  const loadNew = useCallback(() => {
    setSample(generateRandom());
  }, []);

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-5xl mx-auto space-y-20">
          {/* Hero */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-6">
              <p className="text-lg md:text-xl text-muted leading-relaxed">
                LESS is a networked generative artwork about subtraction. what
                remains when a system keeps taking things away.
              </p>
              <div className="space-y-1">
                <p className="text-sm leading-relaxed">
                  an nft collection built on a recursive strategy token.
                </p>
                <p className="text-sm leading-relaxed">
                  supply goes down. art comes out.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                <a
                  href={`https://www.nftstrategy.fun/strategies/${CONTRACTS.LESS_STRATEGY}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="lg">trade $LESS</Button>
                </a>
                <Button variant="outline" size="lg" disabled>
                  NFT minting starts Sunday 12/21
                </Button>
              </div>
            </div>
            <div className="aspect-[1/1.414]">
              <ArtworkCanvas
                seed={sample.seed}
                foldCount={sample.foldCount}
                onClick={loadNew}
                className="w-full h-full"
              />
              <div className="mt-3 text-xs text-muted text-center">
                {sample.foldCount} folds
              </div>
            </div>
          </section>

          {/* The Art */}
          <section className="space-y-6">
            <h2 className="text-lg">an idea folds in on itself</h2>
            <div className="text-sm leading-relaxed text-muted space-y-4 max-w-2xl">
              <p>
                visually, LESS uses a simple metaphor: a sheet of paper being
                folded again and again.
              </p>
              <p>
                the system simulates folds on a virtual piece of paper. each
                fold leaves an invisible crease. where creases intersect they
                create compression points. the artwork only shows those points.
              </p>
              <p>
                every output is rendered with a strictly limited vocabulary:
                three unicode block characters.
              </p>
              <div className="font-mono text-sm py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg w-4 text-center">&nbsp;</span>
                  <span className="text-muted">blank</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg w-4 text-center">░</span>
                  <span className="text-muted">low</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg w-4 text-center">▒</span>
                  <span className="text-muted">medium</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg w-4 text-center">█</span>
                  <span className="text-muted">high</span>
                </div>
              </div>
              <p>
                the color space is just as constrained. every piece is created
                from the original 16-color CGA palette.
              </p>
              <div className="inline-grid grid-cols-8 border border-border">
                {CGA_PALETTE.map((color) => (
                  <span
                    key={color}
                    className="w-6 h-6"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* $LESS Token */}
          <section className="space-y-6">
            <h2 className="text-lg">$LESS</h2>
            <div className="text-sm leading-relaxed text-muted space-y-4 max-w-2xl">
              <p>
                underneath this project is a{" "}
                <a
                  href="https://www.nftstrategy.fun/strategies/0x9c2ca573009f181eac634c4d6e44a0977c24f335"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-foreground transition-colors underline hover:no-underline"
                >
                  TokenWorks recursive strategy token
                </a>
                . every trade on its uniswap pool pushes a little ETH into a
                contract. over time that pressure is used to buy and burn the
                token itself.
              </p>
              <p>the token is live now. the NFT collection will launch soon.</p>
            </div>
          </section>

          {/* How Minting Works */}
          <section className="space-y-6">
            <h2 className="text-lg">how minting works</h2>
            <div className="space-y-4 text-sm max-w-lg">
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">01</span>
                <span className="text-muted">
                  the $LESS recursive token accumulates ETH from trades
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">02</span>
                <span className="text-muted">
                  when enough ETH builds up, anyone can trigger a buy and burn
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">03</span>
                <span className="text-muted">
                  that burn opens a 90 minute mint window
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">04</span>
                <span className="text-muted">
                  mints are generated from the system state at that moment
                </span>
              </div>
            </div>
          </section>

          {/* The Collection */}
          <section className="space-y-6">
            <h2 className="text-lg">the collection</h2>
            <div className="text-sm leading-relaxed text-muted space-y-4 max-w-2xl">
              <p>
                on top of that machine sits a collection of NFTs. each one is a
                record of a moment when the system chose to remove a part of
                itself.
              </p>
              <p>
                whenever the token buys and burns itself, a mint window opens.
                if someone is there they can mint a piece bound to that burn. if
                nobody is there the burn still happens onchain, it just leaves
                no visible trace in the collection.
              </p>
            </div>
          </section>

          {/* What Remains */}
          <section className="space-y-6 pb-8">
            <h2 className="text-lg">what remains</h2>
            <div className="text-sm leading-relaxed text-muted space-y-4 max-w-2xl">
              <p>
                LESS treats recursion as a way of drawing: the token folds value
                and supply back into itself, and the images are what you get if
                you look only at the intersections of that history.
              </p>
              <p>the system takes away. the art shows what remains.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Standard home page (NFT live or full pre-launch)
function StandardHome() {
  const { isActive, windowId } = useMintWindow();
  const { nftsMinted, windowCount } = useTokenStats();

  const [heroSeed, setHeroSeed] = useState(42069);
  const [heroFoldCount, setHeroFoldCount] = useState(100);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const { seed, foldCount } = generateRandom();
    setHeroSeed(seed);
    setHeroFoldCount(foldCount);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (IS_PRE_LAUNCH) {
      const interval = setInterval(() => {
        const { seed, foldCount } = generateRandom();
        setHeroSeed(seed);
        setHeroFoldCount(foldCount);
      }, 8000);
      return () => clearInterval(interval);
    } else if (isActive && windowId > 0) {
      setHeroSeed(windowId * 1000000 + (Date.now() % 1000));
    }
  }, [mounted, isActive, windowId]);

  const loadNew = useCallback(() => {
    const { seed, foldCount } = generateRandom();
    setHeroSeed(seed);
    setHeroFoldCount(foldCount);
  }, []);

  return (
    <div className="min-h-screen pt-20">
      {/* Hero Section */}
      <section className="px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Artwork */}
            <div className="order-1 lg:order-1">
              <div className="relative max-w-lg mx-auto lg:max-w-none aspect-[1/1.414]">
                <ArtworkCanvas
                  seed={heroSeed}
                  foldCount={heroFoldCount}
                  className="w-full h-full"
                  onClick={IS_PRE_LAUNCH ? loadNew : undefined}
                />
                {!IS_PRE_LAUNCH && isActive && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 bg-foreground text-background text-xs">
                    live / window #{windowId}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="order-2 lg:order-2 space-y-8">
              <div className="space-y-6">
                <p className="text-lg md:text-xl leading-relaxed text-muted">
                  LESS is an onchain artwork about what remains when a system
                  keeps taking things away
                </p>

                <p className="text-sm leading-relaxed">
                  a generative collection built on a recursive strategy token.
                  supply goes down. art comes out.
                </p>
              </div>

              {/* Stats */}
              {!IS_PRE_LAUNCH && (
                <div className="flex gap-12 text-sm">
                  <div>
                    <div className="text-muted mb-1">minted</div>
                    <div className="text-2xl">{nftsMinted}</div>
                  </div>
                  <div>
                    <div className="text-muted mb-1">windows</div>
                    <div className="text-2xl">{windowCount}</div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-4">
                {IS_PRE_LAUNCH ? (
                  <Link href="/about">
                    <Button variant="outline" size="lg">
                      learn more
                    </Button>
                  </Link>
                ) : isActive ? (
                  <Link href="/mint">
                    <Button size="lg">mint now</Button>
                  </Link>
                ) : (
                  <Link href="/mint">
                    <Button variant="outline" size="lg">
                      view mint
                    </Button>
                  </Link>
                )}
                {!IS_PRE_LAUNCH && (
                  <Link href="/collection">
                    <Button variant="outline" size="lg">
                      view collection
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Concept Preview */}
      <section className="px-6 md:px-8 py-12 md:py-20 border-t border-border">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-lg">
            {IS_PRE_LAUNCH ? "how it will work" : "how it works"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div className="space-y-2">
              <div className="text-muted">01</div>
              <div>the recursive token burns itself over time</div>
            </div>
            <div className="space-y-2">
              <div className="text-muted">02</div>
              <div>each burn opens a 90-minute mint window</div>
            </div>
            <div className="space-y-2">
              <div className="text-muted">03</div>
              <div>one mint per address per window</div>
            </div>
          </div>

          <div className="pt-4">
            <Link
              href="/about"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              learn more →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  // Show token-live landing when token is deployed but NFT isn't
  if (IS_TOKEN_LIVE && IS_PRE_LAUNCH) {
    return <TokenLiveLanding />;
  }

  return <StandardHome />;
}
