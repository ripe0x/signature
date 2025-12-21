'use client';

import { cn, getTxUrl } from '@/lib/utils';

interface MintStatusProps {
  isConfirmed: boolean;
  error: Error | null;
  txHash?: `0x${string}`;
  onReset?: () => void;
}

export function MintStatus({ isConfirmed, error, txHash, onReset }: MintStatusProps) {
  if (!isConfirmed && !error) return null;

  return (
    <div
      className={cn(
        'p-4 text-sm',
        isConfirmed && 'bg-green-50 border border-green-200',
        error && 'bg-red-50 border border-red-200'
      )}
    >
      {isConfirmed && (
        <div className="space-y-2">
          <p className="text-green-800">minted successfully!</p>
          {txHash && (
            <a
              href={getTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline block"
            >
              view transaction →
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-red-800">
            {error.message.includes('User rejected')
              ? 'transaction cancelled'
              : 'mint failed'}
          </p>
          {onReset && (
            <button
              onClick={onReset}
              className="text-red-600 hover:underline"
            >
              try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
