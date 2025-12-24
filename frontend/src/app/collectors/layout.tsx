import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collectors | LESS",
  description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
  openGraph: {
    title: "Collectors | LESS",
    description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
    type: "website",
    images: [
      {
        url: "/less-logo.png",
        width: 1200,
        height: 630,
        alt: "LESS Collectors",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Collectors | LESS",
    description: "Leaderboard of LESS collectors ranked by windows and tokens collected",
    images: ["/less-logo.png"],
  },
};

export default function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
