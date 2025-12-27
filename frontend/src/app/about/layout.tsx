import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.ripe.wtf';

export const metadata: Metadata = {
  title: 'About - LESS',
  description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'About - LESS',
    description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: 'LESS',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'About - LESS',
    description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: 'LESS',
      },
    ],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
