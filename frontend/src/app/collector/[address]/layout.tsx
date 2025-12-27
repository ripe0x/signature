import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://less.ripe.wtf";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `${shortAddress} | LESS Collector`,
    description: `View the LESS collection for ${shortAddress}`,
    openGraph: {
      title: `${shortAddress} | LESS Collector`,
      description: `View the LESS collection for ${shortAddress}`,
      type: "website",
      images: [
        {
          url: `${siteUrl}/less-og.png`,
          width: 2000,
          height: 2000,
          alt: `LESS Collector ${shortAddress}`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: `${shortAddress} | LESS Collector`,
      description: `View the LESS collection for ${shortAddress}`,
      images: [
        {
          url: `${siteUrl}/less-og.png`,
          width: 2000,
          height: 2000,
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
