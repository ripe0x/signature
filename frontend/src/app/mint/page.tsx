'use client';

import { MintWindow } from '@/components/mint/MintWindow';

export default function MintPage() {
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
