import type { Metadata } from "next";

const imageApiUrl =
  process.env.NEXT_PUBLIC_IMAGE_API_URL || "https://fold-image-api.fly.dev";

// Fetch collector data to get token count for cache busting
async function getCollectorTokenCount(address: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${imageApiUrl}/api/collector/${address.toLowerCase()}`,
      { next: { revalidate: 60 } } // Cache for 60 seconds
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.tokenCount || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  // Get token count for cache busting - when tokens change, URL changes, forcing social platforms to refetch
  const tokenCount = await getCollectorTokenCount(address);
  const cacheBuster = tokenCount ? `?t=${tokenCount}` : "";
  const collectorGridUrl = `${imageApiUrl}/api/collector-grid/${address.toLowerCase()}${cacheBuster}`;

  return {
    title: `${shortAddress} | LESS Collector`,
    description: `View the LESS collection for ${shortAddress}`,
    openGraph: {
      title: `${shortAddress} | LESS Collector`,
      description: `View the LESS collection for ${shortAddress}`,
      type: "website",
      images: [
        {
          url: collectorGridUrl,
          width: 1200,
          height: 675,
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
          url: collectorGridUrl,
          width: 1200,
          height: 675,
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
