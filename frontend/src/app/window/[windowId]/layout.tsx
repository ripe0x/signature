import type { Metadata } from 'next';

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
          url: '/less-logo.png',
          width: 1200,
          height: 630,
          alt: `LESS Window ${windowIdNum}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Window ${windowIdNum} - LESS`,
      description: `View all pieces minted in window ${windowIdNum} - LESS collection`,
      images: ['/less-logo.png'],
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

