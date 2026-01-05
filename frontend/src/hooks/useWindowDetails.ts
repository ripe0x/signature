'use client';

import { getWindowTimestamp } from '@/data/windows';
import { useWindowTimestamps } from './useWindowTimestamps';

export interface WindowDetails {
  windowId: number;
  startTime: number | null;
  endTime: number | null;
}

/**
 * Hook to get window timestamps
 * Uses static data immediately, updates from API if newer data available
 */
export function useWindowDetails(windowId: number): WindowDetails & { isLoading: boolean } {
  // Start with static data for immediate display
  const staticTimestamp = getWindowTimestamp(windowId);

  // Fetch from API (will update if there's newer data)
  const { timestamps, isLoading } = useWindowTimestamps();
  const apiTimestamp = timestamps.get(windowId);

  // Prefer API data if available, fall back to static
  const timestamp = apiTimestamp || (staticTimestamp ? { start: staticTimestamp.start, end: staticTimestamp.end } : null);

  return {
    windowId,
    startTime: timestamp?.start ?? null,
    endTime: timestamp?.end ?? null,
    isLoading,
  };
}
