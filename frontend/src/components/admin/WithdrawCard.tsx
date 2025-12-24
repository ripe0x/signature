'use client';

import { formatEther } from 'viem';

interface WithdrawCardProps {
  contractBalance: bigint;
  payoutRecipient: `0x${string}` | undefined;
  onWithdraw: () => void;
  isWithdrawPending: boolean;
  isWithdrawConfirming: boolean;
  isWithdrawConfirmed: boolean;
  withdrawError: Error | null;
  withdrawTxHash: `0x${string}` | undefined;
  onReset: () => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WithdrawCard({
  contractBalance,
  payoutRecipient,
  onWithdraw,
  isWithdrawPending,
  isWithdrawConfirming,
  isWithdrawConfirmed,
  withdrawError,
  withdrawTxHash,
  onReset,
}: WithdrawCardProps) {
  const hasBalance = contractBalance > BigInt(0);
  const isProcessing = isWithdrawPending || isWithdrawConfirming;

  const getButtonText = () => {
    if (isWithdrawPending) return 'confirm in wallet...';
    if (isWithdrawConfirming) return 'withdrawing...';
    if (!hasBalance) return 'no balance';
    return 'withdraw all';
  };

  return (
    <div className="border border-border p-6 space-y-4">
      <h2 className="text-lg font-medium">withdraw</h2>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-muted text-sm">available balance</span>
          <span className="text-xl font-mono">{parseFloat(formatEther(contractBalance)).toFixed(4)} ETH</span>
        </div>

        {payoutRecipient && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted">recipient</span>
            <a
              href={`https://etherscan.io/address/${payoutRecipient}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs hover:underline"
            >
              {truncateAddress(payoutRecipient)}
            </a>
          </div>
        )}
      </div>

      {isWithdrawConfirmed && withdrawTxHash ? (
        <div className="space-y-3">
          <div className="text-sm text-green-500 p-3 border border-green-500/50 bg-green-500/10">
            Withdrawal successful!
          </div>
          <a
            href={`https://etherscan.io/tx/${withdrawTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-muted hover:text-foreground transition-colors"
          >
            view on etherscan
          </a>
          <button
            onClick={onReset}
            className="w-full border border-border px-4 py-2 text-sm hover:bg-foreground hover:text-background transition-colors"
          >
            done
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={onWithdraw}
            disabled={!hasBalance || isProcessing}
            className="w-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {getButtonText()}
          </button>

          {withdrawError && (
            <div className="text-sm text-red-500 p-3 border border-red-500/50 bg-red-500/10">
              {withdrawError.message.includes('User rejected')
                ? 'Transaction rejected'
                : withdrawError.message.slice(0, 100)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
