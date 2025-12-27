import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://less.ripe.wtf";

export const metadata: Metadata = {
  title: "Collectors | LESS",
  description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
  openGraph: {
    title: "Collectors | LESS",
    description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
    type: "website",
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: "LESS Collectors",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Collectors | LESS",
    description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
    images: [
      {
        url: `${siteUrl}/less-og.png`,
        width: 2000,
        height: 2000,
        alt: "LESS Collectors",
      },
    ],
  },
};

export default function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
