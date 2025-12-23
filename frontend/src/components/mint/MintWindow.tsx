"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useMintWindow } from "@/hooks/useMintWindow";
import { useTokenStats } from "@/hooks/useTokenStats";
import { CountdownTimer } from "./CountdownTimer";
import { MintButton } from "./MintButton";
import { CONTRACTS } from "@/lib/contracts";
import {
  formatCountdown,
  formatEth,
  getAddressUrl,
  getTxUrl,
  generateUnicodeProgressBar,
} from "@/lib/utils";
import { useMemo, useRef, useEffect, useState } from "react";

// Unicode progress bar component that measures width and adjusts character count
function UnicodeProgressBar({
  percentage,
  className = "",
}: {
  percentage: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [barLength, setBarLength] = useState(20);
  const progressPercent = Math.min(percentage, 100);

  useEffect(() => {
    const measureWidth = () => {
      if (!containerRef.current) return;

      // Get computed styles
      const styles = window.getComputedStyle(containerRef.current);
      const fontSize = parseFloat(styles.fontSize);
      const padding =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const gap = parseFloat(styles.gap) || 8; // Default gap if not set

      // Measure a single character width (monospace, so all chars are same width)
      const measureChar = document.createElement("span");
      measureChar.style.position = "absolute";
      measureChar.style.visibility = "hidden";
      measureChar.style.fontFamily = styles.fontFamily;
      measureChar.style.fontSize = styles.fontSize;
      measureChar.textContent = "▓";
      document.body.appendChild(measureChar);
      const charWidth = measureChar.offsetWidth;
      document.body.removeChild(measureChar);

      // Calculate available width (subtract space for percentage display)
      const percentageWidth = 50; // Approximate width for "100.0%"
      const availableWidth =
        containerRef.current.offsetWidth - padding - gap - percentageWidth;

      // Calculate how many characters fit
      const charsThatFit = Math.floor(availableWidth / charWidth);
      setBarLength(Math.max(10, Math.min(charsThatFit, 50))); // Min 10, max 50 chars
    };

    measureWidth();

    // Re-measure on resize
    const resizeObserver = new ResizeObserver(measureWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const progressBar = generateUnicodeProgressBar(progressPercent, barLength);

  return (
    <div
      ref={containerRef}
      className={`w-full font-mono text-sm flex items-center gap-2 ${className}`}
    >
      <div className="flex-1">{progressBar}</div>
      <span>{progressPercent.toFixed(1)}%</span>
    </div>
  );
}

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
      <UnicodeProgressBar percentage={percentage} />
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

  const { windowCount, buybackBalance, tokenSupply, ethPrice } =
    useTokenStats();

  // Convert buyback balance to ETH (from wei)
  const buybackBalanceEth = Number(buybackBalance) / 1e18;

  // Calculate % of $LESS burned (initial supply is 1 billion with 18 decimals)
  const INITIAL_SUPPLY = BigInt(1_000_000_000) * BigInt(10 ** 18);
  const burnedAmount = INITIAL_SUPPLY - tokenSupply;
  const burnedPercent =
    Number((burnedAmount * BigInt(10000)) / INITIAL_SUPPLY) / 100;

  // Estimate trading volume needed to hit threshold (8% of fees go to buyback)
  const ethNeeded = Math.max(0, 0.25 - buybackBalanceEth);
  const volumeNeededEth = ethNeeded / 0.08;
  const volumeNeededUsd = ethPrice ? volumeNeededEth * ethPrice : null;

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
            mint window {nextWindowId} — ready to open
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
            <div className="text-muted mb-1">mint windows so far</div>
            <div className="text-2xl">{windowCount}</div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: Window closed and threshold not met (or cooldown in progress)
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl mb-2">mint LESS</h1>
        <p className="text-muted text-sm">
          {/* {windowCount} previous mint window{windowCount !== 1 ? "s" : ""} opened */}
          {burnedPercent > 0 && (
            <> · {burnedPercent.toFixed(2)}% of $LESS burned</>
          )}
        </p>
      </div>

      {/* Main status card */}
      <div className="max-w-md mx-auto">
        <div className="p-6 border border-border space-y-6">
          {/* Status */}
          <div className="text-center">
            {buybackBalanceEth >= 0.25 && cooldownRemaining > 0 ? (
              <>
                <p className="text-sm text-muted mb-1">
                  window {windowCount + 1} opens in
                </p>
                <p className="text-2xl font-mono">
                  {formatCountdown(cooldownRemaining)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted mb-1">
                  mint window {windowCount + 1} is waiting for threshold
                </p>
                <p className="text-lg">
                  {buybackBalanceEth.toFixed(4)} / 0.25 ETH
                </p>
              </>
            )}
          </div>

          {/* Progress bar - show when below threshold */}
          {buybackBalanceEth < 0.25 && (
            <div className="space-y-2">
              <UnicodeProgressBar
                percentage={Math.min((buybackBalanceEth / 0.25) * 100, 100)}
              />
              <p className="text-xs text-muted text-center">
                {ethNeeded.toFixed(4)} ETH until next window
                {volumeNeededUsd !== null && (
                  <span className="block mt-1 italic">
                    ~$
                    {volumeNeededUsd.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    worth of $LESS trading volume
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Balance progress - show when threshold met but syncing */}
          {buybackBalanceEth >= 0.25 && cooldownRemaining > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs gap-4">
                <span className="text-muted">balance</span>
                <span>{buybackBalanceEth.toFixed(4)} / 0.25 ETH</span>
              </div>
              <UnicodeProgressBar percentage={100} />
              <p className="text-xs text-muted text-start">
                <strong>threshold reached.</strong> awaiting next buy + burn
                window
              </p>
            </div>
          )}

          {/* How it works */}
          <div className="text-xs text-muted space-y-2 pt-4 border-t border-border">
            <p>
              trading fees from{" "}
              <a
                href={`https://www.nftstrategy.fun/strategies/${CONTRACTS.LESS_STRATEGY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                $LESS
              </a>{" "}
              accumulate until the 0.25 ETH threshold is reached. then anyone
              can trigger a burn to open a 90-minute mint window.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/collection">
          <button className="px-4 py-2 text-sm border border-border hover:border-foreground transition-colors">
            browse collection
          </button>
        </Link>
        <a
          href={`https://www.nftstrategy.fun/strategies/${CONTRACTS.LESS_STRATEGY}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="px-4 py-2 text-sm border border-border hover:border-foreground transition-colors">
            trade $LESS
          </button>
        </a>
      </div>

      {/* Contract link */}
      <div className="text-center">
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
  );
}
