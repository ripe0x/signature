import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.ripe.wtf';
const imageApiUrl = process.env.NEXT_PUBLIC_IMAGE_API_URL || 'https://fold-image-api.fly.dev';

interface Props {
  params: Promise<{ windowId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { windowId } = await params;
  const windowIdNum = parseInt(windowId, 10);

  if (isNaN(windowIdNum) || windowIdNum < 0) {
    return {
      title: 'Window - LESS',
      description: 'Mint window - LESS',
    };
  }

  const ogImageUrl = `${imageApiUrl}/api/window-grid/${windowIdNum}`;

  return {
    title: `Window ${windowIdNum} - LESS`,
    description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
    openGraph: {
      title: `Window ${windowIdNum} - LESS`,
      description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 675,
          alt: `LESS Window ${windowIdNum}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Window ${windowIdNum} - LESS`,
      description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 675,
          alt: `LESS Window ${windowIdNum}`,
        },
      ],
    },
  };
}

export default function WindowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}





