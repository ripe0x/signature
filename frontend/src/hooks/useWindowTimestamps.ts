'use client';

import { useState, useEffect, useMemo } from 'react';
import { getWindowTimestampMap } from '@/data/windows';

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
  const [apiTimestamps, setApiTimestamps] = useState<Map<number, { start: number; end: number }> | null>(null);
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
        setApiTimestamps(map);
      } catch {
        // API failed, will use static fallback
        setApiTimestamps(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTimestamps();
  }, []);

  // Merge static fallback with API data (API takes precedence)
  const timestamps = useMemo(() => {
    const map = getWindowTimestampMap(); // Start with static data

    // Override/add API data if available
    if (apiTimestamps) {
      apiTimestamps.forEach((ts, windowId) => {
        map.set(windowId, ts);
      });
    }

    return map;
  }, [apiTimestamps]);

  return { timestamps, isLoading };
}

