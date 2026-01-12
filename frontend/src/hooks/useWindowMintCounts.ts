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
 * Now uses pre-indexed API data instead of scanning all tokens via RPC
 */
export function useWindowMintCounts() {
  // Fetch window counts from API (eliminates N RPC calls for scanning)
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

  // Convert API response to Map format expected by consumers
  const windowMintCounts = useMemo(() => {
    if (!apiData?.windows) return new Map<number, number>();
    return new Map(apiData.windows.map(w => [w.windowId, w.mintCount]));
  }, [apiData]);

  return {
    windowMintCounts,
    isLoading,
    total: apiData?.totalTokens ?? 0,
  };
}
