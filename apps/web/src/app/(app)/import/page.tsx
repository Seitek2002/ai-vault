import type { Metadata } from "next";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Импорт — Vault",
};

export default function ImportPage() {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        title="Импорт документа"
        subtitle="Загрузите PDF или DOCX — содержимое структурируется автоматически"
      />
      <ImportDropzone />
    </div>
  );
}
