'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { useSwitchChain, useDisconnect } from 'wagmi';
import { IS_PRE_LAUNCH, CHAIN_ID } from '@/lib/contracts';

export function ConnectButton() {
  const { switchChain } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (IS_PRE_LAUNCH) {
    return (
      <span className="text-xs md:text-sm px-2 md:px-3 py-1 border border-muted text-muted">
        coming soon
      </span>
    );
  }

  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 border border-border hover:border-foreground transition-colors"
                  >
                    connect
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={() => switchChain({ chainId: CHAIN_ID })}
                    className="text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 bg-red-600 text-white font-bold border border-red-600 hover:bg-red-700 transition-colors"
                  >
                    WRONG NETWORK
                  </button>
                );
              }

              return (
                <div ref={dropdownRef} className="relative">
                  <button
                    onClick={() => setOpen(!open)}
                    className="text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 border border-border hover:border-foreground transition-colors max-w-[100px] md:max-w-none truncate"
                  >
                    {account.displayName}
                  </button>
                  {open && (
                    <div className="absolute right-0 mt-1 min-w-[160px] border border-border bg-background z-50">
                      <button
                        onClick={() => {
                          setOpen(false);
                          router.push(`/collector/${account.ensName || account.address}`);
                        }}
                        className="w-full text-left text-xs md:text-sm px-4 py-2 hover:bg-foreground/5 transition-colors"
                      >
                        my collection
                      </button>
                      <button
                        onClick={() => {
                          setOpen(false);
                          disconnect();
                        }}
                        className="w-full text-left text-xs md:text-sm px-4 py-2 hover:bg-foreground/5 transition-colors"
                      >
                        disconnect
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
