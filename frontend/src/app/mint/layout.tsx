import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mint - LESS',
  description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'Mint - LESS',
    description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: '/less-logo.png',
        width: 1200,
        height: 630,
        alt: 'LESS Mint',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mint - LESS',
    description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
    images: ['/less-logo.png'],
  },
};

export default function MintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

