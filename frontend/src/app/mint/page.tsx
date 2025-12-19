"use client";

import Link from "next/link";
import { MintWindow } from "@/components/mint/MintWindow";
import { Button } from "@/components/ui/Button";
import { IS_PRE_LAUNCH, IS_TOKEN_LIVE, CONTRACTS } from "@/lib/contracts";

function PreLaunchMint() {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl">mint</h1>
            <p className="text-muted">nft contract coming soon</p>
          </div>

          {/* Coming Soon Notice */}
          <div className="max-w-md mx-auto p-6 border border-border text-center">
            {IS_TOKEN_LIVE ? (
              <>
                <div className="text-lg mb-4">$LESS is live</div>
                <p className="text-sm text-muted mb-6">
                  the recursive token is trading. the nft contract will deploy
                  soon. when the first burn happens, a 90-minute mint window
                  will open.
                </p>
                <div className="flex gap-3 justify-center">
                  <a
                    href={`https://www.nftstrategy.fun/strategies/0x9c2ca573009f181eac634c4d6e44a0977c24f335`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      trade $LESS
                    </Button>
                  </a>
                  <Link href="/about">
                    <Button variant="outline" size="sm">
                      learn more
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-lg mb-4">coming soon</div>
                <p className="text-sm text-muted mb-6">
                  the mint will go live when the recursive token launches. each
                  burn event will open a 90-minute window to mint.
                </p>
                <Link href="/about">
                  <Button variant="outline" size="sm">
                    learn more
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* How Minting Works */}
          <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-lg text-center">how minting works</h2>

            <div className="space-y-4 text-sm">
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">01</span>
                <span>
                  the $LESS recursive token accumulates ETH from trades
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">02</span>
                <span>
                  when enough ETH builds up, anyone can trigger a buy and burn
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">03</span>
                <span>that burn opens a 90 minute mint window</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">04</span>
                <span>
                  mints are generated from the system state at that moment
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MintPage() {
  if (IS_PRE_LAUNCH) {
    return <PreLaunchMint />;
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          <MintWindow />
        </div>
      </div>
    </div>
  );
}
