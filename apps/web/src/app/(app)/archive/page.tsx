import type { Metadata } from "next";
import { ArchiveDropzone } from "@/components/archive/ArchiveDropzone";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Архив — Vault",
};

export default function ArchivePage() {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        title="Архив документов"
        subtitle="Загрузите PDF — файл сохранится как есть и привяжется к компании"
      />
      <ArchiveDropzone />
    </div>
  );
}
