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
        url: '/less-logo.png?v=2',
        width: 2000,
        height: 2000,
        alt: 'LESS Mint',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Mint - LESS',
    description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
    images: ['/less-logo.png?v=2'],
  },
};

export default function MintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}


