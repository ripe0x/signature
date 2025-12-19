import { NextResponse } from 'next/server';

const LESS_STRATEGY = '0x9c2ca573009f181eac634c4d6e44a0977c24f335';

export async function GET() {
  try {
    // Fetch holder count from Etherscan
    const etherscanResponse = await fetch(
      `https://api.etherscan.io/api?module=token&action=tokenholdercount&contractaddress=${LESS_STRATEGY}`,
      { next: { revalidate: 60 } } // Cache for 60 seconds
    );
    const etherscanData = await etherscanResponse.json();

    const holderCount = etherscanData.status === '1' && etherscanData.result
      ? parseInt(etherscanData.result, 10)
      : null;

    return NextResponse.json({
      holderCount,
    });
  } catch (error) {
    console.error('Failed to fetch token stats:', error);
    return NextResponse.json({ holderCount: null }, { status: 500 });
  }
}
