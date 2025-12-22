'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

export function ConnectButton() {
  if (IS_PRE_LAUNCH) {
    return (
      <span className="text-sm px-3 py-1 border border-muted text-muted">
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
        openChainModal,
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
                    className="text-sm px-4 py-2 border border-border hover:border-foreground transition-colors"
                  >
                    connect
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="text-sm px-4 py-2 bg-red-600 text-white font-bold border border-red-600 hover:bg-red-700 transition-colors"
                  >
                    WRONG NETWORK
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  className="text-sm px-4 py-2 border border-border hover:border-foreground transition-colors"
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
