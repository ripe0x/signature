'use client';

import { formatEther } from 'viem';

interface StrategyStatusCardProps {
  strategyBalance: bigint;
  minEthForWindow: bigint;
  strategyProgress: number;
  canCreateWindow: boolean;
  timeUntilFundsMoved: number;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'ready';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function UnicodeProgressBar({ percentage }: { percentage: number }) {
  const filled = Math.round(percentage / 5);
  const empty = 20 - filled;
  return (
    <div className="font-mono text-sm">
      {''.padStart(filled, '=')}{''.padStart(empty, '-')} {percentage.toFixed(0)}%
    </div>
  );
}

export function StrategyStatusCard({
  strategyBalance,
  minEthForWindow,
  strategyProgress,
  canCreateWindow,
  timeUntilFundsMoved,
}: StrategyStatusCardProps) {
  return (
    <div className="border border-border p-6 space-y-4">
      <h2 className="text-lg font-medium">strategy status</h2>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted">balance</span>
            <span className="font-mono">
              {parseFloat(formatEther(strategyBalance)).toFixed(4)} / {parseFloat(formatEther(minEthForWindow)).toFixed(2)} ETH
            </span>
          </div>
          <UnicodeProgressBar percentage={strategyProgress} />
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted">window ready</span>
          <span className={canCreateWindow ? 'text-green-500 font-medium' : 'text-muted'}>
            {canCreateWindow ? 'YES' : 'NO'}
          </span>
        </div>

        {timeUntilFundsMoved > 0 && !canCreateWindow && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">cooldown</span>
            <span className="font-mono">{formatCountdown(timeUntilFundsMoved)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
