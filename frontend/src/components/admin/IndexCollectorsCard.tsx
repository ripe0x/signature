'use client';

export interface IndexerStatus {
  isIndexing: boolean;
  lastResult: {
    success: boolean;
    totalTokens?: number;
    totalCollectors?: number;
    fullCollectors?: number;
    duration?: number;
    error?: string;
    completedAt?: string;
  } | null;
}

interface IndexCollectorsCardProps {
  status: IndexerStatus | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onIndex: () => void;
  isIndexing: boolean;
}

export function IndexCollectorsCard({
  status,
  isLoading,
  error,
  onRefresh,
  onIndex,
  isIndexing,
}: IndexCollectorsCardProps) {
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'never';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="border border-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">collector indexer</h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          {isLoading ? 'loading...' : 'refresh'}
        </button>
      </div>

      {/* Status */}
      {error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : status ? (
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted">status</span>
            <span className={`font-mono ${status.isIndexing ? 'text-yellow-500' : 'text-foreground'}`}>
              {status.isIndexing ? 'indexing...' : 'idle'}
            </span>
          </div>
          {status.lastResult && (
            <>
              <div className="flex justify-between">
                <span className="text-muted">last run</span>
                <span className="font-mono text-xs">{formatDate(status.lastResult.completedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">result</span>
                <span className={`font-mono ${status.lastResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {status.lastResult.success ? 'success' : 'failed'}
                </span>
              </div>
              {status.lastResult.success && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted">total tokens</span>
                    <span className="font-mono">{status.lastResult.totalTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">collectors</span>
                    <span className="font-mono">{status.lastResult.totalCollectors}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">full collectors</span>
                    <span className="font-mono">{status.lastResult.fullCollectors}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">duration</span>
                    <span className="font-mono">{formatDuration(status.lastResult.duration)}</span>
                  </div>
                </>
              )}
              {status.lastResult.error && (
                <div className="text-xs text-red-500 mt-2">{status.lastResult.error}</div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted">loading status...</div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Run Indexer */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">run indexer</h3>
        <p className="text-xs text-muted">
          Re-indexes all tokens and rebuilds the collector leaderboard. This updates the data served by the image API.
        </p>
        <button
          onClick={onIndex}
          disabled={isIndexing || status?.isIndexing}
          className="w-full border border-border px-4 py-2 text-sm hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isIndexing || status?.isIndexing ? 'indexing...' : 'run indexer'}
        </button>
      </div>
    </div>
  );
}
