'use client';

import { useAdminPanel } from '@/hooks/useAdminPanel';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { ContractStatusCard } from '@/components/admin/ContractStatusCard';
import { StrategyStatusCard } from '@/components/admin/StrategyStatusCard';
import { TwitterBotCard } from '@/components/admin/TwitterBotCard';
import { WithdrawCard } from '@/components/admin/WithdrawCard';

export default function AdminPage() {
  const {
    isAdmin,
    isConnected,
    // Contract state
    contractBalance,
    strategyBalance,
    strategyProgress,
    mintPrice,
    windowDuration,
    minEthForWindow,
    payoutRecipient,
    canCreateWindow,
    timeUntilFundsMoved,
    totalSupply,
    windowCount,
    // Withdraw
    withdraw,
    isWithdrawPending,
    isWithdrawConfirming,
    isWithdrawConfirmed,
    withdrawError,
    withdrawTxHash,
    resetWithdraw,
    // Twitter bot
    twitterBotState,
    twitterBotError,
    isLoadingBotState,
    fetchTwitterBotState,
    tweetPreview,
    previewTweet,
    isPreviewLoading,
    postTweet,
    isPostingTweet,
    postTweetResult,
    clearTweetPreview,
  } = useAdminPanel();

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-4xl mx-auto flex flex-col items-center justify-center gap-6 py-20">
            <p className="text-muted">connect wallet to access admin panel</p>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-20">
        <div className="px-6 md:px-8 py-12">
          <div className="max-w-4xl mx-auto flex flex-col items-center justify-center gap-4 py-20">
            <p className="text-muted">access denied</p>
            <p className="text-sm text-muted">admin only</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="px-6 md:px-8 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl mb-2">admin control center</h1>
            <p className="text-sm text-muted">manage contract, twitter bot, and withdrawals</p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ContractStatusCard
              contractBalance={contractBalance}
              mintPrice={mintPrice}
              windowDuration={windowDuration}
              minEthForWindow={minEthForWindow}
              payoutRecipient={payoutRecipient}
              totalSupply={totalSupply}
              windowCount={windowCount}
            />

            <StrategyStatusCard
              strategyBalance={strategyBalance}
              minEthForWindow={minEthForWindow}
              strategyProgress={strategyProgress}
              canCreateWindow={canCreateWindow}
              timeUntilFundsMoved={timeUntilFundsMoved}
            />
          </div>

          {/* Full width cards */}
          <TwitterBotCard
            botState={twitterBotState}
            botError={twitterBotError}
            isLoadingBotState={isLoadingBotState}
            onRefresh={fetchTwitterBotState}
            tweetPreview={tweetPreview}
            onPreview={previewTweet}
            isPreviewLoading={isPreviewLoading}
            onPost={postTweet}
            isPostingTweet={isPostingTweet}
            postResult={postTweetResult}
            onClearPreview={clearTweetPreview}
          />

          <WithdrawCard
            contractBalance={contractBalance}
            payoutRecipient={payoutRecipient}
            onWithdraw={withdraw}
            isWithdrawPending={isWithdrawPending}
            isWithdrawConfirming={isWithdrawConfirming}
            isWithdrawConfirmed={isWithdrawConfirmed}
            withdrawError={withdrawError}
            withdrawTxHash={withdrawTxHash}
            onReset={resetWithdraw}
          />
        </div>
      </div>
    </div>
  );
}
