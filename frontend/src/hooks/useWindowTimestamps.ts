'use client';

import { useState, useEffect } from 'react';
import { WINDOW_TIMESTAMPS, getWindowTimestampMap } from '@/data/windows';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

export interface WindowTimestamp {
  windowId: number;
  startTime: number;
  endTime: number;
}

interface WindowsApiResponse {
  totalWindows: number;
  windows: WindowTimestamp[];
  generatedAt: number;
}

/**
 * Hook to fetch window timestamps from API with static fallback
 */
export function useWindowTimestamps() {
  const [timestamps, setTimestamps] = useState<Map<number, { start: number; end: number }>>(
    () => getWindowTimestampMap()
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTimestamps() {
      try {
        const response = await fetch(`${IMAGE_API_URL}/api/windows`);
        if (!response.ok) throw new Error('API unavailable');

        const data: WindowsApiResponse = await response.json();

        const map = new Map<number, { start: number; end: number }>();
        for (const w of data.windows) {
          map.set(w.windowId, { start: w.startTime, end: w.endTime });
        }
        setTimestamps(map);
      } catch {
        // Keep static fallback data (already set as initial state)
      } finally {
        setIsLoading(false);
      }
    }

    fetchTimestamps();
  }, []);

  return { timestamps, isLoading };
}

/**
 * Get timestamp for a specific window (from static data for immediate use)
 */
export function getWindowTimestamp(windowId: number): { start: number; end: number } | null {
  const w = WINDOW_TIMESTAMPS.find(w => w.windowId === windowId);
  return w ? { start: w.startTime, end: w.endTime } : null;
}
