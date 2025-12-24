import type { Metadata } from "next";

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
