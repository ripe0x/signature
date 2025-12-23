import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About - LESS',
  description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'About - LESS',
    description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
    type: 'website',
    images: [
      {
        url: '/less-logo.png',
        width: 1200,
        height: 630,
        alt: 'LESS',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About - LESS',
    description: 'Learn about LESS - an onchain artwork about what remains when a system keeps taking things away',
    images: ['/less-logo.png'],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

