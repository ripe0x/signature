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
        url: "/less-logo.png?v=2",
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
    images: ["/less-logo.png?v=2"],
  },
};

export default function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
