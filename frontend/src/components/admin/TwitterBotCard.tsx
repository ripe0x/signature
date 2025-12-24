'use client';

import { useState } from 'react';
import type { TwitterBotState, TweetPreview } from '@/hooks/useAdminPanel';

interface TwitterBotCardProps {
  botState: TwitterBotState | null;
  botError: string | null;
  isLoadingBotState: boolean;
  onRefresh: () => void;
  tweetPreview: TweetPreview | null;
  onPreview: (type: 'balance' | 'window' | 'mint', params: { tokenId?: string; windowId?: string }) => void;
  isPreviewLoading: boolean;
  onPost: () => void;
  isPostingTweet: boolean;
  postResult: { success: boolean; error?: string } | null;
  onClearPreview: () => void;
}

type TweetType = 'balance' | 'window' | 'mint';

export function TwitterBotCard({
  botState,
  botError,
  isLoadingBotState,
  onRefresh,
  tweetPreview,
  onPreview,
  isPreviewLoading,
  onPost,
  isPostingTweet,
  postResult,
  onClearPreview,
}: TwitterBotCardProps) {
  const [tweetType, setTweetType] = useState<TweetType>('balance');
  const [tokenId, setTokenId] = useState('');
  const [windowId, setWindowId] = useState('');

  const handlePreview = () => {
    onPreview(tweetType, { tokenId, windowId });
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'never';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatUpdatedAt = (dateStr: string | undefined) => {
    if (!dateStr) return 'unknown';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="border border-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">twitter bot</h2>
        <button
          onClick={onRefresh}
          disabled={isLoadingBotState}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          {isLoadingBotState ? 'loading...' : 'refresh'}
        </button>
      </div>

      {/* Bot Status */}
      {botError ? (
        <div className="text-sm text-red-500">{botError}</div>
      ) : botState ? (
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted">last updated</span>
            <span className="font-mono text-xs">{formatUpdatedAt(botState.updatedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">processed windows</span>
            <span className="font-mono">{botState.processedWindows?.length || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">processed mints</span>
            <span className="font-mono">{botState.processedMints?.length || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">last balance post</span>
            <span className="font-mono text-xs">{formatDate(botState.lastBalanceProgressPost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">window ready alerted</span>
            <span className="font-mono">{botState.windowReadyAlerted ? 'yes' : 'no'}</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">loading bot state...</div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Manual Tweet */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">manual tweet</h3>

        {/* Type selector */}
        <div className="flex gap-2">
          {(['balance', 'window', 'mint'] as TweetType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setTweetType(type);
                onClearPreview();
              }}
              className={`px-3 py-1.5 text-sm border transition-colors ${
                tweetType === type
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border hover:border-foreground/50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Conditional inputs */}
        {tweetType === 'mint' && (
          <input
            type="number"
            placeholder="Token ID"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            className="w-full border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-foreground"
          />
        )}
        {tweetType === 'window' && (
          <input
            type="number"
            placeholder="Window ID"
            value={windowId}
            onChange={(e) => setWindowId(e.target.value)}
            className="w-full border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-foreground"
          />
        )}

        {/* Preview button */}
        <button
          onClick={handlePreview}
          disabled={isPreviewLoading || (tweetType === 'mint' && !tokenId) || (tweetType === 'window' && !windowId)}
          className="w-full border border-border px-4 py-2 text-sm hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPreviewLoading ? 'generating preview...' : 'preview tweet'}
        </button>

        {/* Preview display */}
        {tweetPreview && (
          <div className="space-y-3">
            <div className="border border-border p-4 bg-foreground/5">
              <div className="text-xs text-muted mb-2">preview:</div>
              <div className="font-mono text-xs whitespace-pre-wrap">{tweetPreview.text}</div>
            </div>

            <button
              onClick={onPost}
              disabled={isPostingTweet}
              className="w-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPostingTweet ? 'posting...' : 'post tweet'}
            </button>
          </div>
        )}

        {/* Result display */}
        {postResult && (
          <div
            className={`text-sm p-3 border ${
              postResult.success
                ? 'border-green-500/50 bg-green-500/10 text-green-500'
                : 'border-red-500/50 bg-red-500/10 text-red-500'
            }`}
          >
            {postResult.success ? 'Tweet posted successfully!' : `Error: ${postResult.error}`}
          </div>
        )}
      </div>
    </div>
  );
}
