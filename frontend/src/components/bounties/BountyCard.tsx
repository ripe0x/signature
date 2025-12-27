'use client';

import { formatEth, truncateAddress, getAddressUrl, getTxUrl } from '@/lib/utils';
import { useExecuteBounty } from '@/hooks/useBounties';
import { useAccount, useReadContract, useEnsName } from 'wagmi';
import { BOUNTY_ABI } from '@/lib/contracts';
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

  // Fetch ENS name for owner
  const { data: ensName } = useEnsName({
    address: bounty.owner,
    chainId: 1,
  });

  // Fetch additional bounty details
  const { data: specificWindowsOnly } = useReadContract({
    address: bounty.bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'specificWindowsOnly',
  });

  const { data: mintsPerWindow } = useReadContract({
    address: bounty.bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'mintsPerWindow',
  });

  const { data: isPaused } = useReadContract({
    address: bounty.bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'paused',
  });

  const handleExecute = () => {
    execute();
  };

  const handleReset = () => {
    reset();
    onExecuteSuccess?.();
  };

  const rewardEth = formatEth(bounty.reward, 4);
  const balanceEth = formatEth(bounty.balance, 4);
  const ownerDisplay = ensName || truncateAddress(bounty.owner, 4);
  const mintsPerWindowNum = mintsPerWindow ? Number(mintsPerWindow) : 1;

  // Calculate how many windows this bounty can fund
  const totalCostPerWindow = bounty.totalCost;
  const windowsRemaining = totalCostPerWindow > BigInt(0)
    ? Math.floor(Number(bounty.balance) / Number(totalCostPerWindow))
    : 0;

  return (
    <div className="border border-border p-4 space-y-3">
      {/* Header with owner and status */}
      <div className="flex justify-between items-start">
        <div>
          <a
            href={getAddressUrl(bounty.owner)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
          >
            {ownerDisplay}
          </a>
          <div className="text-xs text-muted mt-0.5">
            {specificWindowsOnly ? 'specific windows' : 'every window'} · {mintsPerWindowNum} LESS/window
          </div>
        </div>
        <div className="text-right">
          {isPaused ? (
            <span className="inline-block px-2 py-0.5 bg-border text-muted text-xs">
              paused
            </span>
          ) : bounty.canClaim ? (
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
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-muted text-xs">reward</div>
          <div>{rewardEth} ETH</div>
        </div>
        <div>
          <div className="text-muted text-xs">balance</div>
          <div>{balanceEth} ETH</div>
        </div>
        <div>
          <div className="text-muted text-xs">funds for</div>
          <div>{windowsRemaining} window{windowsRemaining !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Contract link */}
      <div className="text-xs">
        <a
          href={getAddressUrl(bounty.bountyAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted hover:text-foreground"
        >
          {truncateAddress(bounty.bountyAddress, 6)} →
        </a>
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
