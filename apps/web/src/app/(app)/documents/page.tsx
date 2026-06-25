import type { Metadata } from "next";
import { DocumentsListClient } from "@/components/documents/DocumentsListClient";

export const metadata: Metadata = {
  title: "Документы — AI Vault",
};

export default function DocumentsPage() {
  return <DocumentsListClient />;
}
