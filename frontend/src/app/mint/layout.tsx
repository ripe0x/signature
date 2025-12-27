import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.ripe.wtf';

export const metadata: Metadata = {
  title: 'Mint - LESS',
  description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'Mint - LESS',
    description: 'Mint a LESS NFT - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: `${siteUrl}/less-og.png`,
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
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: 'LESS Mint',
      },
    ],
  },
};

export default function MintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}


