'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { truncateAddress } from '@/lib/utils';
import { IS_PRE_LAUNCH, CHAIN_ID } from '@/lib/contracts';

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== CHAIN_ID;

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

  // Show wrong network warning
  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: CHAIN_ID })}
        className="text-sm px-4 py-2 bg-red-600 text-white font-bold border border-red-600 hover:bg-red-700 transition-colors"
      >
        WRONG NETWORK
      </button>
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
