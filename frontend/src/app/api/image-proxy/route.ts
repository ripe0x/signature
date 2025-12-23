import { NextResponse } from 'next/server';

const IMAGE_API_URL = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const width = searchParams.get('width');
    const height = searchParams.get('height');

    if (!tokenId) {
      return NextResponse.json({ error: 'Missing tokenId parameter' }, { status: 400 });
    }

    // Build image API URL
    let imageUrl = `${IMAGE_API_URL}/images/${tokenId}`;
    const params = new URLSearchParams();
    if (width) params.append('width', width);
    if (height) params.append('height', height);
    if (params.toString()) {
      imageUrl += `?${params.toString()}`;
    }

    // Fetch image from image API
    const imageResponse = await fetch(imageUrl);
    
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image', status: imageResponse.status },
        { status: imageResponse.status }
      );
    }

    // Get image buffer
    const imageBuffer = await imageResponse.arrayBuffer();

    // Return image with proper headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return NextResponse.json(
      { error: 'Failed to proxy image', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

