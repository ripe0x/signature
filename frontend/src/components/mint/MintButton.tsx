'use client';

import { useConnectModal, useChainModal } from '@rainbow-me/rainbowkit';
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
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();

  const getButtonText = () => {
    if (!isConnected) return 'connect wallet to mint';
    if (isPending) return 'confirm in wallet...';
    if (isConfirming) return 'minting...';
    if (label) return label;
    if (quantity === 1) {
      return `mint for ${formatEth(totalCost)} ETH`;
    }
    return `mint ${quantity} for ${formatEth(totalCost)} ETH`;
  };

  const handleClick = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (isWrongNetwork) {
      openChainModal?.();
      return;
    }
    onMint();
  };

  // Button is clickable when not connected (opens modal) or on wrong network (opens chain modal)
  const isDisabled = (isConnected && !isWrongNetwork && !canMint) || isPending || isConfirming;

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        onClick={handleClick}
        disabled={isDisabled}
        className="w-full md:w-auto min-w-[200px]"
      >
        {getButtonText()}
      </Button>
      {isWrongNetwork && (
        <p className="text-xs text-red-500 text-center">
          wrong network — switch to Ethereum Mainnet to mint
        </p>
      )}
    </div>
  );
}
