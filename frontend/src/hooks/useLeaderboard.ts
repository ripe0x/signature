'use client';

import { useState, useEffect } from 'react';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

export interface CollectorToken {
  tokenId: number;
  windowId: number;
  seed: string;
}

export interface Collector {
  address: string;
  tokenCount: number;
  windowsCollected: number[];
  windowCount: number;
  isFullCollector: boolean;
  lessBalance: string;
  tokens: CollectorToken[];
  rank?: number;
  totalWindows?: number;
}

export interface LeaderboardData {
  totalWindows: number;
  totalTokens: number;
  totalCollectors: number;
  fullCollectors: string[];
  collectors: Collector[];
  generatedAt: number;
  generatedAtISO: string;
}

export function useLeaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setIsLoading(true);

        // Try image-api first, fallback to static file
        let leaderboard: LeaderboardData;
        try {
          const apiResponse = await fetch(`${IMAGE_API_URL}/api/leaderboard`);
          if (!apiResponse.ok) {
            throw new Error('API unavailable');
          }
          leaderboard = await apiResponse.json();
        } catch {
          // Fallback to static JSON file
          const staticResponse = await fetch('/data/leaderboard.json');
          if (!staticResponse.ok) {
            throw new Error('Failed to fetch leaderboard');
          }
          leaderboard = await staticResponse.json();
        }

        setData(leaderboard);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();

    // Refresh every 5 minutes
    const interval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { data, isLoading, error };
}

export function useCollector(address: string) {
  const [data, setData] = useState<Collector | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    const fetchCollector = async () => {
      try {
        setIsLoading(true);
        const normalizedAddress = address.toLowerCase();

        // Try image-api first (has dedicated collector endpoint)
        try {
          const apiResponse = await fetch(`${IMAGE_API_URL}/api/collector/${normalizedAddress}`);
          if (apiResponse.ok) {
            const collector = await apiResponse.json();
            setData(collector);
            setError(null);
            return;
          }
          // 404 means collector not found, which is valid
          if (apiResponse.status === 404) {
            setData(null);
            setError(null);
            return;
          }
          throw new Error('API unavailable');
        } catch {
          // Fallback to static JSON and find collector
          const staticResponse = await fetch('/data/leaderboard.json');
          if (!staticResponse.ok) {
            throw new Error('Failed to fetch leaderboard');
          }

          const leaderboard: LeaderboardData = await staticResponse.json();
          const collectorIndex = leaderboard.collectors.findIndex(
            (c) => c.address.toLowerCase() === normalizedAddress
          );

          if (collectorIndex === -1) {
            setData(null);
          } else {
            const collector = leaderboard.collectors[collectorIndex];
            setData({
              ...collector,
              rank: collectorIndex + 1,
              totalWindows: leaderboard.totalWindows,
            });
          }
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollector();
  }, [address]);

  return { data, isLoading, error };
}
