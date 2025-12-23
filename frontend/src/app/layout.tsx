import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/providers/Providers';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TokenPanel } from '@/components/layout/TokenPanel';

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
});

export const metadata: Metadata = {
  title: 'LESS',
  description: 'an onchain artwork about what remains when a system keeps taking things away',
  openGraph: {
    title: 'LESS',
    description: 'an onchain artwork about what remains when a system keeps taking things away',
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
    title: 'LESS',
    description: 'an onchain artwork about what remains when a system keeps taking things away',
    images: ['/less-logo.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body className="font-mono antialiased min-h-screen">
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
          <TokenPanel />
        </Providers>
      </body>
    </html>
  );
}
