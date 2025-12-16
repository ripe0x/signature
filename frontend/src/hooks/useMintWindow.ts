'use client';

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';
import { useEffect, useState, useCallback } from 'react';

export interface MintWindowState {
  isActive: boolean;
  foldId: number;
  timeRemaining: number;
  price: bigint;
  hasMinted: boolean;
  canCreateFold: boolean;
  windowDuration: number;
}

export function useMintWindow() {
  const { address, isConnected } = useAccount();
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Read current fold ID
  const { data: currentFoldId } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'currentFoldId',
    query: {
      refetchInterval: 5000,
    },
  });

  // Read if window is active
  const { data: isWindowActive } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'isWindowActive',
    query: {
      refetchInterval: 5000,
    },
  });

  // Read time until window closes
  const { data: timeUntilClose } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'timeUntilWindowCloses',
    query: {
      refetchInterval: 1000,
      enabled: !!isWindowActive,
    },
  });

  // Read mint price
  const { data: mintPrice } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'mintPrice',
  });

  // Read window duration
  const { data: windowDuration } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowDuration',
  });

  // Check if user has minted this fold
  const { data: hasMinted } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'hasMintedFold',
    args: currentFoldId && address ? [currentFoldId, address] : undefined,
    query: {
      enabled: !!currentFoldId && !!address,
      refetchInterval: 5000,
    },
  });

  // Check if fold can be created
  const { data: canCreateFold } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'canCreateFold',
    query: {
      enabled: !isWindowActive,
      refetchInterval: 5000,
    },
  });

  // Countdown timer
  useEffect(() => {
    if (timeUntilClose) {
      setTimeRemaining(Number(timeUntilClose));
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeUntilClose]);

  // Mint transaction
  const {
    writeContract,
    data: mintTxHash,
    isPending: isMintPending,
    error: mintError,
    reset: resetMint,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: mintTxHash,
  });

  const mint = useCallback(async () => {
    if (!mintPrice) return;

    writeContract({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'mint',
      value: mintPrice,
    });
  }, [writeContract, mintPrice]);

  const canMint = Boolean(
    isConnected &&
    isWindowActive &&
    !hasMinted &&
    !isMintPending &&
    !isConfirming
  );

  return {
    // State
    isActive: !!isWindowActive,
    foldId: currentFoldId ? Number(currentFoldId) : 0,
    timeRemaining,
    price: mintPrice ?? BigInt(0),
    hasMinted: !!hasMinted,
    canCreateFold: !!canCreateFold,
    windowDuration: windowDuration ? Number(windowDuration) : 1800,

    // Mint
    mint,
    canMint,
    isMintPending,
    isConfirming: !!isConfirming,
    isConfirmed: !!isConfirmed,
    mintError: mintError as Error | null,
    mintTxHash,
    resetMint,
  };
}
