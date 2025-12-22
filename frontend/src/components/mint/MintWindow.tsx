"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useMintWindow } from "@/hooks/useMintWindow";
import { useTokenStats } from "@/hooks/useTokenStats";
import { CountdownTimer } from "./CountdownTimer";
import { MintButton } from "./MintButton";
import { CONTRACTS } from "@/lib/contracts";
import { formatCountdown, formatEth, getAddressUrl, getTxUrl } from "@/lib/utils";
import { useMemo } from "react";

// Progress bar for balance to threshold
function BalanceProgress({
  current,
  threshold,
}: {
  current: number;
  threshold: number;
}) {
  const percentage = Math.min((current / threshold) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted">balance</span>
        <span>
          {current.toFixed(4)} / {threshold} ETH
        </span>
      </div>
      <div className="h-2 bg-border overflow-hidden">
        <div
          className="h-full bg-foreground transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted text-center">
        {percentage < 100
          ? `${(threshold - current).toFixed(4)} ETH until next window`
          : "threshold reached — window can open"}
      </p>
    </div>
  );
}

// Helper for BigInt exponentiation (works around TS target limitations)
function bigIntPow(base: bigint, exp: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < exp; i++) {
    result = result * base;
  }
  return result;
}

// Quantity selector component
function QuantitySelector({
  quantity,
  setQuantity,
  basePrice,
  totalCost,
  mintCount,
}: {
  quantity: number;
  setQuantity: (q: number) => void;
  basePrice: bigint;
  totalCost: bigint;
  mintCount: number;
}) {
  const decrease = () => setQuantity(Math.max(1, quantity - 1));
  const increase = () => setQuantity(quantity + 1);

  // Calculate price breakdown for display
  const priceBreakdown = useMemo(() => {
    const items: { n: number; price: bigint }[] = [];
    for (let i = 0; i < quantity; i++) {
      const n = mintCount + i;
      // price(n+1) = basePrice * 1.5^n = basePrice * 3^n / 2^n
      const pow3 = bigIntPow(BigInt(3), n);
      const pow2 = bigIntPow(BigInt(2), n);
      const price = (basePrice * pow3) / pow2;
      items.push({ n: n + 1, price });
    }
    return items;
  }, [basePrice, mintCount, quantity]);

  return (
    <div className="space-y-4">
      {/* Quantity controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={decrease}
          disabled={quantity <= 1}
          className="w-10 h-10 border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          −
        </button>
        <span className="text-2xl font-mono w-12 text-center">{quantity}</span>
        <button
          onClick={increase}
          className="w-10 h-10 border border-border hover:bg-border transition-colors"
        >
          +
        </button>
      </div>

      {/* Price breakdown */}
      {quantity > 1 && (
        <div className="text-xs text-muted space-y-1">
          {priceBreakdown.map(({ n, price }) => (
            <div key={n} className="flex justify-between">
              <span>mint #{n}</span>
              <span>{formatEth(price)} ETH</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 border-t border-border text-foreground">
            <span>total</span>
            <span>{formatEth(totalCost)} ETH</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Pricing info component
function PricingInfo({
  basePrice,
  mintCount,
  isLoading,
}: {
  basePrice: bigint;
  mintCount: number;
  isLoading?: boolean;
}) {
  return (
    <div className="text-xs text-muted space-y-2">
      {mintCount > 0 && (
        <p className="text-foreground">you've minted {mintCount} this window</p>
      )}
      <p>
        {isLoading ? (
          <span className="animate-pulse">loading price...</span>
        ) : (
          <>
            starts at {formatEth(basePrice)} ETH, increases 1.5x per mint.
            resets each window.
          </>
        )}
      </p>
    </div>
  );
}

// Loading placeholder for minting
function MintingPlaceholder({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="inline-block px-3 py-1 bg-foreground/10 text-foreground text-sm mb-4 animate-pulse">
          minting {count} token{count > 1 ? "s" : ""}...
        </div>
      </div>
      <div className={count === 1 ? "" : "grid grid-cols-2 gap-4"}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-border animate-pulse"
            style={{ aspectRatio: "4/5" }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm text-muted">generating...</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple success message after minting
function MintSuccess({
  quantity,
  txHash,
  onMintMore,
}: {
  quantity: number;
  txHash?: `0x${string}`;
  onMintMore: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="inline-block px-4 py-2 bg-green-100 text-green-800 text-sm">
        minted {quantity} token{quantity > 1 ? "s" : ""} successfully!
      </div>

      <div className="space-y-3">
        {txHash && (
          <a
            href={getTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-muted hover:text-foreground"
          >
            view transaction →
          </a>
        )}
        <Link
          href="/collection"
          className="block text-sm text-muted hover:text-foreground"
        >
          view collection →
        </Link>
      </div>

      <button
        onClick={onMintMore}
        className="w-full px-4 py-2 border border-foreground hover:bg-foreground hover:text-background transition-colors"
      >
        mint more
      </button>
    </div>
  );
}

export function MintWindow() {
  const { isConnected } = useAccount();
  const {
    isLoading,
    isActive,
    windowId,
    timeRemaining,
    cooldownRemaining,
    basePrice,
    isPriceLoading,
    totalCost,
    mintCount,
    canCreateWindow,
    windowDuration,
    isWrongNetwork,
    quantity,
    setQuantity,
    mint,
    canMint,
    isMintPending,
    isConfirming,
    isConfirmed,
    mintError,
    mintTxHash,
    mintedQuantity,
    resetMint,
  } = useMintWindow();

  const { windowCount } = useTokenStats();

  const contractUrl = getAddressUrl(CONTRACTS.LESS_NFT);

  // Handle mint with current quantity
  const handleMint = () => {
    mint(quantity);
  };

  // STATE 0: Loading
  if (isLoading) {
    return (
      <div className="space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-3xl">mint LESS</h1>
          <p className="text-muted animate-pulse">loading...</p>
        </div>
        <div className="max-w-md mx-auto">
          <div className="h-48 bg-border/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // STATE 1: Window is open
  if (isActive) {
    return (
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl">mint LESS</h1>
        </div>

        {/* Countdown */}
        <div className="text-center space-y-2">
          <CountdownTimer
            seconds={timeRemaining}
            label={`window ${windowId} closes in`}
          />
          {/* <p className="text-sm text-muted">{mintsThisWindow} minted</p> */}
        </div>

        {/* Mint Section */}
        <div className="max-w-md mx-auto space-y-6">
          {/* Show loading placeholder during confirmation */}
          {isConfirming && mintedQuantity > 0 && (
            <MintingPlaceholder count={mintedQuantity} />
          )}

          {/* Show success message after mint */}
          {isConfirmed && (
            <MintSuccess
              quantity={mintedQuantity}
              txHash={mintTxHash}
              onMintMore={() => {
                resetMint();
                setQuantity(1);
              }}
            />
          )}

          {/* Mint controls - hide during confirming and after confirmed */}
          {!isConfirming && !isConfirmed && (
            <div className="text-center space-y-6">
              {/* Quantity selector */}
              <QuantitySelector
                quantity={quantity}
                setQuantity={setQuantity}
                basePrice={basePrice}
                totalCost={totalCost}
                mintCount={mintCount}
              />

              {/* Mint button */}
              <MintButton
                totalCost={totalCost}
                quantity={quantity}
                canMint={canMint}
                isPending={isMintPending}
                isConfirming={isConfirming}
                isConnected={isConnected}
                isWrongNetwork={isWrongNetwork}
                onMint={handleMint}
              />
              {!isWrongNetwork && (
                <p className="text-xs text-muted text-center">ETH MAINNET</p>
              )}

              {mintError && (
                <div className="p-4 bg-red-50 border border-red-200 text-sm">
                  <p className="text-red-800">
                    {mintError.message.includes("User rejected")
                      ? "transaction cancelled"
                      : "mint failed"}
                  </p>
                  <button
                    onClick={resetMint}
                    className="text-red-600 hover:underline mt-2"
                  >
                    try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pricing info */}
          <div className="pt-4 border-t border-border">
            <PricingInfo
              basePrice={basePrice}
              mintCount={mintCount}
              isLoading={isPriceLoading}
            />
            <div className="mt-4 text-center">
              <a
                href={contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-foreground"
              >
                view contract →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Window closed but threshold met - can create window
  if (canCreateWindow) {
    const nextWindowId = windowCount + 1;

    return (
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl">mint LESS</h1>
          <p className="text-sm text-muted">
            window #{nextWindowId} — ready to open
          </p>
        </div>

        {/* Mint Section */}
        <div className="max-w-md mx-auto space-y-6">
          {/* Show loading placeholder during confirmation */}
          {isConfirming && mintedQuantity > 0 && (
            <MintingPlaceholder count={mintedQuantity} />
          )}

          {/* Show success message after mint */}
          {isConfirmed && (
            <MintSuccess
              quantity={mintedQuantity}
              txHash={mintTxHash}
              onMintMore={() => {
                resetMint();
                setQuantity(1);
              }}
            />
          )}

          {/* Mint button - opens window and mints */}
          {!isConfirming && !isConfirmed && (
            <div className="text-center space-y-6">
              {/* Quantity selector */}
              <QuantitySelector
                quantity={quantity}
                setQuantity={setQuantity}
                basePrice={basePrice}
                totalCost={totalCost}
                mintCount={mintCount}
              />

              <MintButton
                totalCost={totalCost}
                quantity={quantity}
                canMint={canMint}
                isPending={isMintPending}
                isConfirming={isConfirming}
                isConnected={isConnected}
                isWrongNetwork={isWrongNetwork}
                onMint={handleMint}
              />

              {!isWrongNetwork && (
                <p className="text-xs text-muted">
                  first mint triggers buy + burn and opens the window
                </p>
              )}

              {mintError && (
                <div className="p-4 bg-red-50 border border-red-200 text-sm">
                  <p className="text-red-800">
                    {mintError.message.includes("User rejected")
                      ? "transaction cancelled"
                      : "mint failed"}
                  </p>
                  <button
                    onClick={resetMint}
                    className="text-red-600 hover:underline mt-2"
                  >
                    try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pricing info */}
          <div className="pt-4 border-t border-border">
            <PricingInfo
              basePrice={basePrice}
              mintCount={mintCount}
              isLoading={isPriceLoading}
            />
            <div className="mt-4 text-center">
              <a
                href={contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-foreground"
              >
                view contract →
              </a>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center text-sm">
          <div className="text-center">
            <div className="text-muted mb-1">total windows</div>
            <div className="text-2xl">{windowCount}</div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: Window closed and threshold not met (or cooldown in progress)
  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-3xl">mint LESS</h1>
        {cooldownRemaining > 0 ? (
          <p className="text-muted">
            next window available in{" "}
            <span className="text-foreground font-mono">
              {formatCountdown(cooldownRemaining)}
            </span>
          </p>
        ) : (
          <p className="text-muted">no active window</p>
        )}
      </div>

      {/* How it works */}
      <div className="max-w-lg mx-auto space-y-6">
        <div className="p-6 border border-border space-y-4">
          <h2 className="text-lg">how mint windows work</h2>
          <div className="text-sm text-muted space-y-3">
            <p>
              trading fees from the $LESS token accumulate in the recursive
              strategy contract.
            </p>
            <p>
              when the balance reaches{" "}
              <strong className="text-foreground">0.25 ETH</strong>, anyone can
              trigger a burn — the ETH buys and burns $LESS tokens, and a{" "}
              <strong className="text-foreground">90-minute mint window</strong>{" "}
              opens.
            </p>
            <p>
              during the window, mint as many as you like — but price escalates
              <strong className="text-foreground"> 1.5x per mint</strong> per
              wallet. pricing resets each window.
            </p>
          </div>
        </div>

        {/* Balance progress - placeholder for now */}
        {/* <BalanceProgress current={0.12} threshold={0.25} /> */}
      </div>

      {/* Stats */}
      <div className="flex justify-center text-sm">
        <div className="text-center">
          <div className="text-muted mb-1">total windows</div>
          <div className="text-2xl">{windowCount}</div>
        </div>
      </div>

      {/* Contract link */}
      <div className="text-center">
        <a
          href={contractUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted hover:text-foreground"
        >
          view contract on etherscan →
        </a>
      </div>

    </div>
  );
}
