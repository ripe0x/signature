import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.ripe.wtf';

interface Props {
  params: Promise<{ windowId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { windowId } = await params;
  const windowIdNum = parseInt(windowId, 10);

  if (isNaN(windowIdNum) || windowIdNum <= 0) {
    return {
      title: 'Window - LESS',
      description: 'Mint window - LESS',
    };
  }

  return {
    title: `Window ${windowIdNum} - LESS`,
    description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
    openGraph: {
      title: `Window ${windowIdNum} - LESS`,
      description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
      type: 'website',
      images: [
        {
          url: `${siteUrl}/less-og.png`,
          width: 2000,
          height: 2000,
          alt: `LESS Window ${windowIdNum}`,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: `Window ${windowIdNum} - LESS`,
      description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
      images: [
        {
          url: `${siteUrl}/less-og.png`,
          width: 2000,
          height: 2000,
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
