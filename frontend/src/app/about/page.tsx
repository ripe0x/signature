"use client";

import Link from "next/link";
import { ArtworkCanvas } from "@/components/artwork/ArtworkCanvas";
import { useState, useEffect, useCallback } from "react";

function generateRandom() {
  return {
    seed: Math.floor(Math.random() * 1000000),
    foldCount: Math.floor(Math.random() * 500) + 1,
  };
}

export default function AboutPage() {
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
    }, 6000);
    return () => clearInterval(interval);
  }, [mounted]);

  const loadNew = useCallback(() => {
    setSample(generateRandom());
  }, []);

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="max-w-2xl">
            <p className="text-lg text-muted leading-relaxed">
              LESS is an networked generative artwork about subtraction. what
              remains when a system keeps taking things away.
            </p>
          </div>

          {/* Folding paper - 2 column layout */}
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16">
              {/* Left: Description - 2/3 width */}
              <div className="space-y-4 lg:col-span-2">
                <h2 className="text-lg">an idea folds in on itself</h2>
                <div className="text-sm leading-relaxed text-muted space-y-4">
                  <p>
                    visually, LESS uses a simple metaphor: a sheet of paper
                    being folded again and again.
                  </p>
                  <p>
                    the system simulates folds on a virtual piece of paper. each
                    fold leaves an invisible crease. where creases intersect
                    they create compression points. the artwork only shows those
                    points. every so often, the paper gets unfolded, smoothed
                    out, and folded again.
                  </p>
                  <p>
                    the final artwork is a record of the paper's history, a
                    trace of all the folds and intersections.
                  </p>
                  <p>
                    every output is rendered with a strictly limited vocabulary:
                    three unicode block characters.
                  </p>

                  <div className="font-mono text-sm py-4 grid grid-cols-2 gap-x-6 gap-y-2">
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
                    the color space is just as constrained. every piece is
                    created from the original 16-color CGA palette, the same
                    tiny set of hues early computers had to work with.
                  </p>
                  <div className="inline-grid grid-cols-8 border border-border">
                    {[
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
                    ].map((color) => (
                      <span
                        key={color}
                        className="w-6 h-6"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  {/* <p>
                    most of the field stays light. a few regions grow dense and
                    heavy — places where many folds have passed through the same
                    small space. you never see the folds themselves, only the
                    pressure they leave behind.
                  </p> */}
                </div>
              </div>

              {/* Right: Sample artwork - 1/3 width */}
              <div className="lg:sticky lg:top-24 lg:self-start order-first lg:order-last">
                <ArtworkCanvas
                  seed={sample.seed}
                  foldCount={sample.foldCount}
                  width={600}
                  height={848}
                  onClick={loadNew}
                />
                <div className="mt-3 text-xs text-muted text-center">
                  {sample.foldCount} folds
                </div>
              </div>
            </div>
          </section>

          <div className="max-w-2xl space-y-16">
            <section className="space-y-4">
              <h2 className="text-lg">$LESS</h2>
              <p className="text-sm leading-relaxed text-muted">
                underneath this project is a{" "}
                <Link
                  href="https://www.nftstrategy.fun/strategies/0x9c2ca573009f181eac634c4d6e44a0977c24f335"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-foreground transition-colors underline hover:no-underline"
                >
                  TokenWorks recursive strategy token
                </Link>
                . every trade on its uniswap pool pushes a little eth into a
                contract. over time that pressure is used to buy and burn the
                token itself.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg">the collection</h2>
              <div className="text-sm leading-relaxed text-muted space-y-4">
                <p>
                  on top of that machine sits a collection of nfts. each one is
                  a record of a moment when the system chose to remove a part of
                  itself.
                </p>
                <p>
                  whenever the token buys and burns itself, a short mint window
                  opens. if someone is there they can mint a piece bound to that
                  burn. if nobody is there the burn still happens onchain, it
                  just leaves no visible trace in the collection.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg">what remains</h2>
              <p className="text-sm leading-relaxed text-muted">
                LESS treats recursion as a way of drawing: the token folds value
                and supply back into itself, and the images are what you get if
                you look only at the intersections of that history.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                the system takes away. the art shows what remains.
              </p>
            </section>

            {/* <section className="pt-8 border-t border-border">
              <div className="flex flex-wrap gap-6 text-sm">
                <a
                  href="#"
                  className="text-muted hover:text-foreground transition-colors"
                >
                  contract →
                </a>
                <a
                  href="https://docs.tokenstrategy.com/strategy-types/recursive-strategies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-foreground transition-colors"
                >
                  recursive strategy docs →
                </a>
                <a
                  href="#"
                  className="text-muted hover:text-foreground transition-colors"
                >
                  opensea →
                </a>
              </div>
            </section> */}
          </div>
        </div>
      </div>
    </div>
  );
}
