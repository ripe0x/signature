'use client';

import { Button } from '@/components/ui/Button';
import { formatEth } from '@/lib/utils';

interface MintButtonProps {
  totalCost: bigint;
  quantity: number;
  canMint: boolean;
  isPending: boolean;
  isConfirming: boolean;
  isConnected: boolean;
  onMint: () => void;
  label?: string;
}

export function MintButton({
  totalCost,
  quantity,
  canMint,
  isPending,
  isConfirming,
  isConnected,
  onMint,
  label,
}: MintButtonProps) {
  const getButtonText = () => {
    if (!isConnected) return 'connect wallet';
    if (isPending) return 'confirm in wallet...';
    if (isConfirming) return 'minting...';
    if (label) return label;
    if (quantity === 1) {
      return `mint for ${formatEth(totalCost)} ETH`;
    }
    return `mint ${quantity} for ${formatEth(totalCost)} ETH`;
  };

  const isDisabled = !canMint || isPending || isConfirming;

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
