import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collectors | LESS",
  description: "Leaderboard of LESS collectors ranked by tokens and windows collected",
  openGraph: {
    title: "Collectors | LESS",
    description: "Leaderboard of LESS collectors ranked by tokens and windows collected",
  },
};

export default function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
