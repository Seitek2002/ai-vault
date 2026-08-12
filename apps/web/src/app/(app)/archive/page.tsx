import type { Metadata } from "next";
import { ArchiveListClient } from "@/components/archive/ArchiveListClient";

export const metadata: Metadata = {
  title: "Архив — Vault",
};

export default function ArchivePage() {
  return <ArchiveListClient />;
}
