'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { CONTRACTS, EXTENSIONS_AUCTION_ABI } from '@/lib/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface ExtensionAuctionData {
  tokenId: number;
  amount: bigint;
  duration: number;
  firstBidTime: number;
  reservePrice: bigint;
  bidder: `0x${string}` | undefined;
  settled: boolean;
}

export interface ExtensionAuctionState {
  auctionCreated: boolean;
  active: boolean;
  ended: boolean;
  currentAuctionTokenId: number;
}

export function useExtensionAuction(tokenId: number) {
  const auctionAddress = CONTRACTS.EXTENSIONS_AUCTION;
  const isConfigured = auctionAddress !== ZERO_ADDRESS && tokenId > 0;

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'currentAuctionTokenId',
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'auctionCreated',
        args: [BigInt(tokenId)],
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'isAuctionActive',
        args: [BigInt(tokenId)],
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'auctions',
        args: [BigInt(tokenId)],
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'minReservePrice',
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'minBidIncrementPercentage',
      },
      {
        address: isConfigured ? auctionAddress : undefined,
        abi: EXTENSIONS_AUCTION_ABI,
        functionName: 'timeBuffer',
      },
    ],
    query: {
      enabled: isConfigured,
      staleTime: 15000,
      refetchInterval: 15000,
    },
  });

  const result = useMemo(() => {
    const currentAuctionTokenId = data?.[0]?.result ? Number(data[0].result) : 0;
    const auctionCreated = Boolean(data?.[1]?.result);
    const active = Boolean(data?.[2]?.result);

    const auctionStruct = data?.[3]?.result as
      | {
          tokenId: bigint;
          amount: bigint;
          duration: bigint;
          firstBidTime: bigint;
          reservePrice: bigint;
          bidder: `0x${string}`;
          settled: boolean;
        }
      | undefined;

    const auctionData: ExtensionAuctionData = {
      tokenId,
      amount: auctionStruct?.amount ?? BigInt(0),
      duration: Number(auctionStruct?.duration ?? BigInt(0)),
      firstBidTime: Number(auctionStruct?.firstBidTime ?? BigInt(0)),
      reservePrice: auctionStruct?.reservePrice ?? BigInt(0),
      bidder: auctionStruct?.bidder,
      settled: auctionStruct?.settled ?? false,
    };

    const ended = auctionCreated && !active && !auctionData.settled && auctionData.firstBidTime > 0;

    const minReservePrice = (data?.[4]?.result as bigint) ?? BigInt(0);
    const minBidIncrementPercentage = Number(data?.[5]?.result ?? 0);
    const timeBuffer = Number(data?.[6]?.result ?? 0);

    return {
      currentAuctionTokenId,
      auctionCreated,
      active,
      ended,
      minReservePrice,
      minBidIncrementPercentage,
      timeBuffer,
      auctionData,
    };
  }, [data, tokenId]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
    refetch,
    configured: isConfigured,
  };
}
