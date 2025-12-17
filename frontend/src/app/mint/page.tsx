'use client';

import Link from 'next/link';
import { MintWindow } from '@/components/mint/MintWindow';
import { Button } from '@/components/ui/Button';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

function PreLaunchMint() {
  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl">mint</h1>
            <p className="text-muted">
              not yet live
            </p>
          </div>

          {/* Coming Soon Notice */}
          <div className="max-w-md mx-auto p-6 border border-border text-center">
            <div className="text-lg mb-4">coming soon</div>
            <p className="text-sm text-muted mb-6">
              the mint will go live when the recursive token launches.
              each burn event will open a 30-minute window to mint.
            </p>
            <Link href="/about">
              <Button variant="outline" size="sm">
                learn more
              </Button>
            </Link>
          </div>

          {/* How Minting Works */}
          <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-lg text-center">how minting will work</h2>

            <div className="space-y-4 text-sm">
              <div className="flex gap-4">
                <span className="text-muted w-8">01</span>
                <span>the recursive token accumulates ETH from trades</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8">02</span>
                <span>when enough ETH builds up, it buys and burns tokens</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8">03</span>
                <span>each burn opens a 30-minute mint window</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8">04</span>
                <span>one mint per address per window</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8">05</span>
                <span>your piece is generated from the burn event data</span>
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
