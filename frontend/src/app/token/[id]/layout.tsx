import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  
  if (isNaN(tokenId) || tokenId <= 0) {
    return {
      title: 'LESS - Token Not Found',
      description: 'Token not found',
    };
  }

  const imageUrl = `https://fold-image-api.fly.dev/images/${tokenId}?format=og`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://less.fun';

  return {
    title: `LESS #${tokenId}`,
    description: `LESS #${tokenId} - an onchain artwork about what remains when a system keeps taking things away`,
    openGraph: {
      title: `LESS #${tokenId}`,
      description: `LESS #${tokenId} - an onchain artwork about what remains when a system keeps taking things away`,
      type: 'website',
      url: `${siteUrl}/token/${tokenId}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `LESS #${tokenId}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `LESS #${tokenId}`,
      description: `LESS #${tokenId} - an onchain artwork about what remains when a system keeps taking things away`,
      images: [imageUrl],
    },
  };
}

export default function TokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

