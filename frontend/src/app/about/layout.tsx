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
        url: '/less-logo.png?v=2',
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
    images: ['/less-logo.png?v=2'],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}


