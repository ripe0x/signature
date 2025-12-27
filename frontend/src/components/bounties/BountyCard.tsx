'use client';

import { formatEth, truncateAddress, getAddressUrl, getTxUrl } from '@/lib/utils';
import { useExecuteBounty } from '@/hooks/useBounties';
import { useAccount } from 'wagmi';
import type { BountyStatus } from '@/hooks/useBounties';

interface BountyCardProps {
  bounty: BountyStatus;
  onExecuteSuccess?: () => void;
}

export function BountyCard({ bounty, onExecuteSuccess }: BountyCardProps) {
  const { isConnected } = useAccount();
  const { execute, isPending, isConfirming, isConfirmed, error, txHash, reset } = useExecuteBounty(
    bounty.bountyAddress
  );

  const handleExecute = () => {
    execute();
  };

  const handleReset = () => {
    reset();
    onExecuteSuccess?.();
  };

  const rewardEth = formatEth(bounty.reward, 4);
  const balanceEth = formatEth(bounty.balance, 4);

  return (
    <div className="border border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <a
            href={getAddressUrl(bounty.bountyAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-mono hover:underline"
          >
            {truncateAddress(bounty.bountyAddress, 6)}
          </a>
          <div className="text-xs text-muted mt-1">
            owner:{' '}
            <a
              href={getAddressUrl(bounty.owner)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {truncateAddress(bounty.owner, 4)}
            </a>
          </div>
        </div>
        <div className="text-right">
          {bounty.canClaim ? (
            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs">
              claimable
            </span>
          ) : bounty.windowActive ? (
            <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs">
              window open
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 bg-border text-muted text-xs">
              waiting
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted text-xs">reward</div>
          <div>{rewardEth} ETH</div>
        </div>
        <div>
          <div className="text-muted text-xs">balance</div>
          <div>{balanceEth} ETH</div>
        </div>
      </div>

      {/* Window info */}
      <div className="text-xs text-muted">
        window {Number(bounty.currentWindowId)} {bounty.windowActive ? '(active)' : ''}
      </div>

      {/* Success message */}
      {isConfirmed && (
        <div className="p-3 bg-green-50 border border-green-200 text-sm space-y-2">
          <p className="text-green-800">bounty claimed successfully!</p>
          {txHash && (
            <a
              href={getTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline text-xs"
            >
              view transaction
            </a>
          )}
          <button
            onClick={handleReset}
            className="block text-green-600 hover:underline text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-sm">
          <p className="text-red-800">
            {error.message.includes('User rejected') ? 'cancelled' : 'claim failed'}
          </p>
          <button onClick={reset} className="text-red-600 hover:underline text-xs mt-1">
            try again
          </button>
        </div>
      )}

      {/* Execute button */}
      {bounty.canClaim && !isConfirmed && !error && (
        <button
          onClick={handleExecute}
          disabled={!isConnected || isPending || isConfirming}
          className="w-full py-2 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {isPending ? 'confirm in wallet...' : isConfirming ? 'claiming...' : `claim ${rewardEth} ETH`}
        </button>
      )}
    </div>
  );
}
