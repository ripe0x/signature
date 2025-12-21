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
  onSwitchNetwork?: () => void;
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
  onSwitchNetwork,
  label,
}: MintButtonProps) {
  const getButtonText = () => {
    if (!isConnected) return 'connect wallet';
    if (isWrongNetwork) return 'switch to mainnet';
    if (isPending) return 'confirm in wallet...';
    if (isConfirming) return 'minting...';
    if (label) return label;
    if (quantity === 1) {
      return `mint for ${formatEth(totalCost)} ETH`;
    }
    return `mint ${quantity} for ${formatEth(totalCost)} ETH`;
  };

  const handleClick = () => {
    if (isWrongNetwork && onSwitchNetwork) {
      onSwitchNetwork();
      return;
    }
    
    // Double-check: don't allow minting if on wrong network
    if (isWrongNetwork) {
      console.error('Cannot mint on wrong network');
      return;
    }
    
    onMint();
  };

  // Disable button if on wrong network (unless we have switch handler) or if can't mint
  const isDisabled = isWrongNetwork ? !onSwitchNetwork : (!canMint || isPending || isConfirming);

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
