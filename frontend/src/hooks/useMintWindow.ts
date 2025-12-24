'use client';

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { parseEventLogs } from 'viem';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI, CHAIN_ID } from '@/lib/contracts';
import { useEffect, useState, useCallback, useMemo } from 'react';

export interface MintWindowState {
  isActive: boolean;
  windowId: number;
  timeRemaining: number;
  basePrice: bigint;
  nextMintPrice: bigint;
  mintCount: number;
  multiplier: number;
  canCreateWindow: boolean;
  windowDuration: number;
}

// Helper for BigInt exponentiation (works around TS target limitations)
function bigIntPow(base: bigint, exp: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < exp; i++) {
    result = result * base;
  }
  return result;
}

// Calculate price multiplier: 1.5^n = 3^n / 2^n
function calculateMultiplier(mintCount: number): number {
  return Math.pow(3, mintCount) / Math.pow(2, mintCount);
}

// Calculate next mint price: basePrice * 1.5^mintCount
function calculateNextMintPrice(basePrice: bigint, mintCount: number): bigint {
  const pow3 = bigIntPow(BigInt(3), mintCount);
  const pow2 = bigIntPow(BigInt(2), mintCount);
  return (basePrice * pow3) / pow2;
}

export function useMintWindow() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [mintedQuantity, setMintedQuantity] = useState(0);

  // Check if user is on the correct network
  const isWrongNetwork = isConnected && chainId !== CHAIN_ID;

  // Read current window count
  const { data: windowCount, refetch: refetchWindowCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowCount',
    query: {
      refetchInterval: 5000,
    },
  });

  // Read if window is active
  const { data: isWindowActive, refetch: refetchWindowActive, isLoading: isWindowActiveLoading } = useReadContract({
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

  // Read base mint price
  const { data: basePrice, isLoading: isPriceLoading } = useReadContract({
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

  // Get user's mint count in current window
  const { data: mintCount, refetch: refetchMintCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getMintCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Get total cost for minting the selected quantity (authoritative from contract)
  const { data: totalCost, refetch: refetchTotalCost } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getMintCost',
    args: address ? [address, BigInt(quantity)] : undefined,
    query: {
      enabled: !!address && quantity > 0,
      refetchInterval: 5000,
    },
  });

  // Check if window can be created
  const { data: canCreateWindow, isLoading: isCanCreateWindowLoading } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'canCreateWindow',
    query: {
      enabled: !isWindowActive,
      refetchInterval: 5000,
    },
  });

  // Overall loading state for initial render
  const isLoading = isWindowActiveLoading || (!isWindowActive && isCanCreateWindowLoading);

  // Get time until funds can be moved (burn cooldown)
  const { data: timeUntilFundsMoved } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'timeUntilFundsMoved',
    query: {
      enabled: !isWindowActive && !canCreateWindow,
      refetchInterval: 5000,
    },
  });

  // Calculate multiplier and next mint price from mintCount (computed client-side)
  const mintCountNum = mintCount ? Number(mintCount) : 0;
  const multiplier = useMemo(() => calculateMultiplier(mintCountNum), [mintCountNum]);
  const nextMintPrice = useMemo(
    () => basePrice ? calculateNextMintPrice(basePrice, mintCountNum) : BigInt(0),
    [basePrice, mintCountNum]
  );

  // Countdown timer for active window
  useEffect(() => {
    if (timeUntilClose) {
      setTimeRemaining(Number(timeUntilClose));
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeUntilClose]);

  // Countdown timer for burn cooldown
  useEffect(() => {
    if (timeUntilFundsMoved !== undefined) {
      setCooldownRemaining(Number(timeUntilFundsMoved));
    }

    const interval = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeUntilFundsMoved]);

  // Mint transaction
  const {
    writeContract,
    data: mintTxHash,
    isPending: isMintPending,
    error: mintError,
    reset: resetMint,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, data: txReceipt } = useWaitForTransactionReceipt({
    hash: mintTxHash,
  });

  // Parse minted token IDs from transaction receipt logs
  const mintedTokenIds = useMemo(() => {
    if (!txReceipt?.logs) return [];

    try {
      const mintedEvents = parseEventLogs({
        abi: LESS_NFT_ABI,
        eventName: 'Minted',
        logs: txReceipt.logs,
      });

      return mintedEvents
        .map((event) => Number(event.args.tokenId))
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }, [txReceipt]);

  // Refetch data after successful mint
  useEffect(() => {
    if (isConfirmed) {
      refetchMintCount();
      refetchTotalCost();
      refetchWindowCount();
      refetchWindowActive();
    }
  }, [isConfirmed, refetchMintCount, refetchTotalCost, refetchWindowCount, refetchWindowActive]);

  const mint = useCallback(async (mintQuantity: number = 1) => {
    if (!address) return;
    
    // Prevent minting on wrong network
    if (isWrongNetwork) {
      console.error('Cannot mint on wrong network. Please switch to mainnet.');
      return;
    }

    // Track how many we're minting for UI feedback
    setMintedQuantity(mintQuantity);

    // For connected users, use the contract's getMintCost
    // For the actual transaction, we need to calculate or use totalCost
    const value = totalCost ?? basePrice ?? BigInt(0);

    writeContract({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'mint',
      args: [BigInt(mintQuantity)],
      value,
      chainId: mainnet.id,
    });
  }, [writeContract, address, totalCost, basePrice, isWrongNetwork]);

  const canMint = Boolean(
    isConnected &&
    !isWrongNetwork &&
    (isWindowActive || canCreateWindow) &&
    !isMintPending &&
    !isConfirming
  );

  const switchToMainnet = useCallback(() => {
    switchChain({ chainId: CHAIN_ID });
  }, [switchChain]);

  // Wrap resetMint to also clear mintedQuantity
  const handleResetMint = useCallback(() => {
    setMintedQuantity(0);
    resetMint();
  }, [resetMint]);

  return {
    // State
    isLoading,
    isActive: !!isWindowActive,
    windowId: windowCount ? Number(windowCount) : 0,
    timeRemaining,
    cooldownRemaining,
    basePrice: basePrice ?? BigInt(0),
    isPriceLoading,
    nextMintPrice: nextMintPrice || basePrice || BigInt(0),
    totalCost: totalCost ?? BigInt(0),
    mintCount: mintCountNum,
    multiplier,
    canCreateWindow: !!canCreateWindow,
    windowDuration: windowDuration ? Number(windowDuration) : 5400,

    // Network
    isWrongNetwork,
    switchToMainnet,

    // Quantity
    quantity,
    setQuantity,

    // Mint
    mint,
    canMint,
    isMintPending,
    isConfirming: !!isConfirming,
    isConfirmed: !!isConfirmed,
    mintError: mintError as Error | null,
    mintTxHash,
    mintedQuantity,
    mintedTokenIds,
    resetMint: handleResetMint,
  };
}
