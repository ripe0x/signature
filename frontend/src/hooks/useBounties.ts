'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useBalance, usePublicClient } from 'wagmi';
import { parseEther, formatEther, parseAbiItem } from 'viem';
import { useState, useEffect, useMemo } from 'react';
import {
  BOUNTY_FACTORY_ADDRESS,
  BOUNTY_FACTORY_ABI,
  BOUNTY_ABI,
  CONTRACTS,
  LESS_NFT_ABI,
} from '@/lib/contracts';

export interface BountyStatus {
  bountyAddress: `0x${string}`;
  owner: `0x${string}`;
  canClaim: boolean;
  reward: bigint;
  totalCost: bigint;
  balance: bigint;
  currentWindowId: bigint;
  windowActive: boolean;
}

export interface DetailedBountyStatus {
  isActive: boolean;
  isPaused: boolean;
  currentWindowId: number;
  windowActive: boolean;
  windowMintedAlready: boolean;
  windowTargeted: boolean;
  canClaim: boolean;
  mintCost: bigint;
  reward: bigint;
  totalCost: bigint;
  balance: bigint;
  configuredMintsPerWindow: number;
}

export function useBounties() {
  // Get total bounties count
  const { data: totalBounties, refetch: refetchTotal } = useReadContract({
    address: BOUNTY_FACTORY_ADDRESS,
    abi: BOUNTY_FACTORY_ABI,
    functionName: 'totalBounties',
    query: {
      refetchInterval: 10000,
    },
  });

  // Get all bounty statuses (paginated - fetch first 50)
  const { data: bountyStatuses, refetch: refetchStatuses, isLoading } = useReadContract({
    address: BOUNTY_FACTORY_ADDRESS,
    abi: BOUNTY_FACTORY_ABI,
    functionName: 'getBountyStatuses',
    args: [BigInt(0), BigInt(50)],
    query: {
      refetchInterval: 10000,
      enabled: totalBounties !== undefined && totalBounties > BigInt(0),
    },
  });

  // Get current window info from LESS NFT
  const { data: windowId } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowCount',
    query: {
      refetchInterval: 10000,
    },
  });

  const { data: isWindowActive } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'isWindowActive',
    query: {
      refetchInterval: 10000,
    },
  });

  const refetch = () => {
    refetchTotal();
    refetchStatuses();
  };

  // Filter claimable bounties
  const claimableBounties = useMemo(() => {
    if (!bountyStatuses) return [];
    return (bountyStatuses as BountyStatus[]).filter((b) => b.canClaim);
  }, [bountyStatuses]);

  return {
    totalBounties: totalBounties ? Number(totalBounties) : 0,
    bounties: (bountyStatuses as BountyStatus[]) ?? [],
    claimableBounties,
    currentWindowId: windowId ? Number(windowId) : 0,
    isWindowActive: isWindowActive ?? false,
    isLoading,
    refetch,
  };
}

export function useBounty(bountyAddress: `0x${string}` | undefined) {
  const { address: userAddress } = useAccount();

  // Get detailed bounty status
  const { data: bountyStatus, refetch } = useReadContract({
    address: bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'getBountyStatus',
    query: {
      refetchInterval: 5000,
      enabled: !!bountyAddress,
    },
  });

  // Get owner
  const { data: owner } = useReadContract({
    address: bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'owner',
    query: {
      enabled: !!bountyAddress,
    },
  });

  const isOwner = userAddress && owner ? userAddress.toLowerCase() === (owner as string).toLowerCase() : false;

  // Parse bounty status
  const status = useMemo(() => {
    if (!bountyStatus) return null;
    const [
      isActive,
      isPaused,
      currentWindowId,
      windowActive,
      windowMintedAlready,
      windowTargeted,
      canClaim,
      mintCost,
      reward,
      totalCost,
      balance,
      configuredMintsPerWindow,
    ] = bountyStatus as [boolean, boolean, bigint, boolean, boolean, boolean, boolean, bigint, bigint, bigint, bigint, bigint];

    return {
      isActive,
      isPaused,
      currentWindowId: Number(currentWindowId),
      windowActive,
      windowMintedAlready,
      windowTargeted,
      canClaim,
      mintCost,
      reward,
      totalCost,
      balance,
      configuredMintsPerWindow: Number(configuredMintsPerWindow),
    } as DetailedBountyStatus;
  }, [bountyStatus]);

  return {
    status,
    owner: owner as `0x${string}` | undefined,
    isOwner,
    refetch,
  };
}

export function useUserBounty() {
  const { address } = useAccount();

  // Get user's bounty address from factory
  const { data: bountyAddress, refetch: refetchBountyAddress } = useReadContract({
    address: BOUNTY_FACTORY_ADDRESS,
    abi: BOUNTY_FACTORY_ABI,
    functionName: 'getBounty',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const hasBounty = bountyAddress && bountyAddress !== '0x0000000000000000000000000000000000000000';
  const { status, owner, isOwner, refetch: refetchStatus } = useBounty(
    hasBounty ? (bountyAddress as `0x${string}`) : undefined
  );

  // Get bounty balance
  const { data: balanceData } = useBalance({
    address: hasBounty ? (bountyAddress as `0x${string}`) : undefined,
    query: {
      refetchInterval: 10000,
      enabled: hasBounty,
    },
  });

  const refetch = () => {
    refetchBountyAddress();
    refetchStatus();
  };

  return {
    bountyAddress: hasBounty ? (bountyAddress as `0x${string}`) : null,
    hasBounty,
    status,
    balance: balanceData?.value ?? BigInt(0),
    refetch,
  };
}

export function useCreateBounty() {
  const [mintsPerWindow, setMintsPerWindow] = useState(1);
  const [executorRewardEth, setExecutorRewardEth] = useState('0.0003'); // ~$1 at current ETH prices
  const [depositEth, setDepositEth] = useState('0.01');
  const [mode, setMode] = useState<'ongoing' | 'specific'>('ongoing');
  const [targetWindows, setTargetWindows] = useState<number[]>([]);

  // Track creation step: 'create' | 'setMode' | 'addWindows' | 'done'
  const [step, setStep] = useState<'create' | 'setMode' | 'addWindows' | 'done'>('create');
  const [windowIndex, setWindowIndex] = useState(0);

  const { writeContract, data: txHash, isPending, error, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Extract bounty address from receipt logs
  const [createdBountyAddress, setCreatedBountyAddress] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (receipt?.logs && step === 'create') {
      // BountyCreated event has topic0 for the event signature
      // The bounty address is in the second indexed parameter
      const bountyCreatedLog = receipt.logs.find((log) => log.topics.length >= 3);
      if (bountyCreatedLog && bountyCreatedLog.topics[2]) {
        // Extract address from topic (remove leading zeros)
        const addressHex = '0x' + bountyCreatedLog.topics[2].slice(-40);
        setCreatedBountyAddress(addressHex as `0x${string}`);
      }
    }
  }, [receipt, step]);

  // After bounty created, configure mode if specific
  useEffect(() => {
    if (createdBountyAddress && isConfirmed && step === 'create' && mode === 'specific') {
      setStep('setMode');
    } else if (createdBountyAddress && isConfirmed && step === 'create' && mode === 'ongoing') {
      setStep('done');
    }
  }, [createdBountyAddress, isConfirmed, step, mode]);

  // After mode set, add target windows
  useEffect(() => {
    if (isConfirmed && step === 'setMode' && targetWindows.length > 0) {
      setStep('addWindows');
      setWindowIndex(0);
    } else if (isConfirmed && step === 'setMode') {
      setStep('done');
    }
  }, [isConfirmed, step, targetWindows.length]);

  // After each window added, add next or complete
  useEffect(() => {
    if (isConfirmed && step === 'addWindows') {
      if (windowIndex < targetWindows.length - 1) {
        setWindowIndex((i) => i + 1);
      } else {
        setStep('done');
      }
    }
  }, [isConfirmed, step, windowIndex, targetWindows.length]);

  // Trigger next transaction based on step
  useEffect(() => {
    if (!createdBountyAddress || isPending || isConfirming) return;

    if (step === 'setMode' && !isConfirmed) {
      writeContract({
        address: createdBountyAddress,
        abi: BOUNTY_ABI,
        functionName: 'setSpecificWindowsOnly',
        args: [true],
      });
    } else if (step === 'addWindows' && !isConfirmed && targetWindows[windowIndex]) {
      writeContract({
        address: createdBountyAddress,
        abi: BOUNTY_ABI,
        functionName: 'setTargetWindow',
        args: [BigInt(targetWindows[windowIndex]), true],
      });
    }
  }, [step, createdBountyAddress, isPending, isConfirming, isConfirmed, windowIndex, targetWindows, writeContract]);

  const createBounty = (bountyMode: 'ongoing' | 'specific', windows: number[]) => {
    setMode(bountyMode);
    setTargetWindows(windows);
    setStep('create');
    setWindowIndex(0);
    setCreatedBountyAddress(null);

    const depositWei = parseEther(depositEth || '0');
    const executorRewardWei = parseEther(executorRewardEth || '0');

    writeContract({
      address: BOUNTY_FACTORY_ADDRESS,
      abi: BOUNTY_FACTORY_ABI,
      functionName: 'createAndConfigure',
      args: [BigInt(mintsPerWindow), executorRewardWei],
      value: depositWei,
    });
  };

  const reset = () => {
    resetWrite();
    setStep('create');
    setWindowIndex(0);
    setCreatedBountyAddress(null);
  };

  const isFullyConfirmed = step === 'done';
  const currentStep = step === 'create' ? 'creating bounty' :
    step === 'setMode' ? 'setting mode' :
    step === 'addWindows' ? `adding window ${windowIndex + 1}/${targetWindows.length}` :
    'complete';

  return {
    mintsPerWindow,
    setMintsPerWindow,
    executorRewardEth,
    setExecutorRewardEth,
    depositEth,
    setDepositEth,
    createBounty,
    isPending,
    isConfirming,
    isConfirmed: isFullyConfirmed,
    isProcessing: (isPending || isConfirming) && step !== 'done',
    currentStep,
    error,
    txHash,
    createdBountyAddress,
    reset,
  };
}

export function useExecuteBounty(bountyAddress: `0x${string}` | undefined) {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const execute = () => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'execute',
    });
  };

  return {
    execute,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    txHash,
    reset,
  };
}

export function useManageBounty(bountyAddress: `0x${string}` | undefined) {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Read specificWindowsOnly state
  const { data: specificWindowsOnly, refetch: refetchSpecificWindows } = useReadContract({
    address: bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'specificWindowsOnly',
    query: {
      enabled: !!bountyAddress,
    },
  });

  const configure = (mintsPerWindow: number, executorRewardWei: bigint) => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'configure',
      args: [BigInt(mintsPerWindow), executorRewardWei],
    });
  };

  const setPaused = (paused: boolean) => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'setPaused',
      args: [paused],
    });
  };

  const setSpecificWindowsOnly = (enabled: boolean) => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'setSpecificWindowsOnly',
      args: [enabled],
    });
  };

  const setTargetWindow = (windowId: number, enabled: boolean) => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'setTargetWindow',
      args: [BigInt(windowId), enabled],
    });
  };

  const withdraw = (amountWei: bigint) => {
    if (!bountyAddress) return;
    writeContract({
      address: bountyAddress,
      abi: BOUNTY_ABI,
      functionName: 'withdraw',
      args: [amountWei],
    });
  };

  return {
    configure,
    setPaused,
    setSpecificWindowsOnly,
    setTargetWindow,
    withdraw,
    specificWindowsOnly: specificWindowsOnly as boolean | undefined,
    refetchSpecificWindows,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    txHash,
    reset,
  };
}

export function useTargetWindows(bountyAddress: `0x${string}` | undefined, windowIds: number[]) {
  // Check which windows are targeted
  const contracts = windowIds.map((id) => ({
    address: bountyAddress as `0x${string}`,
    abi: BOUNTY_ABI,
    functionName: 'targetWindows' as const,
    args: [BigInt(id)],
  }));

  const { data: results, refetch } = useReadContract({
    address: bountyAddress,
    abi: BOUNTY_ABI,
    functionName: 'specificWindowsOnly',
    query: {
      enabled: !!bountyAddress && windowIds.length > 0,
    },
  });

  // For now just return empty - we'd need useReadContracts for batch
  return {
    targetedWindows: [] as number[],
    refetch,
  };
}

export interface ClaimedBounty {
  bountyAddress: `0x${string}`;
  claimer: `0x${string}`;
  windowId: number;
  quantity: number;
  reward: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export function useRecentClaims(bountyAddresses: `0x${string}`[]) {
  const publicClient = usePublicClient();
  const [claims, setClaims] = useState<ClaimedBounty[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!publicClient || bountyAddresses.length === 0) {
      setClaims([]);
      return;
    }

    const fetchClaims = async () => {
      setIsLoading(true);
      try {
        const allClaims: ClaimedBounty[] = [];

        // Fetch logs from each bounty contract (last ~10000 blocks)
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > BigInt(10000) ? currentBlock - BigInt(10000) : BigInt(0);

        for (const bountyAddress of bountyAddresses) {
          try {
            const logs = await publicClient.getLogs({
              address: bountyAddress,
              event: parseAbiItem('event BountyExecuted(address indexed executor, uint256 windowId, uint256 quantity, uint256 reward)'),
              fromBlock,
              toBlock: 'latest',
            });

            for (const log of logs) {
              allClaims.push({
                bountyAddress,
                claimer: log.args.executor as `0x${string}`,
                windowId: Number(log.args.windowId),
                quantity: Number(log.args.quantity),
                reward: log.args.reward as bigint,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
              });
            }
          } catch (e) {
            // Skip if error fetching logs for this bounty
            console.error(`Error fetching logs for ${bountyAddress}:`, e);
          }
        }

        // Sort by block number descending (most recent first)
        allClaims.sort((a, b) => Number(b.blockNumber - a.blockNumber));

        setClaims(allClaims);
      } catch (e) {
        console.error('Error fetching claims:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClaims();
  }, [publicClient, bountyAddresses.join(',')]);

  return { claims, isLoading };
}
