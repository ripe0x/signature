'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

interface WindowCountsApiResponse {
  totalWindows: number;
  totalTokens: number;
  windows: Array<{
    windowId: number;
    mintCount: number;
    startTime: number | null;
    endTime: number | null;
  }>;
  generatedAt: number;
}

/**
 * Hook to get accurate mint counts per window
 * Uses pre-indexed API data
 */
export function useWindowMintCounts() {
  // Fetch window counts from API
  const {
    data: apiData,
    isLoading,
  } = useQuery<WindowCountsApiResponse>({
    queryKey: ['window-counts'],
    queryFn: async () => {
      const response = await fetch(`${IMAGE_API_URL}/api/window-counts`);
      if (!response.ok) {
        throw new Error('Failed to fetch window counts');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refresh every minute
  });

  // Convert API response to Map format
  const windowMintCounts = useMemo(() => {
    const map = new Map<number, number>();
    if (apiData?.windows) {
      for (const w of apiData.windows) {
        map.set(w.windowId, w.mintCount);
      }
    }
    return map;
  }, [apiData]);

  return {
    windowMintCounts,
    isLoading,
    total: apiData?.totalTokens ?? 0,
    // Debug: expose raw data
    _debug: { hasData: !!apiData, windowCount: apiData?.windows?.length ?? 0 },
  };
}
