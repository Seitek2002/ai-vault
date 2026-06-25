import type { Metadata } from "next";
import { ImportDropzone } from "@/components/import/ImportDropzone";

export const metadata: Metadata = {
  title: "Импорт — AI Vault",
};

export default function ImportPage() {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Импорт документа</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Загрузите PDF или DOCX — AI автоматически структурирует содержимое
        </p>
      </div>
      <ImportDropzone />
    </div>
  );
}
