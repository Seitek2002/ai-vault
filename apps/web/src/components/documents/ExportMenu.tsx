'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileText, FileType, RotateCcw } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { exportPdf, exportDocx, openOriginalFile } from '@/lib/api/export';

interface ExportMenuProps {
  documentId: string;
  documentTitle: string;
  hasOriginalFile?: boolean;
}

export function ExportMenu({ documentId, documentTitle, hasOriginalFile }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'pdf' | 'docx' | 'original' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handle(type: 'pdf' | 'docx' | 'original') {
    setLoading(type);
    setOpen(false);
    try {
      if (type === 'pdf') await exportPdf(documentId, documentTitle);
      else if (type === 'docx') await exportDocx(documentId, documentTitle);
      else await openOriginalFile(documentId);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading !== null}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
      >
        {loading ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
        <span className="hidden sm:inline">Экспорт</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg z-50 py-1 overflow-hidden animate-scale-in">
          <button
            onClick={() => void handle('pdf')}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
            Скачать PDF
          </button>

          <button
            onClick={() => void handle('docx')}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <FileType className="w-4 h-4 text-[var(--color-text-muted)]" />
            Скачать DOCX
          </button>

          {hasOriginalFile && (
            <>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <button
                onClick={() => void handle('original')}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-[var(--color-text-muted)]" />
                Оригинальный файл
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
