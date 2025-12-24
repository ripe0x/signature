'use client';

import { formatEther } from 'viem';

interface ContractStatusCardProps {
  contractBalance: bigint;
  mintPrice: bigint;
  windowDuration: number;
  minEthForWindow: bigint;
  payoutRecipient: `0x${string}` | undefined;
  totalSupply: number;
  windowCount: number;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} min`;
}

export function ContractStatusCard({
  contractBalance,
  mintPrice,
  windowDuration,
  minEthForWindow,
  payoutRecipient,
  totalSupply,
  windowCount,
}: ContractStatusCardProps) {
  return (
    <div className="border border-border p-6 space-y-4">
      <h2 className="text-lg font-medium">contract status</h2>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted text-xs mb-1">contract balance</div>
          <div className="font-mono">{parseFloat(formatEther(contractBalance)).toFixed(4)} ETH</div>
        </div>

        <div>
          <div className="text-muted text-xs mb-1">mint price</div>
          <div className="font-mono">{parseFloat(formatEther(mintPrice)).toFixed(4)} ETH</div>
        </div>

        <div>
          <div className="text-muted text-xs mb-1">window duration</div>
          <div className="font-mono">{formatMinutes(windowDuration)}</div>
        </div>

        <div>
          <div className="text-muted text-xs mb-1">window threshold</div>
          <div className="font-mono">{parseFloat(formatEther(minEthForWindow)).toFixed(2)} ETH</div>
        </div>

        <div>
          <div className="text-muted text-xs mb-1">total supply</div>
          <div className="font-mono">{totalSupply}</div>
        </div>

        <div>
          <div className="text-muted text-xs mb-1">window count</div>
          <div className="font-mono">{windowCount}</div>
        </div>

        <div className="col-span-2">
          <div className="text-muted text-xs mb-1">payout recipient</div>
          <div className="font-mono text-xs">
            {payoutRecipient ? (
              <a
                href={`https://etherscan.io/address/${payoutRecipient}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {truncateAddress(payoutRecipient)}
              </a>
            ) : (
              '...'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
