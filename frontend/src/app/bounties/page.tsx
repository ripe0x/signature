'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import Link from 'next/link';
import { useBounties, useUserBounty, useCreateBounty, useManageBounty } from '@/hooks/useBounties';
import { useTokenStats } from '@/hooks/useTokenStats';
import { BountyCard } from '@/components/bounties/BountyCard';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { formatEth, truncateAddress, getAddressUrl, getTxUrl } from '@/lib/utils';
import { CONTRACTS, LESS_NFT_ABI } from '@/lib/contracts';

// Format USD value
function formatUsd(ethAmount: number, ethPrice: number | null): string {
  if (!ethPrice) return '';
  const usd = ethAmount * ethPrice;
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

function CreateBountyForm({ onSuccess, ethPrice, currentWindowId }: { onSuccess?: () => void; ethPrice: number | null; currentWindowId: number }) {
  const [mode, setMode] = useState<'ongoing' | 'specific'>('ongoing');
  const [targetWindows, setTargetWindows] = useState('');

  const {
    mintsPerWindow,
    setMintsPerWindow,
    executorRewardEth,
    setExecutorRewardEth,
    depositEth,
    setDepositEth,
    createBounty,
    isPending,
    isConfirming,
    isConfirmed,
    isProcessing,
    currentStep,
    error,
    txHash,
    createdBountyAddress,
    reset,
  } = useCreateBounty();

  // Get base mint price from the LESS contract
  const { data: baseMintPriceWei } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'mintPrice',
    query: { refetchInterval: 30000 },
  });

  // Get actual mint cost for quantity (uses escalating pricing)
  // Use zero address to simulate a fresh bounty with 0 previous mints this window
  const { data: mintCostWei } = useReadContract({
    address: CONTRACTS.LESS_NFT,
    abi: LESS_NFT_ABI,
    functionName: 'getMintCost',
    args: ['0x0000000000000000000000000000000000000000', BigInt(mintsPerWindow)],
    query: {
      refetchInterval: 10000,
      placeholderData: (prev) => prev, // Keep previous data while fetching new
    },
  });

  // Parse and validate target windows
  const parsedWindows = useMemo(() => {
    if (mode !== 'specific' || !targetWindows.trim()) {
      return { all: [], valid: [], past: [], duplicates: [] };
    }

    const parsed = targetWindows
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0);

    // Dedupe
    const seen = new Set<number>();
    const duplicates: number[] = [];
    const unique: number[] = [];
    for (const id of parsed) {
      if (seen.has(id)) {
        duplicates.push(id);
      } else {
        seen.add(id);
        unique.push(id);
      }
    }

    // Split into past and valid (current or future)
    const past = unique.filter(id => id < currentWindowId);
    const valid = unique.filter(id => id >= currentWindowId);

    return { all: unique, valid, past, duplicates };
  }, [mode, targetWindows, currentWindowId]);

  const canSubmit = mode === 'ongoing' || parsedWindows.valid.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'specific' && parsedWindows.valid.length === 0) return;
    // Only submit valid (non-past) windows, deduped
    createBounty(mode, parsedWindows.valid);
  };

  if (isConfirmed) {
    return (
      <div className="p-6 border border-border space-y-4">
        <div className="text-center">
          <div className="inline-block px-4 py-2 bg-green-100 text-green-800 text-sm mb-4">
            bounty created!
          </div>
        </div>
        {createdBountyAddress && (
          <div className="text-sm text-center">
            <span className="text-muted">contract: </span>
            <a
              href={getAddressUrl(createdBountyAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-mono"
            >
              {truncateAddress(createdBountyAddress, 6)}
            </a>
          </div>
        )}
        {txHash && (
          <div className="text-center">
            <a
              href={getTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-foreground"
            >
              view transaction
            </a>
          </div>
        )}
        <button
          onClick={() => {
            reset();
            onSuccess?.();
          }}
          className="w-full py-2 border border-foreground hover:bg-foreground hover:text-background transition-colors text-sm"
        >
          create another
        </button>
      </div>
    );
  }

  // Calculate costs for display
  const claimerReward = parseFloat(executorRewardEth) || 0;
  const baseMintPrice = baseMintPriceWei ? parseFloat(formatEther(baseMintPriceWei)) : 0;
  const mintCost = mintCostWei ? parseFloat(formatEther(mintCostWei)) : 0;
  const totalPerWindow = claimerReward + mintCost;
  const deposit = parseFloat(depositEth) || 0;
  const windowsCovered = deposit > 0 && totalPerWindow > 0 ? Math.floor(deposit / totalPerWindow) : 0;

  return (
    <form onSubmit={handleSubmit} className="p-6 border border-border space-y-6">
      <h3 className="text-lg">create bounty</h3>

      {/* Base mint price info */}
      {baseMintPrice > 0 && (
        <div className="text-xs text-muted">
          current mint price: {baseMintPrice.toFixed(4)} ETH {ethPrice && `(${formatUsd(baseMintPrice, ethPrice)})`} per NFT
        </div>
      )}

      {/* Window targeting */}
      <div className="space-y-3">
        <label className="block text-sm text-muted">window targeting</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('ongoing')}
            className={`p-3 border text-left transition-colors ${
              mode === 'ongoing'
                ? 'border-foreground bg-foreground/5'
                : 'border-border hover:border-foreground/50'
            }`}
          >
            <div className="text-sm font-medium">all windows</div>
            <div className="text-xs text-muted mt-1">mint every window</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('specific')}
            className={`p-3 border text-left transition-colors ${
              mode === 'specific'
                ? 'border-foreground bg-foreground/5'
                : 'border-border hover:border-foreground/50'
            }`}
          >
            <div className="text-sm font-medium">specific</div>
            <div className="text-xs text-muted mt-1">choose which windows</div>
          </button>
        </div>

        {mode === 'specific' && (
          <div>
            <label className="block text-sm text-muted mb-2">target windows</label>
            <input
              type="text"
              value={targetWindows}
              onChange={(e) => setTargetWindows(e.target.value)}
              placeholder={`e.g. ${currentWindowId}, ${currentWindowId + 1}, ${currentWindowId + 2}`}
              className="w-full px-3 py-2 border border-border bg-transparent focus:outline-none focus:border-foreground text-sm"
            />
            <p className="text-xs text-muted mt-1">
              comma-separated. current window is {currentWindowId}.
            </p>
            {parsedWindows.past.length > 0 && (
              <p className="text-xs text-yellow-600 mt-1">
                past windows ignored: {parsedWindows.past.join(', ')}
              </p>
            )}
            {parsedWindows.duplicates.length > 0 && (
              <p className="text-xs text-yellow-600 mt-1">
                duplicates removed: {parsedWindows.duplicates.join(', ')}
              </p>
            )}
            {targetWindows.trim() && parsedWindows.valid.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                no valid windows. enter window {currentWindowId} or higher.
              </p>
            )}
            {parsedWindows.valid.length > 0 && (
              <p className="text-xs text-green-600 mt-1">
                will target: {parsedWindows.valid.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Summary box - the key info upfront */}
      <div className="p-4 bg-foreground/5 border border-border">
        <div className="text-center space-y-1">
          <div className="text-2xl font-medium">
            {totalPerWindow.toFixed(4)} ETH
            {ethPrice && <span className="text-base text-muted ml-2">({formatUsd(totalPerWindow, ethPrice)})</span>}
          </div>
          <div className="text-sm text-muted">per window for {mintsPerWindow} LESS</div>
        </div>
      </div>

      {/* Simple config */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted mb-2">NFTs per window</label>
            <input
              type="number"
              min="1"
              max="10"
              value={mintsPerWindow}
              onChange={(e) => setMintsPerWindow(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-border bg-transparent focus:outline-none focus:border-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-2">claimer reward</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={executorRewardEth}
                onChange={(e) => setExecutorRewardEth(e.target.value)}
                placeholder="0.0003"
                className="w-full px-3 py-2 border border-border bg-transparent focus:outline-none focus:border-foreground text-sm pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">ETH</span>
            </div>
            {ethPrice && executorRewardEth && (
              <div className="text-xs text-muted mt-1">{formatUsd(parseFloat(executorRewardEth) || 0, ethPrice)}</div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted mb-2">deposit</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={depositEth}
              onChange={(e) => setDepositEth(e.target.value)}
              placeholder="0.1"
              className="w-full px-3 py-2 border border-border bg-transparent focus:outline-none focus:border-foreground text-sm pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">ETH</span>
          </div>
          {ethPrice && depositEth && (
            <div className="text-xs text-muted mt-1">{formatUsd(parseFloat(depositEth) || 0, ethPrice)}</div>
          )}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="text-xs space-y-1.5 text-muted">
        {mintsPerWindow > 1 && (
          <div className="flex justify-between">
            <span>base mint price</span>
            <span>{baseMintPrice.toFixed(4)} ETH {ethPrice && `(${formatUsd(baseMintPrice, ethPrice)})`}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>mint cost ({mintsPerWindow} NFT{mintsPerWindow > 1 ? 's' : ''})</span>
          <span>{mintCost.toFixed(4)} ETH {ethPrice && `(${formatUsd(mintCost, ethPrice)})`}</span>
        </div>
        <div className="flex justify-between">
          <span>claimer reward per window</span>
          <span>{claimerReward.toFixed(4)} ETH {ethPrice && `(${formatUsd(claimerReward, ethPrice)})`}</span>
        </div>
        {deposit > 0 && windowsCovered > 0 && (
          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-border">
            <span>deposit covers</span>
            <span>{windowsCovered} window{windowsCovered !== 1 ? 's' : ''} → {windowsCovered * mintsPerWindow} LESS</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-sm">
          <p className="text-red-800">
            {error.message.includes('User rejected') ? 'cancelled' : 'creation failed'}
          </p>
          <button onClick={reset} className="text-red-600 hover:underline text-xs mt-1">
            try again
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={isProcessing || !canSubmit}
        className="w-full py-3 border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? currentStep : 'create bounty'}
      </button>

      {mode === 'specific' && !isProcessing && parsedWindows.valid.length > 0 && (
        <p className="text-xs text-muted text-center">
          will require {parsedWindows.valid.length + 2} transactions
        </p>
      )}
    </form>
  );
}

function ManageBountyCard({ bountyAddress, onUpdate }: { bountyAddress: `0x${string}`; onUpdate: () => void }) {
  const { status } = useUserBounty();
  const {
    configure,
    setPaused,
    setSpecificWindowsOnly,
    setTargetWindow,
    withdraw,
    specificWindowsOnly,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    txHash,
    reset
  } = useManageBounty(bountyAddress);

  const [newMints, setNewMints] = useState(status?.configuredMintsPerWindow?.toString() || '1');
  const [newRewardEth, setNewRewardEth] = useState('0.0003');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [targetWindowId, setTargetWindowId] = useState('');
  const [activeAction, setActiveAction] = useState<'configure' | 'withdraw' | 'pause' | 'targeting' | 'addWindow' | null>(null);

  if (!status) return null;

  const handleConfigure = () => {
    setActiveAction('configure');
    const rewardWei = parseEther(newRewardEth || '0');
    configure(parseInt(newMints) || 1, rewardWei);
  };

  const handleWithdraw = () => {
    setActiveAction('withdraw');
    withdraw(parseEther(withdrawAmount || '0'));
  };

  const handlePause = () => {
    setActiveAction('pause');
    setPaused(!status.isPaused);
  };

  const handleToggleTargeting = () => {
    setActiveAction('targeting');
    setSpecificWindowsOnly(!specificWindowsOnly);
  };

  const parsedTargetWindowId = parseInt(targetWindowId);
  const isValidWindowId = !isNaN(parsedTargetWindowId) && parsedTargetWindowId >= status.currentWindowId;
  const isPastWindow = !isNaN(parsedTargetWindowId) && parsedTargetWindowId > 0 && parsedTargetWindowId < status.currentWindowId;

  const handleAddTargetWindow = () => {
    if (!isValidWindowId) return;
    setActiveAction('addWindow');
    setTargetWindow(parsedTargetWindowId, true);
  };

  const handleReset = () => {
    reset();
    setActiveAction(null);
    setTargetWindowId('');
    onUpdate();
  };

  return (
    <div className="p-6 border border-border space-y-6">
      <div className="flex justify-between items-start">
        <h3 className="text-lg">your bounty</h3>
        <a
          href={getAddressUrl(bountyAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-muted hover:text-foreground"
        >
          {truncateAddress(bountyAddress, 6)}
        </a>
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted text-xs">status</div>
          <div>{status.isPaused ? 'paused' : status.canClaim ? 'claimable' : 'active'}</div>
        </div>
        <div>
          <div className="text-muted text-xs">balance</div>
          <div>{formatEth(status.balance, 4)} ETH</div>
        </div>
        <div>
          <div className="text-muted text-xs">mints/window</div>
          <div>{status.configuredMintsPerWindow}</div>
        </div>
        <div>
          <div className="text-muted text-xs">claimer reward</div>
          <div>{formatEth(status.reward, 4)} ETH</div>
        </div>
        <div>
          <div className="text-muted text-xs">targeting</div>
          <div>{specificWindowsOnly ? 'specific windows' : 'all windows'}</div>
        </div>
        <div>
          <div className="text-muted text-xs">current window</div>
          <div>#{status.currentWindowId} {status.windowActive ? '(open)' : ''}</div>
        </div>
      </div>

      {/* Success message */}
      {isConfirmed && (
        <div className="p-3 bg-green-50 border border-green-200 text-sm space-y-2">
          <p className="text-green-800">
            {activeAction === 'configure' && 'configuration updated!'}
            {activeAction === 'withdraw' && 'withdrawal successful!'}
            {activeAction === 'pause' && (status.isPaused ? 'bounty resumed!' : 'bounty paused!')}
            {activeAction === 'targeting' && (specificWindowsOnly ? 'switched to all windows' : 'switched to specific windows')}
            {activeAction === 'addWindow' && 'target window added!'}
          </p>
          {txHash && (
            <a
              href={getTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline text-xs"
            >
              view transaction
            </a>
          )}
          <button onClick={handleReset} className="block text-green-600 hover:underline text-xs">
            dismiss
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-sm">
          <p className="text-red-800">
            {error.message.includes('User rejected') ? 'cancelled' : 'action failed'}
          </p>
          <button onClick={reset} className="text-red-600 hover:underline text-xs mt-1">
            dismiss
          </button>
        </div>
      )}

      {/* Actions */}
      {!isConfirmed && !error && (
        <div className="space-y-4 pt-4 border-t border-border">
          {/* Configure */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted mb-1">mints/window</label>
                <input
                  type="number"
                  min="1"
                  value={newMints}
                  onChange={(e) => setNewMints(e.target.value)}
                  className="w-full px-2 py-1 border border-border bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">reward (ETH)</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={newRewardEth}
                  onChange={(e) => setNewRewardEth(e.target.value)}
                  placeholder="0.0003"
                  className="w-full px-2 py-1 border border-border bg-transparent text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleConfigure}
              disabled={isPending || isConfirming}
              className="w-full py-1.5 border border-border hover:border-foreground transition-colors text-sm disabled:opacity-50"
            >
              {isPending && activeAction === 'configure' ? 'confirm...' : 'update config'}
            </button>
          </div>

          {/* Withdraw */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-muted mb-1">withdraw amount (ETH)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={formatEth(status.balance, 4)}
                className="w-full px-2 py-1 border border-border bg-transparent text-sm"
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={isPending || isConfirming || !withdrawAmount}
              className="w-full py-1.5 border border-border hover:border-foreground transition-colors text-sm disabled:opacity-50"
            >
              {isPending && activeAction === 'withdraw' ? 'confirm...' : 'withdraw'}
            </button>
          </div>

          {/* Pause/Resume */}
          <button
            onClick={handlePause}
            disabled={isPending || isConfirming}
            className="w-full py-1.5 border border-border hover:border-foreground transition-colors text-sm disabled:opacity-50"
          >
            {isPending && activeAction === 'pause' ? 'confirm...' : status.isPaused ? 'resume bounty' : 'pause bounty'}
          </button>

          {/* Window Targeting */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">window targeting</span>
              <span className="text-xs text-muted">
                {specificWindowsOnly ? 'specific windows only' : 'all windows'}
              </span>
            </div>

            <button
              onClick={handleToggleTargeting}
              disabled={isPending || isConfirming}
              className="w-full py-1.5 border border-border hover:border-foreground transition-colors text-sm disabled:opacity-50"
            >
              {isPending && activeAction === 'targeting'
                ? 'confirm...'
                : specificWindowsOnly
                  ? 'switch to all windows'
                  : 'switch to specific windows'}
            </button>

            {specificWindowsOnly && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={status.currentWindowId}
                    value={targetWindowId}
                    onChange={(e) => setTargetWindowId(e.target.value)}
                    placeholder={`window # (≥${status.currentWindowId})`}
                    className="flex-1 px-2 py-1 border border-border bg-transparent text-sm"
                  />
                  <button
                    onClick={handleAddTargetWindow}
                    disabled={isPending || isConfirming || !isValidWindowId}
                    className="px-3 py-1 border border-border hover:border-foreground transition-colors text-sm disabled:opacity-50"
                  >
                    {isPending && activeAction === 'addWindow' ? '...' : 'add'}
                  </button>
                </div>
                {isPastWindow && (
                  <p className="text-xs text-yellow-600">
                    window {parsedTargetWindowId} is in the past. enter {status.currentWindowId} or higher.
                  </p>
                )}
                <p className="text-xs text-muted">
                  current window: {status.currentWindowId}. bounty only executes for targeted windows.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DepositCard({ bountyAddress }: { bountyAddress: `0x${string}` }) {
  const [amount, setAmount] = useState('0.01');
  const [isPending, setIsPending] = useState(false);

  // Simple deposit via sending ETH directly to the contract
  // The bounty contract should accept ETH via receive()

  return (
    <div className="p-4 border border-border space-y-3">
      <h4 className="text-sm">add funds</h4>
      <div className="flex gap-2">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.01"
          className="flex-1 px-2 py-1.5 border border-border bg-transparent text-sm"
        />
        <span className="py-1.5 text-sm text-muted">ETH</span>
      </div>
      <p className="text-xs text-muted">
        send ETH directly to{' '}
        <a
          href={getAddressUrl(bountyAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline font-mono"
        >
          {truncateAddress(bountyAddress, 4)}
        </a>
      </p>
    </div>
  );
}

export default function BountiesPage() {
  const { isConnected, address } = useAccount();
  const { bounties, claimableBounties, currentWindowId, isWindowActive, isLoading, refetch } = useBounties();
  const { bountyAddress, hasBounty, status } = useUserBounty();
  const { ethPrice } = useTokenStats();

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-3xl">mint bounties</h1>
            <p className="text-muted max-w-xl">
              set up automated minting for LESS. deposit ETH to fund mint costs and offer a
              reward for whoever triggers the mint.
            </p>
          </div>

          {/* Current window status */}
          <div className="p-4 border border-border flex justify-between items-center">
            <div>
              <span className="text-muted text-sm">window {currentWindowId}</span>
              {isWindowActive && (
                <span className="ml-2 inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs">
                  active
                </span>
              )}
            </div>
            <div className="text-sm">
              <span className="text-muted">{claimableBounties.length} claimable</span>
            </div>
          </div>

          {/* How it works */}
          <div className="space-y-4">
            <h2 className="text-lg">how it works</h2>
            <div className="space-y-3 text-sm">
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">01</span>
                <span>create a bounty contract and configure mints per window + reward</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">02</span>
                <span>deposit ETH to cover mint costs and rewards</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">03</span>
                <span>when a window opens, anyone can execute your bounty to claim the reward</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted w-8 shrink-0">04</span>
                <span>the minted LESS tokens are sent directly to you</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left column - Create/Manage */}
            <div className="space-y-6">
              {!isConnected ? (
                <div className="p-6 border border-border text-center space-y-4">
                  <p className="text-muted">connect wallet to create a bounty</p>
                  <ConnectButton />
                </div>
              ) : hasBounty && bountyAddress ? (
                <>
                  <ManageBountyCard bountyAddress={bountyAddress} onUpdate={refetch} />
                  <DepositCard bountyAddress={bountyAddress} />
                </>
              ) : (
                <CreateBountyForm onSuccess={refetch} ethPrice={ethPrice} currentWindowId={currentWindowId} />
              )}
            </div>

            {/* Right column - Active bounties */}
            <div className="space-y-4">
              <h2 className="text-lg">active bounties</h2>

              {isLoading ? (
                <div className="p-6 border border-border text-center">
                  <p className="text-muted animate-pulse">loading...</p>
                </div>
              ) : bounties.length === 0 ? (
                <div className="p-6 border border-border text-center">
                  <p className="text-muted">no bounties yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bounties.map((bounty) => (
                    <BountyCard
                      key={bounty.bountyAddress}
                      bounty={bounty}
                      onExecuteSuccess={refetch}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
