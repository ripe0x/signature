import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.ripe.wtf';

export const metadata: Metadata = {
  title: 'Collection - LESS',
  description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'Collection - LESS',
    description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: 'LESS Collection',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Collection - LESS',
    description: 'Browse the LESS collection - an onchain artwork about what remains when a system keeps taking things away',
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: 'LESS Collection',
      },
    ],
  },
};

export default function CollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
