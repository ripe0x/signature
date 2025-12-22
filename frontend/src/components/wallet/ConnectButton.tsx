'use client';

import { useEffect, useState, useRef } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { truncateAddress } from '@/lib/utils';
import { IS_PRE_LAUNCH, CHAIN_ID } from '@/lib/contracts';

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== CHAIN_ID;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowConnectors(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowConnectors(!showConnectors)}
        disabled={isPending}
        className="text-sm px-4 py-2 border border-border hover:border-foreground transition-colors disabled:opacity-50"
      >
        {isPending ? 'connecting...' : 'connect'}
      </button>
      {showConnectors && (
        <div className="absolute right-0 top-full mt-2 min-w-[160px] bg-background border border-border shadow-lg z-50">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setShowConnectors(false);
              }}
              className="w-full text-left text-sm px-4 py-3 hover:bg-foreground/10 transition-colors border-b border-border last:border-b-0"
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
