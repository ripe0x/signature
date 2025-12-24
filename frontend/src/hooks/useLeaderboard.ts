'use client';

import { useState, useEffect } from 'react';

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
        // Fetch from static JSON file in public/data/
        const response = await fetch('/data/leaderboard.json');

        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard');
        }

        const leaderboard = await response.json();
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
        // Fetch from static JSON and find collector
        const response = await fetch('/data/leaderboard.json');

        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard');
        }

        const leaderboard: LeaderboardData = await response.json();
        const normalizedAddress = address.toLowerCase();

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
