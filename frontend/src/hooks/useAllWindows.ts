'use client';

import { useMemo } from 'react';
import { useWindowMintCounts } from './useWindowMintCounts';
import { useWindowTimestamps } from './useWindowTimestamps';

export interface WindowSummary {
  windowId: number;
  tokenCount: number;
  startTime: number | null;
  endTime: number | null;
}

/**
 * Hook to fetch all windows with their summary data
 * Timestamps from API (with static fallback), token counts from chain
 */
export function useAllWindows() {
  const { windowMintCounts, isLoading: isLoadingCounts } = useWindowMintCounts();
  const { timestamps, isLoading: isLoadingTimestamps } = useWindowTimestamps();

  // Combine counts and timestamps into window summaries
  const windows: WindowSummary[] = useMemo(() => {
    const windowIds = Array.from(windowMintCounts.keys()).sort((a, b) => b - a);

    return windowIds.map((windowId) => ({
      windowId,
      tokenCount: windowMintCounts.get(windowId) || 0,
      startTime: timestamps.get(windowId)?.start ?? null,
      endTime: timestamps.get(windowId)?.end ?? null,
    }));
  }, [windowMintCounts, timestamps]);

  return {
    windows,
    isLoading: isLoadingCounts || isLoadingTimestamps,
    totalWindows: windows.length,
  };
}
