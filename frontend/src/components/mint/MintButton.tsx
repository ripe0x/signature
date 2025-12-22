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
  isWrongNetwork?: boolean;
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
  isWrongNetwork,
  onMint,
  label,
}: MintButtonProps) {
  const getButtonText = () => {
    if (!isConnected) return 'connect wallet';
    if (isWrongNetwork) return 'switch network to mint';
    if (isPending) return 'confirm in wallet...';
    if (isConfirming) return 'minting...';
    if (label) return label;
    if (quantity === 1) {
      return `mint for ${formatEth(totalCost)} ETH`;
    }
    return `mint ${quantity} for ${formatEth(totalCost)} ETH`;
  };

  const handleClick = () => {
    if (isWrongNetwork) {
      return;
    }
    onMint();
  };

  const isDisabled = isWrongNetwork || !canMint || isPending || isConfirming;

  return (
    <Button
      size="lg"
      onClick={handleClick}
      disabled={isDisabled}
      className="w-full md:w-auto min-w-[200px]"
    >
      {getButtonText()}
    </Button>
  );
}
