'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { truncateAddress } from '@/lib/utils';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        disabled
        className="text-sm px-4 py-2 border border-border transition-colors opacity-50"
      >
        connect
      </button>
    );
  }

  // Show "coming soon" during pre-launch
  if (IS_PRE_LAUNCH) {
    return (
      <span className="text-sm px-3 py-1 border border-muted text-muted">
        coming soon
      </span>
    );
  }

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="text-sm px-4 py-2 border border-border hover:border-foreground transition-colors"
      >
        {truncateAddress(address)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      disabled={isPending}
      className="text-sm px-4 py-2 border border-border hover:border-foreground transition-colors disabled:opacity-50"
    >
      {isPending ? 'connecting...' : 'connect'}
    </button>
  );
}
