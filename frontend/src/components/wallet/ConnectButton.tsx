'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { truncateAddress } from '@/lib/utils';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

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
