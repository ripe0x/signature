import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://less.ripe.wtf";
const imageApiUrl = process.env.NEXT_PUBLIC_IMAGE_API_URL || "https://fold-image-api.fly.dev";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const collectorCardUrl = `${imageApiUrl}/api/collector-card/${address.toLowerCase()}`;

  return {
    title: `${shortAddress} | LESS Collector`,
    description: `View the LESS collection for ${shortAddress}`,
    openGraph: {
      title: `${shortAddress} | LESS Collector`,
      description: `View the LESS collection for ${shortAddress}`,
      type: "website",
      images: [
        {
          url: collectorCardUrl,
          width: 1200,
          height: 630,
          alt: `LESS Collector ${shortAddress}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${shortAddress} | LESS Collector`,
      description: `View the LESS collection for ${shortAddress}`,
      images: [
        {
          url: collectorCardUrl,
          width: 1200,
          height: 630,
          alt: `LESS Collector ${shortAddress}`,
        },
      ],
    },
  };
}

export default function CollectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
