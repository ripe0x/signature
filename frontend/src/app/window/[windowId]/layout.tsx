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
          url: '/less-logo.png?v=2',
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
      images: ['/less-logo.png?v=2'],
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

