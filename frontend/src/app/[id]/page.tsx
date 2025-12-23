import { redirect, notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NumericRedirectPage({ params }: Props) {
  const { id } = await params;

  // Check if the id is a valid positive integer
  const tokenId = parseInt(id, 10);
  if (!isNaN(tokenId) && tokenId > 0 && String(tokenId) === id) {
    redirect(`/token/${id}`);
  }

  // For non-numeric IDs, return 404
  notFound();
}
