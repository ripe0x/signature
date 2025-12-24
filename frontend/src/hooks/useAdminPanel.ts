'use client';

import { useReadContract, useWriteContract, useAccount, useBalance, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, LESS_NFT_ABI, STRATEGY_ABI, ADMIN_ADDRESS } from '@/lib/contracts';
import { useEffect, useState, useCallback } from 'react';
import { formatEther } from 'viem';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

export interface TwitterBotState {
  processedWindows: number[];
  processedMints: number[];
  fifteenMinReminders: number[];
  processedEndedWindows: number[];
  windowReadyAlerted: boolean;
  lastBalanceProgressPost: number | null;
  lastBlock: string;
  updatedAt: string;
}

export interface TweetPreview {
  type: 'balance' | 'window' | 'mint';
  text: string;
  tokenId?: number;
  windowId?: number;
}

export function useAdminPanel() {
  const { address, isConnected } = useAccount();
  const [twitterBotState, setTwitterBotState] = useState<TwitterBotState | null>(null);
  const [twitterBotError, setTwitterBotError] = useState<string | null>(null);
  const [isLoadingBotState, setIsLoadingBotState] = useState(false);
  const [tweetPreview, setTweetPreview] = useState<TweetPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPostingTweet, setIsPostingTweet] = useState(false);
  const [postTweetResult, setPostTweetResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Check if current user is admin
  const isAdmin = isConnected && address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  // Contract balance
  const { data: contractBalance, refetch: refetchContractBalance } = useBalance({
    address: CONTRACTS.LESS_NFT,
  });

  // Strategy balance
  const { data: strategyBalance } = useBalance({
    address: CONTRACTS.LESS_STRATEGY,
  });

  // Read contract settings
  const { data: mintPrice } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'mintPrice',
  });

  const { data: windowDuration } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowDuration',
  });

  const { data: minEthForWindow } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'minEthForWindow',
  });

  const { data: payoutRecipient } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'payoutRecipient',
  });

  const { data: owner } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'owner',
  });

  const { data: canCreateWindow } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'canCreateWindow',
    query: {
      refetchInterval: 10000,
    },
  });

  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'totalSupply',
  });

  const { data: windowCount } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'windowCount',
  });

  // Strategy cooldown
  const { data: timeUntilFundsMoved } = useReadContract({
    address: CONTRACTS.LESS_STRATEGY,
    abi: STRATEGY_ABI,
    functionName: 'timeUntilFundsMoved',
    query: {
      refetchInterval: 10000,
    },
  });

  // Withdraw transaction
  const {
    writeContract,
    data: withdrawTxHash,
    isPending: isWithdrawPending,
    error: withdrawError,
    reset: resetWithdraw,
  } = useWriteContract();

  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawConfirmed } = useWaitForTransactionReceipt({
    hash: withdrawTxHash,
  });

  // Refetch balance after successful withdraw
  useEffect(() => {
    if (isWithdrawConfirmed) {
      refetchContractBalance();
    }
  }, [isWithdrawConfirmed, refetchContractBalance]);

  const withdraw = useCallback(() => {
    if (!isAdmin) return;
    writeContract({
      address: CONTRACTS.LESS_NFT,
      abi: LESS_NFT_ABI,
      functionName: 'withdraw',
    });
  }, [writeContract, isAdmin]);

  // Fetch Twitter bot state
  const fetchTwitterBotState = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingBotState(true);
    setTwitterBotError(null);
    try {
      const res = await fetch(`${IMAGE_API_URL}/api/admin/twitter-status`);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data = await res.json();
      setTwitterBotState(data);
    } catch (err) {
      setTwitterBotError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoadingBotState(false);
    }
  }, [isAdmin]);

  // Fetch on mount if admin
  useEffect(() => {
    if (isAdmin) {
      fetchTwitterBotState();
    }
  }, [isAdmin, fetchTwitterBotState]);

  // Preview tweet
  const previewTweet = useCallback(async (type: 'balance' | 'window' | 'mint', params: { tokenId?: string; windowId?: string } = {}) => {
    if (!isAdmin) return;
    setIsPreviewLoading(true);
    setTweetPreview(null);
    setPostTweetResult(null);
    try {
      const res = await fetch(`${IMAGE_API_URL}/api/admin/twitter-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          tokenId: params.tokenId ? parseInt(params.tokenId, 10) : undefined,
          windowId: params.windowId ? parseInt(params.windowId, 10) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed: ${res.status}`);
      }
      const data = await res.json();
      setTweetPreview({
        type,
        text: data.preview,
        tokenId: params.tokenId ? parseInt(params.tokenId, 10) : undefined,
        windowId: params.windowId ? parseInt(params.windowId, 10) : undefined,
      });
    } catch (err) {
      setTweetPreview(null);
      setPostTweetResult({ success: false, error: err instanceof Error ? err.message : 'Preview failed' });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [isAdmin]);

  // Post tweet
  const postTweet = useCallback(async () => {
    if (!isAdmin || !tweetPreview || !address) return;
    setIsPostingTweet(true);
    setPostTweetResult(null);
    try {
      const res = await fetch(`${IMAGE_API_URL}/api/admin/twitter-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tweetPreview.type,
          tokenId: tweetPreview.tokenId,
          windowId: tweetPreview.windowId,
          address,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed: ${res.status}`);
      }
      setPostTweetResult({ success: true });
      setTweetPreview(null);
      // Refresh bot state after posting
      fetchTwitterBotState();
    } catch (err) {
      setPostTweetResult({ success: false, error: err instanceof Error ? err.message : 'Post failed' });
    } finally {
      setIsPostingTweet(false);
    }
  }, [isAdmin, tweetPreview, address, fetchTwitterBotState]);

  const clearTweetPreview = useCallback(() => {
    setTweetPreview(null);
    setPostTweetResult(null);
  }, []);

  // Format helpers
  const formatContractBalance = contractBalance ? formatEther(contractBalance.value) : '0';
  const formatStrategyBalance = strategyBalance ? formatEther(strategyBalance.value) : '0';
  const strategyProgress = minEthForWindow && strategyBalance
    ? Math.min(100, Number((strategyBalance.value * BigInt(100)) / minEthForWindow))
    : 0;

  return {
    // Auth
    isAdmin,
    isConnected,

    // Contract state
    contractBalance: contractBalance?.value ?? BigInt(0),
    formatContractBalance,
    strategyBalance: strategyBalance?.value ?? BigInt(0),
    formatStrategyBalance,
    strategyProgress,
    mintPrice: mintPrice ?? BigInt(0),
    windowDuration: windowDuration ? Number(windowDuration) : 0,
    minEthForWindow: minEthForWindow ?? BigInt(0),
    payoutRecipient: payoutRecipient as `0x${string}` | undefined,
    owner: owner as `0x${string}` | undefined,
    canCreateWindow: !!canCreateWindow,
    timeUntilFundsMoved: timeUntilFundsMoved ? Number(timeUntilFundsMoved) : 0,
    totalSupply: totalSupply ? Number(totalSupply) : 0,
    windowCount: windowCount ? Number(windowCount) : 0,

    // Withdraw
    withdraw,
    isWithdrawPending,
    isWithdrawConfirming,
    isWithdrawConfirmed,
    withdrawError: withdrawError as Error | null,
    withdrawTxHash,
    resetWithdraw,

    // Twitter bot
    twitterBotState,
    twitterBotError,
    isLoadingBotState,
    fetchTwitterBotState,

    // Tweet actions
    tweetPreview,
    previewTweet,
    isPreviewLoading,
    postTweet,
    isPostingTweet,
    postTweetResult,
    clearTweetPreview,
  };
}
