'use client';

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { parseEventLogs } from 'viem';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI, CHAIN_ID } from '@/lib/contracts';
import { useContractState } from '@/providers/ContractStateContext';
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

/**
 * Hook for mint window state and minting.
 * Uses shared contract state and conditional polling based on window activity.
 *
 * Polling strategy:
 * - Window inactive: Slow polling (60s) - just checking if window started
 * - Window active: Faster polling (15-30s) for responsive minting UX
 * - User-specific data: Only fetched when needed (connected + active window)
 */
export function useMintWindow() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [mintedQuantity, setMintedQuantity] = useState(0);

  // Use shared contract state instead of making duplicate RPC calls
  const contractState = useContractState();
  const isWindowActive = contractState.isWindowActive;

  // Check if user is on the correct network
  const isWrongNetwork = isConnected && chainId !== CHAIN_ID;

  // Fetch time until window closes - ONLY ONCE to initialize countdown
  // The client-side timer handles the countdown, no need for 1s polling
  const { data: timeUntilClose, refetch: refetchTimeUntilClose } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'timeUntilWindowCloses',
    query: {
      enabled: isWindowActive,
      // No refetchInterval - we only need initial value, client-side timer does the rest
      staleTime: Infinity,
    },
  });

  // Get user's mint count in current window
  // Only poll when window is active AND user is connected
  const { data: mintCount, refetch: refetchMintCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getMintCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isWindowActive,
      refetchInterval: isWindowActive ? 15000 : false, // 15s when active, disabled otherwise
      staleTime: 10000,
    },
  });

  // Get total cost for minting the selected quantity
  // Only fetch when user is connected, window is active, and quantity > 0
  const { data: totalCost, refetch: refetchTotalCost } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getMintCost',
    args: address ? [address, BigInt(quantity)] : undefined,
    query: {
      enabled: !!address && quantity > 0 && isWindowActive,
      refetchInterval: isWindowActive ? 15000 : false,
      staleTime: 10000,
    },
  });

  // Get time until funds can be moved (burn cooldown)
  // Only poll when window is inactive and can't create window (waiting for cooldown)
  const { data: timeUntilFundsMoved } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'timeUntilFundsMoved',
    query: {
      enabled: !isWindowActive && !contractState.canCreateWindow,
      // Slower polling since this is just for UI display
      refetchInterval: 60000, // 1 minute
      staleTime: 30000,
    },
  });

  // Calculate multiplier and next mint price from mintCount (computed client-side)
  const mintCountNum = mintCount ? Number(mintCount) : 0;
  const multiplier = useMemo(() => calculateMultiplier(mintCountNum), [mintCountNum]);
  const nextMintPrice = useMemo(
    () => contractState.basePrice ? calculateNextMintPrice(contractState.basePrice, mintCountNum) : BigInt(0),
    [contractState.basePrice, mintCountNum]
  );

  // Initialize countdown from contract value and run client-side timer
  useEffect(() => {
    if (timeUntilClose !== undefined) {
      setTimeRemaining(Number(timeUntilClose));
    }
  }, [timeUntilClose]);

  // Client-side countdown timer for active window
  useEffect(() => {
    if (!isWindowActive || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newValue = Math.max(0, prev - 1);
        // Refetch state when timer hits 0 to confirm window closed
        if (newValue === 0) {
          contractState.refetch();
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWindowActive, timeRemaining, contractState]);

  // Initialize cooldown from contract value
  useEffect(() => {
    if (timeUntilFundsMoved !== undefined) {
      setCooldownRemaining(Number(timeUntilFundsMoved));
    }
  }, [timeUntilFundsMoved]);

  // Client-side countdown timer for burn cooldown
  useEffect(() => {
    if (isWindowActive || cooldownRemaining <= 0) return;

    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        const newValue = Math.max(0, prev - 1);
        // Refetch state when cooldown hits 0 to check if window can be created
        if (newValue === 0) {
          contractState.refetch();
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWindowActive, cooldownRemaining, contractState]);

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

      // Extract token IDs from Minted events
      return mintedEvents
        .map(event => Number(event.args.tokenId))
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
      refetchTimeUntilClose();
      contractState.refetch();
    }
  }, [isConfirmed, refetchMintCount, refetchTotalCost, refetchTimeUntilClose, contractState]);

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
    const value = totalCost ?? contractState.basePrice ?? BigInt(0);

    writeContract({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'mint',
      args: [BigInt(mintQuantity)],
      value,
      chainId: mainnet.id,
    });
  }, [writeContract, address, totalCost, contractState.basePrice, isWrongNetwork]);

  const canMint = Boolean(
    isConnected &&
    !isWrongNetwork &&
    (isWindowActive || contractState.canCreateWindow) &&
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
    // State (from shared context + local)
    isLoading: contractState.isLoading,
    isActive: isWindowActive,
    windowId: contractState.windowCount,
    timeRemaining,
    cooldownRemaining,
    basePrice: contractState.basePrice,
    isPriceLoading: contractState.isLoading,
    nextMintPrice: nextMintPrice || contractState.basePrice || BigInt(0),
    totalCost: totalCost ?? BigInt(0),
    mintCount: mintCountNum,
    multiplier,
    canCreateWindow: contractState.canCreateWindow,
    windowDuration: contractState.windowDuration,

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
