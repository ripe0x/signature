import { NextResponse } from 'next/server';

const LESS_STRATEGY = '0x9c2ca573009f181eac634c4d6e44a0977c24f335';

export async function GET() {
  try {
    // Fetch holder count from Etherscan (requires API key for reliability)
    const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
    const url = apiKey
      ? `https://api.etherscan.io/api?module=token&action=tokenholdercount&contractaddress=${LESS_STRATEGY}&apikey=${apiKey}`
      : `https://api.etherscan.io/api?module=token&action=tokenholdercount&contractaddress=${LESS_STRATEGY}`;

    const etherscanResponse = await fetch(url, {
      next: { revalidate: 60 },
    });

    if (!etherscanResponse.ok) {
      // Return null gracefully instead of erroring
      return NextResponse.json({ holderCount: null });
    }

    const etherscanData = await etherscanResponse.json();

    const holderCount = etherscanData.status === '1' && etherscanData.result
      ? parseInt(etherscanData.result, 10)
      : null;

    return NextResponse.json({ holderCount });
  } catch (error) {
    // Return null gracefully - holder count is non-critical
    return NextResponse.json({ holderCount: null });
  }
}
