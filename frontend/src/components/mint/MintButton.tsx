'use client';

import { Button } from '@/components/ui/Button';
import { formatEth } from '@/lib/utils';

interface MintButtonProps {
  price: bigint;
  canMint: boolean;
  isPending: boolean;
  isConfirming: boolean;
  hasMinted: boolean;
  isConnected: boolean;
  onMint: () => void;
  label?: string;
}

export function MintButton({
  price,
  canMint,
  isPending,
  isConfirming,
  hasMinted,
  isConnected,
  onMint,
  label,
}: MintButtonProps) {
  const getButtonText = () => {
    if (!isConnected) return 'connect wallet';
    if (hasMinted) return 'already minted this fold';
    if (isPending) return 'confirm in wallet...';
    if (isConfirming) return 'minting...';
    if (label) return label;
    return `mint for ${formatEth(price)} ETH`;
  };

  const isDisabled = !canMint || hasMinted || isPending || isConfirming;

  return (
    <Button
      size="lg"
      onClick={onMint}
      disabled={isDisabled}
      className="w-full md:w-auto min-w-[200px]"
    >
      {getButtonText()}
    </Button>
  );
}
