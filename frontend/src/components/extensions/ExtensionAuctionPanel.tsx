'use client';

import { useMemo, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, EXTENSIONS_AUCTION_ABI } from '@/lib/contracts';
import { useExtensionAuction } from '@/hooks/useExtensionAuction';
import { useLessBalance } from '@/hooks/useLessBalance';
import { formatTokenBalance, getTxUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface ExtensionAuctionPanelProps {
  tokenId: number;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function ExtensionAuctionPanel({ tokenId }: ExtensionAuctionPanelProps) {
  const { address } = useAccount();
  const [bidMode, setBidMode] = useState<'less' | 'eth'>('less');
  const [bidAmount, setBidAmount] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [swapCompleted, setSwapCompleted] = useState(false);

  const auctionAddress = CONTRACTS.EXTENSIONS_AUCTION;
  const auctionConfigured = auctionAddress !== ZERO_ADDRESS;

  const {
    auctionData,
    auctionCreated,
    active,
    ended,
    minReservePrice,
    minBidIncrementPercentage,
    isLoading,
    configured,
  } = useExtensionAuction(tokenId);

  const { balance, allowance } = useLessBalance(auctionConfigured ? auctionAddress : undefined);

  const minBid = useMemo(() => {
    if (auctionCreated && auctionData.amount > BigInt(0)) {
      return auctionData.amount + (auctionData.amount * BigInt(minBidIncrementPercentage)) / BigInt(100);
    }
    return auctionCreated ? auctionData.reservePrice : minReservePrice;
  }, [auctionCreated, auctionData.amount, auctionData.reservePrice, minReservePrice, minBidIncrementPercentage]);

  const bidAmountWei = useMemo(() => {
    try {
      return bidAmount ? parseEther(bidAmount) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [bidAmount]);

  const approveNeeded = bidAmountWei > BigInt(0) && allowance < bidAmountWei;

  const approveWrite = useWriteContract();
  const bidWrite = useWriteContract();
  const settleWrite = useWriteContract();

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveWrite.data });
  const bidReceipt = useWaitForTransactionReceipt({ hash: bidWrite.data });
  const settleReceipt = useWaitForTransactionReceipt({ hash: settleWrite.data });

  const handleApprove = () => {
    if (!auctionConfigured) return;
    approveWrite.writeContract({
      address: CONTRACTS.LESS_STRATEGY,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [auctionAddress, bidAmountWei],
    });
  };

  const handleBid = () => {
    if (!auctionConfigured || bidAmountWei === BigInt(0)) return;

    if (!auctionCreated) {
      bidWrite.writeContract({
        address: auctionAddress,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'createAuctionWithBid',
        args: [BigInt(tokenId), bidAmountWei],
      });
      return;
    }

    bidWrite.writeContract({
      address: auctionAddress,
      abi: EXTENSIONS_AUCTION_ABI,
      functionName: 'createBid',
      args: [BigInt(tokenId), bidAmountWei],
    });
  };

  const handleSettle = () => {
    if (!auctionConfigured) return;
    settleWrite.writeContract({
      address: auctionAddress,
      abi: EXTENSIONS_AUCTION_ABI,
      functionName: 'settleAuction',
      args: [BigInt(tokenId)],
    });
  };

  const openSwapUrl = () => {
    const url =
      process.env.NEXT_PUBLIC_UNISWAP_SWAP_URL ||
      `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${CONTRACTS.LESS_STRATEGY}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!configured || !auctionConfigured) {
    return (
      <div className="border border-border p-4 text-sm text-muted">
        auction contract not configured yet
      </div>
    );
  }

  return (
    <div className="border border-border p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg">auction</h2>
        {isLoading ? (
          <p className="text-sm text-muted">loading auction state…</p>
        ) : (
          <div className="text-sm text-muted space-y-1">
            <div>reserve: {formatEther(minReservePrice)} $LESS</div>
            {auctionCreated && auctionData.amount > BigInt(0) && (
              <div>current bid: {formatEther(auctionData.amount)} $LESS</div>
            )}
            {auctionCreated && auctionData.bidder && (
              <div>leader: {auctionData.bidder.slice(0, 6)}…{auctionData.bidder.slice(-4)}</div>
            )}
            {active && auctionData.firstBidTime > 0 && (
              <div>
                ends: {new Date((auctionData.firstBidTime + auctionData.duration) * 1000).toLocaleString()}
              </div>
            )}
            {!auctionCreated && <div>auction not started</div>}
            {ended && <div>auction ended — ready to settle</div>}
            {auctionData.settled && <div>auction settled</div>}
          </div>
        )}
      </div>

      {ended && !auctionData.settled && (
        <div className="space-y-3">
          <Button onClick={handleSettle} disabled={settleWrite.isPending || settleReceipt.isLoading}>
            {settleReceipt.isLoading ? 'settling…' : 'settle auction'}
          </Button>
          {settleWrite.data && (
            <a
              className="text-xs text-muted hover:underline"
              href={getTxUrl(settleWrite.data)}
              target="_blank"
              rel="noopener noreferrer"
            >
              view transaction →
            </a>
          )}
        </div>
      )}

      {!auctionData.settled && !ended && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs">
            <button
              className={bidMode === 'less' ? 'text-foreground' : 'text-muted'}
              onClick={() => setBidMode('less')}
            >
              bid with $LESS
            </button>
            <span className="text-muted">|</span>
            <button
              className={bidMode === 'eth' ? 'text-foreground' : 'text-muted'}
              onClick={() => setBidMode('eth')}
            >
              bid with ETH
            </button>
          </div>

          <div className="space-y-3">
            <div className="text-xs text-muted">
              balance: {formatTokenBalance(balance.toString(), false)} $LESS
            </div>
            <input
              className="w-full bg-background border border-border px-3 py-2 text-sm"
              placeholder={`bid amount in $LESS (min ${formatEther(minBid)})`}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
          </div>

          {bidMode === 'less' && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {approveNeeded && (
                  <Button
                    variant="outline"
                    onClick={handleApprove}
                    disabled={approveWrite.isPending || approveReceipt.isLoading || bidAmountWei === BigInt(0)}
                  >
                    {approveReceipt.isLoading ? 'approving…' : 'approve $LESS'}
                  </Button>
                )}
                <Button
                  onClick={handleBid}
                  disabled={
                    bidWrite.isPending ||
                    bidReceipt.isLoading ||
                    bidAmountWei === BigInt(0) ||
                    bidAmountWei < minBid ||
                    (approveNeeded && !approveReceipt.isSuccess)
                  }
                >
                  {bidWrite.isPending || bidReceipt.isLoading
                    ? 'placing bid…'
                    : auctionCreated
                    ? 'place bid'
                    : 'start auction'}
                </Button>
              </div>
              {approveWrite.data && (
                <a
                  className="text-xs text-muted hover:underline"
                  href={getTxUrl(approveWrite.data)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  approval transaction →
                </a>
              )}
              {bidWrite.data && (
                <a
                  className="text-xs text-muted hover:underline"
                  href={getTxUrl(bidWrite.data)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  bid transaction →
                </a>
              )}
              {bidAmountWei > BigInt(0) && bidAmountWei < minBid && (
                <p className="text-xs text-red-600">bid must be at least {formatEther(minBid)} $LESS</p>
              )}
            </div>
          )}

          {bidMode === 'eth' && (
            <div className="space-y-4">
              <div className="text-xs text-muted">
                ETH bids are swapped to $LESS first, then approved and bid. This is a 3‑step flow.
              </div>
              <input
                className="w-full bg-background border border-border px-3 py-2 text-sm"
                placeholder="ETH amount"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={openSwapUrl} disabled={!ethAmount}>
                  swap ETH → $LESS
                </Button>
                <label className="text-xs text-muted flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={swapCompleted}
                    onChange={(e) => setSwapCompleted(e.target.checked)}
                  />
                  I completed the swap
                </label>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleApprove}
                  disabled={!swapCompleted || approveWrite.isPending || approveReceipt.isLoading || bidAmountWei === BigInt(0)}
                >
                  {approveReceipt.isLoading ? 'approving…' : 'approve $LESS'}
                </Button>
                <Button
                  onClick={handleBid}
                  disabled={
                    !swapCompleted ||
                    bidWrite.isPending ||
                    bidReceipt.isLoading ||
                    bidAmountWei === BigInt(0) ||
                    bidAmountWei < minBid ||
                    (approveNeeded && !approveReceipt.isSuccess)
                  }
                >
                  {bidWrite.isPending || bidReceipt.isLoading
                    ? 'placing bid…'
                    : auctionCreated
                    ? 'place bid'
                    : 'start auction'}
                </Button>
              </div>
              <p className="text-xs text-muted">
                After the swap, enter the $LESS amount you want to bid in the field above.
              </p>
            </div>
          )}
        </div>
      )}

      {!address && (
        <p className="text-xs text-muted">connect a wallet to place a bid</p>
      )}
    </div>
  );
}
