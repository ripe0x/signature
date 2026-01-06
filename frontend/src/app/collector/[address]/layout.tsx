import type { Metadata } from "next";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const imageApiUrl =
  process.env.NEXT_PUBLIC_IMAGE_API_URL || "https://fold-image-api.fly.dev";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Resolve ENS name to address or address to ENS name
async function resolveAddressAndEns(
  param: string
): Promise<{ address: string | null; ensName: string | null }> {
  const isEnsName = param.endsWith(".eth");

  try {
    if (isEnsName) {
      // Resolve ENS name to address
      const address = await publicClient.getEnsAddress({
        name: normalize(param),
      });
      return { address: address?.toLowerCase() || null, ensName: param };
    } else {
      // Try to get ENS name for address
      const ensName = await publicClient.getEnsName({
        address: param as `0x${string}`,
      });
      return { address: param.toLowerCase(), ensName };
    }
  } catch {
    return {
      address: isEnsName ? null : param.toLowerCase(),
      ensName: isEnsName ? param : null,
    };
  }
}

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
  const { address: addressParam } = await params;

  // Resolve ENS name to address or get ENS name for address
  const { address, ensName } = await resolveAddressAndEns(addressParam);

  if (!address) {
    return {
      title: "Collector Not Found | LESS",
      description: "This collector could not be found",
    };
  }

  // Use ENS name if available, otherwise truncated address
  const displayName = ensName || `${address.slice(0, 6)}...${address.slice(-4)}`;

  // Get token count for cache busting - when tokens change, URL changes, forcing social platforms to refetch
  const tokenCount = await getCollectorTokenCount(address);
  const cacheBuster = tokenCount ? `?t=${tokenCount}` : "";
  const collectorGridUrl = `${imageApiUrl}/api/collector-grid/${address}${cacheBuster}`;

  return {
    title: `${displayName} | LESS Collector`,
    description: `View the LESS collection for ${displayName}`,
    openGraph: {
      title: `${displayName} | LESS Collector`,
      description: `View the LESS collection for ${displayName}`,
      type: "website",
      images: [
        {
          url: collectorGridUrl,
          width: 1200,
          height: 675,
          alt: `LESS Collector ${displayName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} | LESS Collector`,
      description: `View the LESS collection for ${displayName}`,
      images: [
        {
          url: collectorGridUrl,
          width: 1200,
          height: 675,
          alt: `LESS Collector ${displayName}`,
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
