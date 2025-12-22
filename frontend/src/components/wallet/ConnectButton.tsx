'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { useSwitchChain } from 'wagmi';
import { IS_PRE_LAUNCH, CHAIN_ID } from '@/lib/contracts';

export function ConnectButton() {
  const { switchChain } = useSwitchChain();

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
                <button
                  onClick={openAccountModal}
                  className="text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 border border-border hover:border-foreground transition-colors max-w-[100px] md:max-w-none truncate"
                >
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
