import { DocumentEditor } from "@/components/documents/DocumentEditor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Редактор документа — AI Vault" };

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocumentEditor documentId={id} />;
}
