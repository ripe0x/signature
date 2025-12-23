import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Collection - LESS',
  description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'Collection - LESS',
    description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: '/less-logo.png',
        width: 1200,
        height: 630,
        alt: 'LESS Collection',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Collection - LESS',
    description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
    images: ['/less-logo.png'],
  },
};

export default function CollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

